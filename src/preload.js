const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeClient: () => ipcRenderer.send('close-client'),
    onTogglePassthrough: (callback) => ipcRenderer.on('passthrough-toggled', (_event, value) => callback(value)),
    onSetBackgroundOpacity: (callback) => ipcRenderer.on('background-opacity', (_event, value) => callback(value)),
    onSetSortSelection: (callback) => ipcRenderer.on('sort-selection', (_event, value) => callback(value)),
    setBackgroundOpacity: (value) => ipcRenderer.send('set-background-opacity', value),
    setSortSelection: (value) => ipcRenderer.send('set-sort-selection', value),
});
