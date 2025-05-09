// Core application functionality
import { state } from './state/index.js';
import { LoadingManager } from './managers/LoadingManager.js';
import { modalManager } from './managers/ModalManager.js';
import { updateService } from './managers/UpdateService.js';
import { HeaderManager } from './components/Header.js';
import { settingsManager } from './managers/SettingsManager.js';
import { exampleImagesManager } from './managers/ExampleImagesManager.js';
import { showToast, initTheme, initBackToTop, lazyLoadImages } from './utils/uiHelpers.js';
import { initializeVirtualScroll } from './utils/virtualScroll.js';
import { migrateStorageItems } from './utils/storageHelpers.js';

// Core application class
export class AppCore {
    constructor() {
        this.initialized = false;
    }
    
    // Initialize core functionality
    async initialize() {
        if (this.initialized) return;

        console.log('AppCore: Initializing...');
        
        // Initialize managers
        state.loadingManager = new LoadingManager();
        modalManager.initialize();
        updateService.initialize();
        window.modalManager = modalManager;
        window.settingsManager = settingsManager;
        window.exampleImagesManager = exampleImagesManager;
        
        // Initialize UI components
        window.headerManager = new HeaderManager();
        initTheme();
        initBackToTop();
        
        // Initialize the example images manager
        exampleImagesManager.initialize();
        
        // Mark as initialized
        this.initialized = true;
        
        // Return the core instance for chaining
        return this;
    }
    
    // Get the current page type
    getPageType() {
        const body = document.body;
        return body.dataset.page || 'unknown';
    }
    
    // Show toast messages
    showToast(message, type = 'info') {
        showToast(message, type);
    }
    
    // Initialize common UI features based on page type
    initializePageFeatures() {
        const pageType = this.getPageType();
        
        // Initialize lazy loading for images on all pages
        lazyLoadImages();
        
        // Initialize virtual scroll for pages that need it
        if (['loras', 'recipes', 'checkpoints'].includes(pageType)) {
            initializeVirtualScroll(pageType);
        }
        
        return this;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Migrate localStorage items to use the namespace prefix
    migrateStorageItems();
});

// Create and export a singleton instance
export const appCore = new AppCore();

// Export common utilities for global use
export { showToast, lazyLoadImages, initializeVirtualScroll };