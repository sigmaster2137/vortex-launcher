const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimizeWindow: () => {
    try {
      ipcRenderer.send('window-minimize');
    } catch (e) {
      console.error('minimizeWindow error:', e);
    }
  },

  maximizeWindow: () => {
    try {
      ipcRenderer.send('window-maximize');
    } catch (e) {
      console.error('maximizeWindow error:', e);
    }
  },

  closeWindow: () => {
    try {
      ipcRenderer.send('window-close');
    } catch (e) {
      console.error('closeWindow error:', e);
    }
  },

  // File system
  openFolder: (folderPath) => {
    return ipcRenderer.invoke('open-folder', folderPath);
  },

  selectFolder: () => {
    return ipcRenderer.invoke('select-folder');
  },

  selectFile: (filters) => {
    return ipcRenderer.invoke('select-file', filters);
  },

  readFile: (filePath) => {
    return ipcRenderer.invoke('read-file', filePath);
  },

  writeFile: (filePath, content) => {
    return ipcRenderer.invoke('write-file', filePath, content);
  },

  // Minecraft
  getMinecraftPath: () => {
    return ipcRenderer.invoke('get-minecraft-path');
  },

  listInstances: () => {
    return ipcRenderer.invoke('list-instances');
  },

  createInstance: (options) => {
    return ipcRenderer.invoke('create-instance', options);
  },

  deleteInstance: (instanceId) => {
    return ipcRenderer.invoke('delete-instance', instanceId);
  },

  copyInstance: (sourceInstanceId, options) => {
    return ipcRenderer.invoke('copy-instance', sourceInstanceId, options);
  },

  findJava: () => {
    return ipcRenderer.invoke('find-java');
  },

  downloadJava: (version) => {
    return ipcRenderer.invoke('download-java', version);
  },

  launchMinecraft: (options) => {
    return ipcRenderer.invoke('launch-minecraft', options);
  },

  killMinecraft: () => {
    return ipcRenderer.invoke('kill-minecraft');
  },

  cancelDownload: () => {
    return ipcRenderer.invoke('cancel-download');
  },

  // Content
  downloadContent: (url, instanceId, folder, filename) => {
    return ipcRenderer.invoke('download-content', url, instanceId, folder, filename);
  },

  listInstalledContent: (instanceId, contentType) => {
    return ipcRenderer.invoke('list-installed-content', instanceId, contentType);
  },

  deleteContent: (filePath) => {
    return ipcRenderer.invoke('delete-content', filePath);
  },

  // Auth
  microsoftLogin: () => {
    return ipcRenderer.invoke('microsoft-login');
  },

  // System
  getSystemInfo: () => {
    return ipcRenderer.invoke('get-system-info');
  },

  // Data persistence
  saveData: (data) => {
    return ipcRenderer.invoke('save-data', data);
  },

  loadData: () => {
    return ipcRenderer.invoke('load-data');
  },

  // Events - with cleanup functions
  onMinecraftLog: (callback) => {
    const handler = (event, log) => callback(log);
    ipcRenderer.on('minecraft-log', handler);
    return () => ipcRenderer.removeListener('minecraft-log', handler);
  },

  onMinecraftClosed: (callback) => {
    const handler = (event, code) => callback(code);
    ipcRenderer.on('minecraft-closed', handler);
    return () => ipcRenderer.removeListener('minecraft-closed', handler);
  },

  onMinecraftError: (callback) => {
    const handler = (event, error) => callback(error);
    ipcRenderer.on('minecraft-error', handler);
    return () => ipcRenderer.removeListener('minecraft-error', handler);
  },

  onDownloadProgress: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  // Remove all listeners for a channel
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Platform detection
contextBridge.exposeInMainWorld('platform', {
  isWin: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
});

console.log('Preload script loaded successfully');
