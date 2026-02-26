const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snapcut', {
  // Snippets CRUD
  getSnippets: () => ipcRenderer.invoke('snippets:getAll'),
  createSnippet: (snippet) => ipcRenderer.invoke('snippets:create', snippet),
  updateSnippet: (id, snippet) => ipcRenderer.invoke('snippets:update', id, snippet),
  deleteSnippet: (id) => ipcRenderer.invoke('snippets:delete', id),
  searchSnippets: (query) => ipcRenderer.invoke('snippets:search', query),
  getCategories: () => ipcRenderer.invoke('snippets:getCategories'),
  createCategory: (name, color) => ipcRenderer.invoke('categories:create', name, color),
  updateCategory: (id, data) => ipcRenderer.invoke('categories:update', id, data),
  deleteCategory: (id) => ipcRenderer.invoke('categories:delete', id),
  renameCategory: (id, newName) => ipcRenderer.invoke('categories:rename', id, newName),
  getStats: () => ipcRenderer.invoke('stats:get'),
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Data management
  exportSnippets: () => ipcRenderer.invoke('data:export'),
  importSnippets: () => ipcRenderer.invoke('data:import'),
  clearExpansionHistory: () => ipcRenderer.invoke('data:clearHistory'),
  getDbInfo: () => ipcRenderer.invoke('data:dbInfo'),

  // Notify main process snippets changed (to refresh key listener)
  notifySnippetsChanged: () => ipcRenderer.send('snippets:changed'),

  // Clipboard
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),

  // Theme
  getTheme: () => ipcRenderer.invoke('theme:get'),
  toggleTheme: () => ipcRenderer.invoke('theme:toggle'),

  // Real-time expansion notifications (for live dashboard)
  onExpansionDone: (callback) => {
    ipcRenderer.on('expansion:done', callback);
    // Return cleanup function
    return () => ipcRenderer.removeListener('expansion:done', callback);
  },

  // ═══════════════════════════════════════════════════════════
  // Auto-Updater API (Self-Signing with Hash Verification)
  // ═══════════════════════════════════════════════════════════
  updater: {
    // Check for updates manually
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),

    // Download the update
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),

    // Install the downloaded update (quits app)
    installUpdate: () => ipcRenderer.invoke('updater:install'),

    // Get current app version
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),

    // Dismiss the update notification
    dismissUpdate: () => ipcRenderer.invoke('updater:dismiss'),

    // Event listeners (main → renderer)
    onUpdateAvailable: (callback) => {
      const handler = (_event, result) => callback(result);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },

    onDownloadProgress: (callback) => {
      const handler = (_event, progress) => callback(progress);
      ipcRenderer.on('update:download-progress', handler);
      return () => ipcRenderer.removeListener('update:download-progress', handler);
    },

    onUpdateDownloaded: (callback) => {
      const handler = (_event, info) => callback(info);
      ipcRenderer.on('update:downloaded', handler);
      return () => ipcRenderer.removeListener('update:downloaded', handler);
    },

    onUpdateError: (callback) => {
      const handler = (_event, info) => callback(info);
      ipcRenderer.on('update:error', handler);
      return () => ipcRenderer.removeListener('update:error', handler);
    },
  },
});
