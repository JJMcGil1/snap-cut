/**
 * SnapCut Key Listener
 * Monitors keyboard input globally and expands shortcuts.
 * Fires INSTANTLY when the typed buffer ends with a known shortcut.
 * No trigger key needed — type the shortcut, it expands.
 */

const { execFile, spawn } = require('child_process');
const { clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let buffer = '';
let snippetMap = {};
let shortcutList = [];  // sorted longest-first for greedy matching
let uiohook = null;
let active = false;
let expanding = false;  // prevent re-entry during expansion
let popSoundPath = null; // path to generated WAV file

// ── Pop Sound Generator ──
// Generates a short descending sine-wave "pop" as a WAV file
function generatePopSound() {
  const sampleRate = 44100;
  const duration = 0.10;        // 100ms
  const startFreq = 800;        // Hz
  const endFreq = 200;          // Hz
  const startVol = 0.15;
  const endVol = 0.01;
  const numSamples = Math.floor(sampleRate * duration);

  // 16-bit mono PCM samples
  const samples = Buffer.alloc(numSamples * 2);
  let phase = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;  // 0..1
    // Linear frequency sweep
    const freq = startFreq + (endFreq - startFreq) * t;
    // Linear volume fade
    const vol = startVol + (endVol - startVol) * t;

    phase += (2 * Math.PI * freq) / sampleRate;
    const sample = Math.sin(phase) * vol;

    // Convert to 16-bit signed integer
    const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    samples.writeInt16LE(int16, i * 2);
  }

  // Build WAV header (44 bytes) + data
  const dataSize = samples.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);                        // ChunkID
  header.writeUInt32LE(36 + dataSize, 4);          // ChunkSize
  header.write('WAVE', 8);                         // Format
  header.write('fmt ', 12);                        // Subchunk1ID
  header.writeUInt32LE(16, 16);                    // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);                     // AudioFormat (1=PCM)
  header.writeUInt16LE(1, 22);                     // NumChannels (mono)
  header.writeUInt32LE(sampleRate, 24);            // SampleRate
  header.writeUInt32LE(sampleRate * 2, 28);        // ByteRate (sampleRate * numChannels * bitsPerSample/8)
  header.writeUInt16LE(2, 32);                     // BlockAlign (numChannels * bitsPerSample/8)
  header.writeUInt16LE(16, 34);                    // BitsPerSample
  header.write('data', 36);                        // Subchunk2ID
  header.writeUInt32LE(dataSize, 40);              // Subchunk2Size

  const wav = Buffer.concat([header, samples]);

  // Write to temp directory
  const tmpPath = path.join(os.tmpdir(), 'snapcut-pop.wav');
  try {
    fs.writeFileSync(tmpPath, wav);
    popSoundPath = tmpPath;
    console.log('[SnapCut] Pop sound generated:', tmpPath);
  } catch (err) {
    console.error('[SnapCut] Failed to generate pop sound:', err.message);
  }
}

/**
 * Play the pop sound (fire-and-forget, detached).
 */
function playPopSound() {
  if (!popSoundPath) return;
  try {
    const child = spawn('afplay', [popSoundPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (err) {
    // Silently ignore — sound is non-critical
  }
}

// Map uiohook keycodes to characters
const KEYCODE_MAP = {
  // Letters a-z
  30: 'a', 48: 'b', 46: 'c', 32: 'd', 18: 'e', 33: 'f', 34: 'g', 35: 'h',
  23: 'i', 36: 'j', 37: 'k', 38: 'l', 50: 'm', 49: 'n', 24: 'o', 25: 'p',
  16: 'q', 19: 'r', 31: 's', 20: 't', 22: 'u', 47: 'v', 17: 'w', 45: 'x',
  21: 'y', 44: 'z',
  // Numbers 0-9
  11: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9',
  // Symbols
  12: '-', 13: '=', 26: '[', 27: ']', 43: '\\', 39: ';', 40: "'", 51: ',', 52: '.', 53: '/',
};

const BACKSPACE = 14;

/**
 * Run a single AppleScript that does backspaces + paste in one shot.
 * Uses execFile (async, no shell) — immune to EPIPE crashes.
 * Preserves the user's clipboard contents around the expansion.
 */
function runExpansion(deleteCount, expandedText) {
  // ── Play pop sound immediately (fire-and-forget) ──
  playPopSound();

  // ── Save current clipboard contents ──
  let savedText = null;
  let savedImage = null;
  try {
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) {
      savedImage = img;
    } else {
      savedText = clipboard.readText();
    }
  } catch {
    // If clipboard read fails, we'll just not restore
  }

  // Write expansion text to clipboard for paste
  clipboard.writeText(expandedText);

  // Single AppleScript: backspaces then immediate paste — no artificial delays
  const script = `tell application "System Events"
repeat ${deleteCount} times
key code 51
end repeat
keystroke "v" using command down
end tell`;

  execFile('osascript', ['-e', script], (err) => {
    // ── Restore clipboard after paste completes ──
    // Small delay to ensure paste has read the clipboard before we restore
    setTimeout(() => {
      try {
        if (savedImage) {
          clipboard.writeImage(savedImage);
        } else if (savedText !== null) {
          clipboard.writeText(savedText);
        } else {
          clipboard.clear();
        }
      } catch {
        // If restore fails, just leave it
      }
      expanding = false;
    }, 150);

    if (err) {
      console.error('[SnapCut] Expansion osascript failed:', err.message);
      expanding = false; // Unlock immediately on error
    }
  });
}

/**
 * Check if the end of the buffer matches any shortcut.
 * Returns the matched snippet or null.
 */
function checkBufferMatch() {
  const lower = buffer.toLowerCase();
  for (const key of shortcutList) {
    if (lower.endsWith(key)) {
      return { snippet: snippetMap[key], matchLen: key.length };
    }
  }
  return null;
}

/**
 * Update the snippet map without restarting the hook.
 */
function updateSnippets(snippets) {
  snippetMap = {};
  for (const s of snippets) {
    snippetMap[s.shortcut.toLowerCase()] = s;
  }
  // Sort longest-first so "dev12" matches before "dev1"
  shortcutList = Object.keys(snippetMap).sort((a, b) => b.length - a.length);
  console.log('[SnapCut] Snippet map updated with', shortcutList.length, 'shortcuts');
}

function startKeyListener(snippets, _expandCallback) {
  // Generate pop sound on first call
  if (!popSoundPath) {
    generatePopSound();
  }

  if (active) {
    updateSnippets(snippets);
    return;
  }

  snippetMap = {};
  for (const s of snippets) {
    snippetMap[s.shortcut.toLowerCase()] = s;
  }
  shortcutList = Object.keys(snippetMap).sort((a, b) => b.length - a.length);
  buffer = '';

  try {
    const { uIOhook } = require('uiohook-napi');
    uiohook = uIOhook;

    uiohook.on('keydown', (e) => {
      // Skip if we're in the middle of an expansion
      if (expanding) return;

      if (BACKSPACE === e.keycode) {
        buffer = buffer.slice(0, -1);
        return;
      }

      const char = KEYCODE_MAP[e.keycode];
      if (!char) {
        // Non-mappable key (shift, ctrl, etc.) — reset buffer on space/enter/tab/escape
        if ([57, 28, 15, 1].includes(e.keycode)) {
          buffer = '';
        }
        return;
      }

      buffer += char;
      // Keep buffer reasonable
      if (buffer.length > 50) buffer = buffer.slice(-30);

      // Check for match immediately after every keystroke
      const match = checkBufferMatch();
      if (match) {
        const { snippet, matchLen } = match;
        expanding = true;

        // Delete exactly the shortcut characters (no trigger key to delete)
        const deleteCount = matchLen;

        // Fire immediately — no artificial delay
        setImmediate(() => {
          runExpansion(deleteCount, snippet.body);

          // Increment usage
          try {
            const db = require('./database');
            db.incrementUsage(snippet.id);
          } catch {}
        });

        // Clear buffer after match
        buffer = '';
      }
    });

    uiohook.start();
    active = true;
    console.log('[SnapCut] Key listener started with', shortcutList.length, 'shortcuts (instant-fire mode)');
  } catch (err) {
    console.error('[SnapCut] Failed to start key listener:', err.message);
    console.log('[SnapCut] Text expansion will work via manual copy from the app.');
  }
}

function stopKeyListener() {
  if (uiohook && active) {
    try {
      uiohook.stop();
    } catch {}
    active = false;
  }
}

module.exports = { startKeyListener, stopKeyListener, updateSnippets };
