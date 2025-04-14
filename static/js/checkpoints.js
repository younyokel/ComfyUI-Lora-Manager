import { appCore } from './core.js';
import { initializeInfiniteScroll } from './utils/infiniteScroll.js';
import { confirmDelete, closeDeleteModal } from './utils/modalUtils.js';
import { createPageControls } from './components/controls/index.js';
import { loadMoreCheckpoints } from './api/checkpointApi.js';
import { CheckpointDownloadManager } from './managers/CheckpointDownloadManager.js';
import { CheckpointContextMenu } from './components/ContextMenu/index.js';

// Initialize the Checkpoints page
class CheckpointsPageManager {
    constructor() {
        // Initialize page controls
        this.pageControls = createPageControls('checkpoints');
        
        // Initialize checkpoint download manager
        window.checkpointDownloadManager = new CheckpointDownloadManager();
        
        // Expose only necessary functions to global scope
        this._exposeRequiredGlobalFunctions();
    }
    
    _exposeRequiredGlobalFunctions() {
        // Minimal set of functions that need to remain global
        window.confirmDelete = confirmDelete;
        window.closeDeleteModal = closeDeleteModal;
        
        // Add loadCheckpoints function to window for FilterManager compatibility
        window.checkpointManager = {
            loadCheckpoints: (reset) => loadMoreCheckpoints(reset)
        };
    }
    
    async initialize() {
        // Initialize page-specific components
        this.pageControls.restoreFolderFilter();
        this.pageControls.initFolderTagsVisibility();
        
        // Initialize context menu
        new CheckpointContextMenu();
        
        // Initialize infinite scroll
        initializeInfiniteScroll('checkpoints');
        
        // Initialize common page features
        appCore.initializePageFeatures();
        
        console.log('Checkpoints Manager initialized');
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize core application
    await appCore.initialize();
    
    // Initialize checkpoints page
    const checkpointsPage = new CheckpointsPageManager();
    await checkpointsPage.initialize();
});
