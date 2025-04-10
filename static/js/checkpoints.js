import { appCore } from './core.js';
import { state, getCurrentPageState } from './state/index.js';
import { 
    loadMoreCheckpoints, 
    resetAndReload, 
    refreshCheckpoints, 
    deleteCheckpoint,
    replaceCheckpointPreview
} from './api/checkpointApi.js';
import { 
    restoreFolderFilter, 
    toggleFolder, 
    openCivitai, 
    showToast 
} from './utils/uiHelpers.js';
import { confirmDelete, closeDeleteModal } from './utils/modalUtils.js';
import { toggleApiKeyVisibility } from './managers/SettingsManager.js';
import { initializeInfiniteScroll } from './utils/infiniteScroll.js';
import { setStorageItem, getStorageItem } from './utils/storageHelpers.js';

// Initialize the Checkpoints page
class CheckpointsPageManager {
    constructor() {
        // Get page state
        this.pageState = getCurrentPageState();
        
        // Set default values
        this.pageState.pageSize = 20;
        this.pageState.isLoading = false;
        this.pageState.hasMore = true;
        
        // Expose functions to window object
        this._exposeGlobalFunctions();
    }
    
    _exposeGlobalFunctions() {
        // API functions
        window.loadCheckpoints = (reset = true) => this.loadCheckpoints(reset);
        window.refreshCheckpoints = refreshCheckpoints;
        window.deleteCheckpoint = deleteCheckpoint;
        window.replaceCheckpointPreview = replaceCheckpointPreview;
        
        // UI helper functions
        window.toggleFolder = toggleFolder;
        window.openCivitai = openCivitai;
        window.confirmDelete = confirmDelete;
        window.closeDeleteModal = closeDeleteModal;
        window.toggleApiKeyVisibility = toggleApiKeyVisibility;
        
        // Add reference to this manager
        window.checkpointManager = this;
    }
    
    async initialize() {
        // Initialize event listeners
        this._initEventListeners();
        
        // Restore folder filters if available
        restoreFolderFilter('checkpoints');
        
        // Load sort preference
        this._loadSortPreference();
        
        // Load initial checkpoints
        await this.loadCheckpoints();
        
        // Initialize infinite scroll
        initializeInfiniteScroll('checkpoints');
        
        // Initialize common page features
        appCore.initializePageFeatures();
        
        console.log('Checkpoints Manager initialized');
    }
    
    _initEventListeners() {
        // Sort select handler
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', async (e) => {
                this.pageState.sortBy = e.target.value;
                this._saveSortPreference(e.target.value);
                await resetAndReload();
            });
        }
        
        // Folder tags handler
        document.querySelectorAll('.folder-tags .tag').forEach(tag => {
            tag.addEventListener('click', toggleFolder);
        });
        
        // Refresh button handler
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => refreshCheckpoints());
        }
    }
    
    _loadSortPreference() {
        const savedSort = getStorageItem('checkpoints_sort');
        if (savedSort) {
            this.pageState.sortBy = savedSort;
            const sortSelect = document.getElementById('sortSelect');
            if (sortSelect) {
                sortSelect.value = savedSort;
            }
        }
    }
    
    _saveSortPreference(sortValue) {
        setStorageItem('checkpoints_sort', sortValue);
    }
    
    // Load checkpoints with optional pagination reset
    async loadCheckpoints(resetPage = true) {
        await loadMoreCheckpoints(resetPage);
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
