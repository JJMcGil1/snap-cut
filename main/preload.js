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
});
