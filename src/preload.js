const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeClient: () => ipcRenderer.send('close-client'),
    onTogglePassthrough: (callback) => ipcRenderer.on('passthrough-toggled', (_event, value) => callback(value)),
    
    // Keybind management
    getKeybinds: () => ipcRenderer.invoke('get-keybinds'),
    updateKeybind: (keybindName, newShortcut) => ipcRenderer.invoke('update-keybind', keybindName, newShortcut),
    disableKeybinds: () => ipcRenderer.invoke('disable-keybinds'),
    enableKeybinds: () => ipcRenderer.invoke('enable-keybinds'),
    
    // Action triggers
    onTriggerPauseResume: (callback) => ipcRenderer.on('trigger-pause-resume', callback),
    onTriggerClearData: (callback) => ipcRenderer.on('trigger-clear-data', callback),
});
