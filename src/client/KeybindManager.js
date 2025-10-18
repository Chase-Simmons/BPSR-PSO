import { globalShortcut } from 'electron';
import window from './Window.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keybindsPath = path.join(__dirname, '../../keybinds.json');

/**
 * Manages all keyboard shortcuts for the application with remapping support.
 */
class KeybindManager {
    constructor() {
        this.defaultKeybinds = {
            // Window management
            togglePassthrough: 'Control+`',
            minimizeWindow: 'Control+Alt+Z',
            
            // Window resizing
            resizeUp: 'Control+Up',
            resizeDown: 'Control+Down',
            resizeLeft: 'Control+Left',
            resizeRight: 'Control+Right',
            
            // Window moving
            moveUp: 'Control+Alt+Up',
            moveDown: 'Control+Alt+Down',
            moveLeft: 'Control+Alt+Left',
            moveRight: 'Control+Alt+Right',
            
            // Application controls
            pauseResume: 'Control+[',
            clearData: 'Control+]'
        };
        
        this.keybinds = { ...this.defaultKeybinds };
        this.registeredShortcuts = new Map();
        this.callbacks = new Map();
        
        this.loadKeybinds();
    }

    /**
     * Register all default shortcuts
     */
    registerAllShortcuts() {
        this.registerShortcut('togglePassthrough', () => window.togglePassthrough());
        this.registerShortcut('minimizeWindow', () => window.minimizeOrRestore());
        
        this.registerShortcut('resizeUp', () => this.resizeWindow('up'));
        this.registerShortcut('resizeDown', () => this.resizeWindow('down'));
        this.registerShortcut('resizeLeft', () => this.resizeWindow('left'));
        this.registerShortcut('resizeRight', () => this.resizeWindow('right'));
        
        this.registerShortcut('moveUp', () => this.moveWindow('up'));
        this.registerShortcut('moveDown', () => this.moveWindow('down'));
        this.registerShortcut('moveLeft', () => this.moveWindow('left'));
        this.registerShortcut('moveRight', () => this.moveWindow('right'));
        
        this.registerShortcut('pauseResume', () => this.triggerPauseResume());
        this.registerShortcut('clearData', () => this.triggerClearData());
    }

    /**
     * Register a single shortcut
     */
    registerShortcut(keybindName, callback) {
        const shortcut = this.keybinds[keybindName];
        if (!shortcut) {
            console.warn(`Keybind '${keybindName}' not found`);
            return false;
        }

        // Unregister existing shortcut if it exists
        if (this.registeredShortcuts.has(keybindName)) {
            globalShortcut.unregister(this.registeredShortcuts.get(keybindName));
        }

        try {
            globalShortcut.register(shortcut, callback);
            this.registeredShortcuts.set(keybindName, shortcut);
            this.callbacks.set(keybindName, callback);
            return true;
        } catch (error) {
            console.error(`Failed to register shortcut '${shortcut}' for '${keybindName}':`, error);
            return false;
        }
    }

    /**
     * Update a keybind and re-register it
     */
    updateKeybind(keybindName, newShortcut) {
        if (!this.keybinds.hasOwnProperty(keybindName)) {
            console.warn(`Keybind '${keybindName}' not found`);
            return false;
        }

        // Check if the new shortcut is already in use
        for (const [name, shortcut] of Object.entries(this.keybinds)) {
            if (name !== keybindName && shortcut === newShortcut) {
                console.warn(`Shortcut '${newShortcut}' is already in use by '${name}'`);
                return false;
            }
        }

        this.keybinds[keybindName] = newShortcut;
        
        // Re-register the shortcut if it was previously registered
        if (this.callbacks.has(keybindName)) {
            const success = this.registerShortcut(keybindName, this.callbacks.get(keybindName));
            if (success) {
                this.saveKeybinds();
            }
            return success;
        }
        
        this.saveKeybinds();
        return true;
    }

    /**
     * Get all keybinds
     */
    getAllKeybinds() {
        return { ...this.keybinds };
    }

    /**
     * Get a specific keybind
     */
    getKeybind(keybindName) {
        return this.keybinds[keybindName];
    }

    /**
     * Unregister all shortcuts
     */
    unregisterAll() {
        globalShortcut.unregisterAll();
        this.registeredShortcuts.clear();
        this.callbacks.clear();
    }

    /**
     * Temporarily disable all keybinds (for recording mode)
     */
    disableAllKeybinds() {
        globalShortcut.unregisterAll();
    }

    /**
     * Re-enable all keybinds after recording
     */
    reEnableAllKeybinds() {
        // Re-register all shortcuts
        this.registerAllShortcuts();
    }

    /**
     * Window resizing helper
     */
    resizeWindow(direction) {
        const RESIZE_INCREMENT = 20;
        const [width, height] = window.getSize();
        
        switch (direction) {
            case 'up':
                const newHeight = Math.max(40, height - RESIZE_INCREMENT);
                window.setSize(width, newHeight);
                break;
            case 'down':
                window.setSize(width, height + RESIZE_INCREMENT);
                break;
            case 'left':
                const newWidth = Math.max(280, width - RESIZE_INCREMENT);
                window.setSize(newWidth, height);
                break;
            case 'right':
                window.setSize(width + RESIZE_INCREMENT, height);
                break;
        }
    }

    /**
     * Window moving helper
     */
    moveWindow(direction) {
        const MOVE_INCREMENT = 20;
        const [x, y] = window.getPosition();
        
        switch (direction) {
            case 'up':
                window.setPosition(x, y - MOVE_INCREMENT);
                break;
            case 'down':
                window.setPosition(x, y + MOVE_INCREMENT);
                break;
            case 'left':
                window.setPosition(x - MOVE_INCREMENT, y);
                break;
            case 'right':
                window.setPosition(x + MOVE_INCREMENT, y);
                break;
        }
    }

    /**
     * Trigger pause/resume action
     */
    triggerPauseResume() {
        // Send IPC message to renderer process
        const mainWindow = window.getWindow();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('trigger-pause-resume');
        }
    }

    /**
     * Trigger clear data action
     */
    triggerClearData() {
        // Send IPC message to renderer process
        const mainWindow = window.getWindow();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('trigger-clear-data');
        }
    }

    /**
     * Load keybinds from file
     */
    loadKeybinds() {
        try {
            if (fs.existsSync(keybindsPath)) {
                const rawData = fs.readFileSync(keybindsPath, 'utf8');
                const savedKeybinds = JSON.parse(rawData);
                
                // Merge saved keybinds with defaults, only keeping valid keybinds
                for (const [key, value] of Object.entries(savedKeybinds)) {
                    if (this.defaultKeybinds.hasOwnProperty(key)) {
                        this.keybinds[key] = value;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load keybinds, using defaults:', error);
        }
    }

    /**
     * Save keybinds to file
     */
    saveKeybinds() {
        try {
            fs.writeFileSync(keybindsPath, JSON.stringify(this.keybinds, null, 2));
        } catch (error) {
            console.error('Failed to save keybinds:', error);
        }
    }
}

export default new KeybindManager();
