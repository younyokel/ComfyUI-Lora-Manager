import { appCore } from './core.js';
import { state } from './state/index.js';
import { showLoraModal, toggleShowcase, scrollToTop } from './components/loraModal/index.js';
import { updateCardsForBulkMode } from './components/LoraCard.js';
import { bulkManager } from './managers/BulkManager.js';
import { DownloadManager } from './managers/DownloadManager.js';
import { toggleApiKeyVisibility } from './managers/SettingsManager.js';
import { moveManager } from './managers/MoveManager.js';
import { LoraContextMenu } from './components/ContextMenu.js';
import { createPageControls } from './components/controls/index.js';
import { confirmDelete, closeDeleteModal } from './utils/modalUtils.js';

// Initialize the LoRA page
class LoraPageManager {
    constructor() {
        // Add bulk mode to state
        state.bulkMode = false;
        state.selectedLoras = new Set();
        
        // Initialize managers
        this.downloadManager = new DownloadManager();
        
        // Initialize page controls
        this.pageControls = createPageControls('loras');
        
        // Expose necessary functions to the page that still need global access
        // These will be refactored in future updates
        this._exposeRequiredGlobalFunctions();
    }
    
    _exposeRequiredGlobalFunctions() {
        // Only expose what's still needed globally
        // Most functionality is now handled by the PageControls component
        window.showLoraModal = showLoraModal;
        window.confirmDelete = confirmDelete;
        window.closeDeleteModal = closeDeleteModal;
        window.toggleApiKeyVisibility = toggleApiKeyVisibility;
        window.downloadManager = this.downloadManager;
        window.moveManager = moveManager;
        window.toggleShowcase = toggleShowcase;
        window.scrollToTop = scrollToTop;
        
        // Bulk operations
        window.toggleBulkMode = () => bulkManager.toggleBulkMode();
        window.clearSelection = () => bulkManager.clearSelection();
        window.toggleCardSelection = (card) => bulkManager.toggleCardSelection(card);
        window.copyAllLorasSyntax = () => bulkManager.copyAllLorasSyntax();
        window.updateSelectedCount = () => bulkManager.updateSelectedCount();
        window.bulkManager = bulkManager;
    }
    
    async initialize() {
        // Initialize page-specific components
        this.pageControls.restoreFolderFilter();
        this.pageControls.initFolderTagsVisibility();
        new LoraContextMenu();
        
        // Initialize cards for current bulk mode state (should be false initially)
        updateCardsForBulkMode(state.bulkMode);
        
        // Initialize the bulk manager
        bulkManager.initialize();
        
        // Initialize common page features (lazy loading, infinite scroll)
        appCore.initializePageFeatures();
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize core application
    await appCore.initialize();
    
    // Initialize page-specific functionality
    const loraPage = new LoraPageManager();
    await loraPage.initialize();
});