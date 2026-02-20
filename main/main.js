const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, globalShortcut, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { startKeyListener, stopKeyListener } = require('./keylistener');

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
  const iconPath = path.join(__dirname, 'trayIcon.png');
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
  createWindow();
  createTray();

  // Auto-start on login (only for packaged builds)
  if (!isDev) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }

  // Start global key listener for snippet expansion
  const snippets = db.getAllSnippets();
  startKeyListener(snippets);

  // Refresh snippet map when snippets change
  ipcMain.on('snippets:changed', () => {
    const updated = db.getAllSnippets();
    startKeyListener(updated);
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
