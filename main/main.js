const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, globalShortcut, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { startKeyListener, stopKeyListener } = require('./keylistener');
const {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getCurrentVersion,
  getLastFoundUpdateInfo,
} = require('./auto-updater');

// ── Safety net: prevent EPIPE / stream errors from crashing the app ──
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.error('[SnapCut] Suppressed stream error:', err.message);
    return; // swallow it — don't crash
  }
  console.error('[SnapCut] Uncaught exception:', err);
  // Re-throw non-EPIPE errors so they still show up
  throw err;
});

let mainWindow = null;
let tray = null;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 660,
    minWidth: 700,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f12' : '#ffffff',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // macOS auto-picks @2x when filename contains "Template"
  const iconPath = path.join(__dirname, 'trayIconTemplate.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('SnapCut — Text Expander');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open SnapCut', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// ── IPC Handlers ──
ipcMain.handle('snippets:getAll', () => db.getAllSnippets());
ipcMain.handle('snippets:create', (_e, snippet) => db.createSnippet(snippet));
ipcMain.handle('snippets:update', (_e, id, snippet) => db.updateSnippet(id, snippet));
ipcMain.handle('snippets:delete', (_e, id) => db.deleteSnippet(id));
ipcMain.handle('snippets:search', (_e, query) => db.searchSnippets(query));
ipcMain.handle('snippets:getCategories', () => db.getCategories());
ipcMain.handle('categories:create', (_e, name, color) => db.createCategory(name, color));
ipcMain.handle('categories:update', (_e, id, data) => db.updateCategory(id, data));
ipcMain.handle('categories:delete', (_e, id) => db.deleteCategory(id));
ipcMain.handle('categories:rename', (_e, id, newName) => db.renameCategory(id, newName));
ipcMain.handle('stats:get', () => db.getStats());
ipcMain.handle('settings:get', (_e, key) => db.getSetting(key));
ipcMain.handle('settings:set', (_e, key, value) => db.setSetting(key, value));

ipcMain.handle('data:export', async () => {
  const data = db.exportAllSnippets();
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Snippets',
    defaultPath: `snapcut-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { cancelled: true };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return { success: true, count: data.snippets.length };
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Snippets',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { cancelled: true };
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    const result = db.importSnippets(data);
    return { success: true, count: result.count };
  } catch (err) {
    return { error: err.message || 'Invalid file' };
  }
});

ipcMain.handle('data:clearHistory', () => db.clearExpansionHistory());
ipcMain.handle('data:dbInfo', () => db.getDbInfo());

ipcMain.handle('theme:get', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('theme:toggle', () => {
  nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? 'light' : 'dark';
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(text);
  return true;
});

// ── App Lifecycle ──
app.whenReady().then(() => {
  // Set Dock icon (macOS ignores BrowserWindow `icon` for the Dock)
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = path.join(__dirname, '..', 'build', 'icon.png');
    try {
      app.dock.setIcon(nativeImage.createFromPath(dockIconPath));
    } catch {}
  }

  createWindow();
  createTray();

  // Auto-start on login (only for packaged builds)
  if (!isDev) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }

  // Notify renderer when an expansion completes (for real-time dashboard)
  const notifyExpansion = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('expansion:done');
    }
  };

  // Start global key listener for snippet expansion
  const snippets = db.getAllSnippets();
  startKeyListener(snippets, notifyExpansion);

  // Refresh snippet map when snippets change
  ipcMain.on('snippets:changed', () => {
    const updated = db.getAllSnippets();
    startKeyListener(updated);
  });

  // ═══════════════════════════════════════════════════════════
  // Auto-Updater IPC Handlers (Self-Signing with Hash Verification)
  // ═══════════════════════════════════════════════════════════

  // Store for update info
  let currentUpdateInfo = null;

  // Initialize auto-updater
  initAutoUpdater(mainWindow);

  // Check for updates
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await checkForUpdates();
      if (result.updateInfo) {
        currentUpdateInfo = result.updateInfo;
      }
      return result;
    } catch (error) {
      console.error('[Updater] Check failed:', error);
      return {
        updateAvailable: false,
        currentVersion: getCurrentVersion(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Download update
  ipcMain.handle('updater:download', async () => {
    // Use stored info, or fallback to auto-updater's last found info
    const updateInfo = currentUpdateInfo || getLastFoundUpdateInfo();
    if (!updateInfo) {
      return { success: false, error: 'No update available' };
    }
    return downloadUpdate(updateInfo);
  });

  // Install update
  ipcMain.handle('updater:install', async () => {
    return installUpdate();
  });

  // Get current version
  ipcMain.handle('updater:getVersion', () => {
    return getCurrentVersion();
  });

  // Dismiss update notification
  ipcMain.handle('updater:dismiss', () => {
    console.log('[Updater] Update dismissed by user');
    return { success: true };
  });

  app.on('activate', () => {
    if (mainWindow) mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopKeyListener();
});
