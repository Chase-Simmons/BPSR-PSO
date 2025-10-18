import keybindManager from './KeybindManager.js';

/**
 * Registers all global keyboard shortcuts for the application.
 */
export function registerShortcuts() {
    keybindManager.registerAllShortcuts();
}

/**
 * Get the keybind manager instance for external access
 */
export { keybindManager };
