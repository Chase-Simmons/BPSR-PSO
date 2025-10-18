import { app, ipcMain } from 'electron';
import { keybindManager } from './shortcuts.js';

ipcMain.on('close-client', (event) => {
    app.quit();
});

// Keybind management IPC handlers
ipcMain.handle('get-keybinds', async (event) => {
    return keybindManager.getAllKeybinds();
});

ipcMain.handle('update-keybind', async (event, keybindName, newShortcut) => {
    return keybindManager.updateKeybind(keybindName, newShortcut);
});

ipcMain.handle('disable-keybinds', async (event) => {
    keybindManager.disableAllKeybinds();
});

ipcMain.handle('enable-keybinds', async (event) => {
    keybindManager.reEnableAllKeybinds();
});
