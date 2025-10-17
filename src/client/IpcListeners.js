import { app, ipcMain } from 'electron';

ipcMain.on('close-client', (event) => {
    app.quit();
});

ipcMain.on('set-background-opacity', async (event, value) => {
    const { default: window } = await import('./Window.js');
    window.setBackgroundOpacity(value);
});

ipcMain.on('set-sort-selection', async (event, value) => {
    const { default: window } = await import('./Window.js');
    window.setSortSelection(value);
});
