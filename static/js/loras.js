import { appCore } from './core.js';
import { state } from './state/index.js';
import { showLoraModal, toggleShowcase, scrollToTop } from './components/loraModal/index.js';
import { loadMoreLoras, fetchCivitai, deleteModel, replacePreview, resetAndReload, refreshLoras } from './api/loraApi.js';
import { 
    restoreFolderFilter, 
    toggleFolder,
    copyTriggerWord,
    openCivitai,
    toggleFolderTags,
    initFolderTagsVisibility,
} from './utils/uiHelpers.js';
import { confirmDelete, closeDeleteModal } from './utils/modalUtils.js';
import { DownloadManager } from './managers/DownloadManager.js';
import { toggleApiKeyVisibility } from './managers/SettingsManager.js';
import { LoraContextMenu } from './components/ContextMenu.js';
import { moveManager } from './managers/MoveManager.js';
import { updateCardsForBulkMode } from './components/LoraCard.js';
import { bulkManager } from './managers/BulkManager.js';
import { setStorageItem, getStorageItem, getSessionItem, removeSessionItem } from './utils/storageHelpers.js';

// Initialize the LoRA page
class LoraPageManager {
    constructor() {
        // Add bulk mode to state
        state.bulkMode = false;
        state.selectedLoras = new Set();
        
        // Initialize managers
        this.downloadManager = new DownloadManager();
        
        // Expose necessary functions to the page
        this._exposeGlobalFunctions();
    }
    
    _exposeGlobalFunctions() {
        // Only expose what's needed for the page
        window.loadMoreLoras = loadMoreLoras;
        window.fetchCivitai = fetchCivitai;
        window.deleteModel = deleteModel;
        window.replacePreview = replacePreview;
        window.toggleFolder = toggleFolder;
        window.copyTriggerWord = copyTriggerWord;
        window.showLoraModal = showLoraModal;
        window.confirmDelete = confirmDelete;
        window.closeDeleteModal = closeDeleteModal;
        window.refreshLoras = refreshLoras;
        window.openCivitai = openCivitai;
        window.toggleFolderTags = toggleFolderTags;
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
        this.initEventListeners();
        restoreFolderFilter();
        initFolderTagsVisibility();
        new LoraContextMenu();
        
        // Check for custom filters from recipe page navigation
        this.checkCustomFilters();
        
        // Initialize cards for current bulk mode state (should be false initially)
        updateCardsForBulkMode(state.bulkMode);
        
        // Initialize the bulk manager
        bulkManager.initialize();
        
        // Initialize common page features (lazy loading, infinite scroll)
        appCore.initializePageFeatures();
    }

    // Check for custom filter parameters in session storage
    checkCustomFilters() {
        const filterLoraHash = getSessionItem('recipe_to_lora_filterLoraHash');
        const filterLoraHashes = getSessionItem('recipe_to_lora_filterLoraHashes');
        const filterRecipeName = getSessionItem('filterRecipeName');
        const viewLoraDetail = getSessionItem('viewLoraDetail');

        console.log("Checking custom filters...");
        console.log("filterLoraHash:", filterLoraHash);
        console.log("filterLoraHashes:", filterLoraHashes);
        console.log("filterRecipeName:", filterRecipeName);
        console.log("viewLoraDetail:", viewLoraDetail);
        
        if ((filterLoraHash || filterLoraHashes) && filterRecipeName) {
            // Found custom filter parameters, set up the custom filter
            
            // Show the filter indicator
            const indicator = document.getElementById('customFilterIndicator');
            const filterText = indicator.querySelector('.customFilterText');
            
            if (indicator && filterText) {
                indicator.classList.remove('hidden');
                
                // Set text content with recipe name
                const filterType = filterLoraHash && viewLoraDetail ? "Viewing LoRA from" : "Viewing LoRAs from";
                const displayText = `${filterType}: ${filterRecipeName}`;
                
                filterText.textContent = this._truncateText(displayText, 30);
                filterText.setAttribute('title', displayText);
                
                // Add click handler for the clear button
                const clearBtn = indicator.querySelector('.clear-filter');
                if (clearBtn) {
                    clearBtn.addEventListener('click', this.clearCustomFilter);
                }

                // Add pulse animation
                const filterElement = indicator.querySelector('.filter-active');
                if (filterElement) {
                    filterElement.classList.add('animate');
                    setTimeout(() => filterElement.classList.remove('animate'), 600);
                }
            }
            
            // If we're viewing a specific LoRA detail, set up to open the modal
            if (filterLoraHash && viewLoraDetail) {
                // Store this to fetch after initial load completes
                state.pendingLoraHash = filterLoraHash;
            }
        }
    }
    
    // Helper to truncate text with ellipsis
    _truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }
    
    // Clear the custom filter and reload the page
    clearCustomFilter = async () => {
        console.log("Clearing custom filter...");
        // Remove filter parameters from session storage
        removeSessionItem('recipe_to_lora_filterLoraHash');
        removeSessionItem('recipe_to_lora_filterLoraHashes');
        removeSessionItem('filterRecipeName');
        removeSessionItem('viewLoraDetail');
        
        // Hide the filter indicator
        const indicator = document.getElementById('customFilterIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
        
        // Reset state
        if (state.pendingLoraHash) {
            delete state.pendingLoraHash;
        }
        
        // Reload the loras
        await resetAndReload();
    }
    
    loadSortPreference() {
        const savedSort = getStorageItem('loras_sort');
        if (savedSort) {
            state.sortBy = savedSort;
            const sortSelect = document.getElementById('sortSelect');
            if (sortSelect) {
                sortSelect.value = savedSort;
            }
        }
    }

    saveSortPreference(sortValue) {
        setStorageItem('loras_sort', sortValue);
    }

	initEventListeners() {
		const sortSelect = document.getElementById('sortSelect');
		if (sortSelect) {
			sortSelect.value = state.sortBy;
			this.loadSortPreference();
			sortSelect.addEventListener('change', async (e) => {
				state.sortBy = e.target.value;
				this.saveSortPreference(e.target.value);
				await resetAndReload();
			});
		}

		document.querySelectorAll('.folder-tags .tag').forEach(tag => {
			tag.addEventListener('click', toggleFolder);
		});
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