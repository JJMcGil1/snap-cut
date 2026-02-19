/**
 * SnapCut Key Listener
 * Monitors keyboard input globally and expands shortcuts.
 * Fires INSTANTLY when the typed buffer ends with a known shortcut.
 * No trigger key needed — type the shortcut, it expands.
 */

const { execFile } = require('child_process');
const { clipboard } = require('electron');

let buffer = '';
let snippetMap = {};
let shortcutList = [];  // sorted longest-first for greedy matching
let uiohook = null;
let active = false;
let expanding = false;  // prevent re-entry during expansion

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
 */
function runExpansion(deleteCount, expandedText) {
  clipboard.writeText(expandedText);

  // Single AppleScript: backspaces then immediate paste — no artificial delays
  const script = `tell application "System Events"
repeat ${deleteCount} times
key code 51
end repeat
keystroke "v" using command down
end tell`;

  execFile('osascript', ['-e', script], (err) => {
    expanding = false;
    if (err) {
      console.error('[SnapCut] Expansion osascript failed:', err.message);
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
