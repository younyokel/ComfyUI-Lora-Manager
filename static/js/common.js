import { toggleTheme, initTheme } from './utils/uiHelpers.js';
import { modalManager } from './managers/ModalManager.js';
import { updateService } from './managers/UpdateService.js';
import { SettingsManager } from './managers/SettingsManager.js';

// Export common functions
export function initializeCommonComponents() {
    modalManager.initialize();
    updateService.initialize();
    initTheme();
    
    // Initialize common controls
    window.toggleTheme = toggleTheme;
    window.modalManager = modalManager;
    window.settingsManager = new SettingsManager();
}
