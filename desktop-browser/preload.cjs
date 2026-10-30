const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('leaxBrowser', Object.freeze({
  navigate: address => ipcRenderer.invoke('leax:navigate', String(address || '')),
  history: direction => ipcRenderer.invoke('leax:history', direction),
  reload: () => ipcRenderer.invoke('leax:reload'),
  devtools: () => ipcRenderer.invoke('leax:devtools'),
  extensions: () => ipcRenderer.invoke('leax:extensions'),
  clearAndClose: () => ipcRenderer.invoke('leax:clear-close'),
  stopAI: () => ipcRenderer.invoke('leax:ai-stop'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('leax:state', listener);
    return () => ipcRenderer.removeListener('leax:state', listener);
  }
}));
