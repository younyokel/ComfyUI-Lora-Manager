// Core application functionality
import { state, initSettings } from './state/index.js';
import { LoadingManager } from './managers/LoadingManager.js';
import { modalManager } from './managers/ModalManager.js';
import { updateService } from './managers/UpdateService.js';
import { HeaderManager } from './components/Header.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { showToast, initTheme, initBackToTop, updatePanelPositions, lazyLoadImages } from './utils/uiHelpers.js';
import { initializeInfiniteScroll } from './utils/infiniteScroll.js';

// Core application class
export class AppCore {
    constructor() {
        this.initialized = false;
    }
    
    // Initialize core functionality
    async initialize() {
        if (this.initialized) return;
        
        // Initialize settings
        initSettings();
        
        // Initialize managers
        state.loadingManager = new LoadingManager();
        modalManager.initialize();
        updateService.initialize();
        window.modalManager = modalManager;
        window.settingsManager = new SettingsManager();
        
        // Initialize UI components
        window.headerManager = new HeaderManager();
        initTheme();
        initBackToTop();
        
        // Set up event listeners
        window.addEventListener('resize', updatePanelPositions);
        
        // Initial positioning
        updatePanelPositions();
        
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
        
        // Initialize infinite scroll for pages that need it
        if (['loras', 'recipes', 'checkpoints'].includes(pageType)) {
            initializeInfiniteScroll(pageType);
        }
        
        // Update panel positions
        updatePanelPositions();
        
        return this;
    }
}

// Create and export a singleton instance
export const appCore = new AppCore();

// Export common utilities for global use
export { showToast, modalManager, state, lazyLoadImages, initializeInfiniteScroll }; 