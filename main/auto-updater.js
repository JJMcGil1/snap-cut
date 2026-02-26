const { app, BrowserWindow, dialog } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

// ═══════════════════════════════════════════════════════════
// Auto-Updater with Self-Signing (Hash Verification)
// No certificates needed — just SHA256 hash verification
// ═══════════════════════════════════════════════════════════

// Configuration — GitHub Releases
const UPDATE_CONFIG = {
  owner: 'JJMcGil1',
  repo: 'snap-cut',
  checkInterval: 5 * 60 * 1000, // 5 minutes
  autoCheck: true,
};

let mainWindow = null;
let isDownloading = false;
let downloadedFilePath = null;
let lastFoundUpdateInfo = null;

/**
 * Get the last found update info (for use when auto-check finds an update)
 */
function getLastFoundUpdateInfo() {
  return lastFoundUpdateInfo;
}

/**
 * Initialize the auto-updater with the main window reference
 */
function initAutoUpdater(window) {
  mainWindow = window;

  // Check for updates on startup (after a small delay)
  if (UPDATE_CONFIG.autoCheck && app.isPackaged) {
    setTimeout(() => {
      checkForUpdates().catch(console.error);
    }, 5000);
  }

  // Set up periodic update checks (production only)
  if (app.isPackaged) {
    setInterval(() => {
      checkForUpdates().catch(console.error);
    }, UPDATE_CONFIG.checkInterval);
  }
}

/**
 * Get current app version from package.json
 */
function getCurrentVersion() {
  return app.getVersion();
}

/**
 * Compare two semver version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Fetch latest release from GitHub Releases API
 */
function fetchGitHubRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases/latest`,
      headers: {
        'User-Agent': 'SnapCut-AutoUpdater',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    const request = https.get(options, (response) => {
      if (response.statusCode === 404) {
        reject(new Error('No releases found'));
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`GitHub API returned status ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response from GitHub'));
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('GitHub API request timed out'));
    });
  });
}

/**
 * Get the appropriate asset for the current platform and architecture
 */
function getPlatformAsset(assets) {
  const platform = process.platform;
  const arch = process.arch;

  console.log(`[AutoUpdater] Looking for asset: platform=${platform}, arch=${arch}`);

  // First pass: try to find exact architecture match
  for (const asset of assets) {
    const name = asset.name.toLowerCase();

    if (platform === 'darwin') {
      const isArm = name.includes('arm64') || name.includes('aarch64');
      const isX64 = name.includes('x64') || name.includes('x86_64') || name.includes('intel');

      if (name.endsWith('.dmg')) {
        if (arch === 'arm64' && isArm) {
          console.log(`[AutoUpdater] Found arm64 DMG: ${asset.name}`);
          return asset;
        }
        if (arch === 'x64' && (isX64 || (!isArm && !isX64))) {
          console.log(`[AutoUpdater] Found x64/universal DMG: ${asset.name}`);
          return asset;
        }
      }
    } else if (platform === 'win32') {
      if (name.endsWith('.exe')) {
        console.log(`[AutoUpdater] Found Windows exe: ${asset.name}`);
        return asset;
      }
    } else if (platform === 'linux') {
      if (name.endsWith('.appimage')) {
        console.log(`[AutoUpdater] Found Linux AppImage: ${asset.name}`);
        return asset;
      }
    }
  }

  // Second pass: fallback to any matching platform asset
  for (const asset of assets) {
    const name = asset.name.toLowerCase();
    if (platform === 'darwin' && name.endsWith('.dmg')) {
      console.log(`[AutoUpdater] Fallback DMG: ${asset.name}`);
      return asset;
    }
    if (platform === 'win32' && name.endsWith('.exe')) return asset;
    if (platform === 'linux' && name.endsWith('.appimage')) return asset;
  }

  console.log('[AutoUpdater] No suitable asset found!');
  return null;
}

/**
 * Find the latest.json asset which contains SHA256 hashes
 */
function fetchLatestJson(assets) {
  const latestJsonAsset = assets.find((a) => a.name === 'latest.json');
  if (!latestJsonAsset) return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = new URL(latestJsonAsset.browser_download_url);

    const request = https.get(url, {
      headers: { 'User-Agent': 'SnapCut-AutoUpdater' },
    }, (response) => {
      // Handle GitHub redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, (redirectResponse) => {
            let data = '';
            redirectResponse.on('data', (chunk) => { data += chunk; });
            redirectResponse.on('end', () => {
              try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
          }).on('error', () => resolve(null));
          return;
        }
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });

    request.on('error', () => resolve(null));
    request.setTimeout(10000, () => {
      request.destroy();
      resolve(null);
    });
  });
}

/**
 * Fetch update info from GitHub Releases
 */
async function fetchUpdateInfo() {
  const release = await fetchGitHubRelease();

  // Get the appropriate download asset for this platform
  const asset = getPlatformAsset(release.assets);
  if (!asset) {
    throw new Error(`No compatible release found for ${process.platform}`);
  }

  // Try to get latest.json for SHA256 hashes
  const latestJson = await fetchLatestJson(release.assets);

  // Extract version from tag (remove 'v' prefix if present)
  const version = release.tag_name.replace(/^v/, '');

  // Get SHA256 hash from latest.json if available
  let sha256 = '';
  if (latestJson) {
    const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
    const platformData = latestJson.platforms?.[platform];
    if (platformData?.sha256) {
      sha256 = platformData.sha256;
    } else if (latestJson.sha256) {
      sha256 = latestJson.sha256;
    }
  }

  return {
    version,
    url: asset.browser_download_url,
    sha256,
    releaseNotes: release.body || 'Bug fixes and improvements.',
    releaseDate: release.published_at,
  };
}

/**
 * Check for available updates
 */
async function checkForUpdates() {
  const currentVersion = getCurrentVersion();

  console.log('[AutoUpdater] Checking for updates...');
  console.log('[AutoUpdater] Current version:', currentVersion);

  try {
    const updateInfo = await fetchUpdateInfo();
    console.log('[AutoUpdater] Latest version:', updateInfo.version);

    const updateAvailable = compareVersions(updateInfo.version, currentVersion) > 0;

    const result = {
      updateAvailable,
      currentVersion,
      latestVersion: updateInfo.version,
      updateInfo: updateAvailable ? updateInfo : undefined,
    };

    // Store and notify renderer if update is available
    if (updateAvailable) {
      lastFoundUpdateInfo = updateInfo;
      console.log('[AutoUpdater] Update available! Notifying renderer...');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:available', result);
      }
    }

    return result;
  } catch (error) {
    console.error('[AutoUpdater] Update check failed:', error);
    return {
      updateAvailable: false,
      currentVersion,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Download a file with progress tracking
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const request = client.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(destPath);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = {
          percent: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0,
          transferred: downloadedSize,
          total: totalSize,
        };
        onProgress(progress);
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    request.setTimeout(300000, () => { // 5 minute timeout
      request.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

/**
 * Calculate SHA256 hash of a file
 */
function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Download and verify the update
 */
async function downloadUpdate(updateInfo) {
  if (isDownloading) {
    return { success: false, error: 'Download already in progress' };
  }

  isDownloading = true;
  console.log('[AutoUpdater] Starting download...');

  try {
    // Create temp directory for download
    const tempDir = path.join(os.tmpdir(), 'snapcut-update');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Determine file extension from URL
    const urlPath = new URL(updateInfo.url).pathname;
    const ext = path.extname(urlPath) || '.zip';
    const fileName = `snapcut-${updateInfo.version}${ext}`;
    const downloadPath = path.join(tempDir, fileName);

    // Download with progress
    await downloadFile(updateInfo.url, downloadPath, (progress) => {
      console.log(`[AutoUpdater] Download progress: ${progress.percent}%`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:download-progress', progress);
      }
    });

    console.log('[AutoUpdater] Download complete, verifying hash...');

    // Verify hash (only if we have one from latest.json)
    if (updateInfo.sha256) {
      const fileHash = await calculateFileHash(downloadPath);
      console.log('[AutoUpdater] Expected hash:', updateInfo.sha256);
      console.log('[AutoUpdater] Actual hash:', fileHash);

      if (fileHash.toLowerCase() !== updateInfo.sha256.toLowerCase()) {
        // Delete the corrupted/tampered file
        fs.unlinkSync(downloadPath);

        const error = 'Hash verification failed! The download may be corrupted or tampered with.';
        console.error('[AutoUpdater]', error);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:error', { error });
        }

        return { success: false, error };
      }

      console.log('[AutoUpdater] Hash verified successfully!');
    } else {
      console.log('[AutoUpdater] No hash available, skipping verification');
    }

    downloadedFilePath = downloadPath;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:downloaded', { filePath: downloadPath });
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AutoUpdater] Download failed:', errorMessage);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:error', { error: errorMessage });
    }

    return { success: false, error: errorMessage };
  } finally {
    isDownloading = false;
  }
}

/**
 * Install the downloaded update
 * This will quit the app and run the installer
 */
async function installUpdate() {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    return { success: false, error: 'No update downloaded' };
  }

  console.log('[AutoUpdater] Installing update from:', downloadedFilePath);

  try {
    const ext = path.extname(downloadedFilePath).toLowerCase();
    const { execSync, spawn } = require('child_process');

    if (process.platform === 'darwin') {
      // macOS: Seamless DMG install
      if (ext === '.dmg') {
        const mountPoint = '/Volumes/SnapCut-Update';
        const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '');
        const appName = 'SnapCut.app';

        console.log('[AutoUpdater] Current app path:', appPath);

        // Unmount if already mounted (from previous failed attempt)
        try {
          execSync(`hdiutil detach "${mountPoint}" -quiet -force 2>/dev/null || true`);
        } catch {
          // Ignore errors
        }

        // Mount the DMG silently
        console.log('[AutoUpdater] Mounting DMG...');
        try {
          execSync(`hdiutil attach "${downloadedFilePath}" -mountpoint "${mountPoint}" -nobrowse -quiet`);
        } catch (err) {
          throw new Error('Failed to mount DMG');
        }

        // Find the .app in the mounted DMG
        const mountedFiles = fs.readdirSync(mountPoint);
        const newApp = mountedFiles.find((f) => f.endsWith('.app'));
        if (!newApp) {
          execSync(`hdiutil detach "${mountPoint}" -quiet -force`);
          throw new Error('No app found in DMG');
        }

        const newAppPath = path.join(mountPoint, newApp);
        console.log('[AutoUpdater] Found new app:', newAppPath);

        // Create a shell script that will:
        // 1. Wait for the current app to quit
        // 2. Copy the new app to /Applications
        // 3. Launch the new app
        // 4. Clean up
        const updateScript = `#!/bin/bash
# Wait for the app to quit (check every 0.5 seconds, max 30 seconds)
for i in {1..60}; do
  if ! pgrep -x "SnapCut" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# Small delay to ensure file handles are released
sleep 1

# Remove old app and copy new one
rm -rf "${appPath}"
cp -R "${newAppPath}" "${path.dirname(appPath)}/"

# Unmount the DMG
hdiutil detach "${mountPoint}" -quiet -force 2>/dev/null || true

# Remove the downloaded DMG
rm -f "${downloadedFilePath}"

# Launch the new app
open "${appPath}"
`;

        // Write and execute the update script
        const scriptPath = path.join(os.tmpdir(), 'snapcut-update.sh');
        fs.writeFileSync(scriptPath, updateScript, { mode: 0o755 });

        console.log('[AutoUpdater] Running update script...');
        spawn('/bin/bash', [scriptPath], {
          detached: true,
          stdio: 'ignore',
        }).unref();

        // Quit the app to let the script do its work
        setTimeout(() => {
          app.quit();
        }, 500);

        return { success: true };
      }
    } else if (process.platform === 'win32') {
      // Windows: Run the installer silently
      spawn(downloadedFilePath, ['/S'], { detached: true, shell: true });

      setTimeout(() => {
        app.quit();
      }, 1000);
    } else {
      // Linux: Replace AppImage and relaunch
      const currentAppImage = process.env.APPIMAGE;
      if (currentAppImage) {
        // Make new AppImage executable
        fs.chmodSync(downloadedFilePath, '755');

        // Replace the old AppImage
        fs.copyFileSync(downloadedFilePath, currentAppImage);

        // Launch the new version
        spawn(currentAppImage, [], { detached: true, stdio: 'ignore' }).unref();
      }

      setTimeout(() => {
        app.quit();
      }, 1000);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AutoUpdater] Install failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getCurrentVersion,
  getLastFoundUpdateInfo,
};
