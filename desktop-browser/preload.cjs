const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('leaxBrowser', Object.freeze({
  assistant: body => ipcRenderer.invoke('leax:assistant',body),
  robotSize: expanded => ipcRenderer.invoke('leax:robot-size',expanded),
  robotMove: (x,y) => ipcRenderer.invoke('leax:robot-move',x,y),
  newTab: () => ipcRenderer.invoke('leax:tab-new'),
  selectTab: id => ipcRenderer.invoke('leax:tab-select',String(id)),
  closeTab: id => ipcRenderer.invoke('leax:tab-close',String(id)),
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
