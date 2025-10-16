import { app, ipcMain, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, '../resources/app.ico');
const preloadPath = path.join(__dirname, '../preload.js');
const historyHtmlPath = path.join(__dirname, '../public/history.html');

let historyWindow = null;

ipcMain.on('close-client', (event) => {
    app.quit();
});

ipcMain.on('open-history-window', (event) => {
    if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.focus();
        return;
    }

    // Get the main window's opacity setting
    const mainWindow = BrowserWindow.fromWebContents(event.sender);
    const mainWindowOpacity = mainWindow.webContents.executeJavaScript(`
        document.documentElement.style.getPropertyValue('--main-bg-opacity') || '0.05'
    `);

    historyWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        transparent: true,
        frame: false,
        title: 'Fight History - BPSR-PSO',
        icon: iconPath,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoMenuBar: false,
        parent: mainWindow,
        modal: false,
    });

    historyWindow.setAlwaysOnTop(true, 'normal');
    historyWindow.setMovable(true);
    historyWindow.loadFile(historyHtmlPath);

    // Sync opacity settings from main window
    mainWindowOpacity.then(opacity => {
        historyWindow.webContents.executeJavaScript(`
            document.documentElement.style.setProperty('--main-bg-opacity', '${opacity}');
        `);
    });

    historyWindow.on('closed', () => {
        historyWindow = null;
    });

    // Listen for opacity changes from main window and sync to history window
    const syncOpacity = () => {
        if (historyWindow && !historyWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`
                document.documentElement.style.getPropertyValue('--main-bg-opacity') || '0.05'
            `).then(opacity => {
                historyWindow.webContents.executeJavaScript(`
                    document.documentElement.style.setProperty('--main-bg-opacity', '${opacity}');
                `);
            });
        }
    };

    // Set up periodic opacity sync
    const opacitySyncInterval = setInterval(syncOpacity, 1000);
    
    historyWindow.on('closed', () => {
        clearInterval(opacitySyncInterval);
        historyWindow = null;
    });
});
