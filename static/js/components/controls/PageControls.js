// PageControls.js - Manages controls for both LoRAs and Checkpoints pages
import { state, getCurrentPageState, setCurrentPageType } from '../../state/index.js';
import { getStorageItem, setStorageItem } from '../../utils/storageHelpers.js';
import { showToast } from '../../utils/uiHelpers.js';

/**
 * PageControls class - Unified control management for model pages
 */
export class PageControls {
    constructor(pageType) {
        // Set the current page type in state
        setCurrentPageType(pageType);
        
        // Store the page type
        this.pageType = pageType;
        
        // Get the current page state
        this.pageState = getCurrentPageState();
        
        // Initialize state based on page type
        this.initializeState();
        
        // Store API methods
        this.api = null;
        
        // Initialize event listeners
        this.initEventListeners();
        
        console.log(`PageControls initialized for ${pageType} page`);
    }
    
    /**
     * Initialize state based on page type
     */
    initializeState() {
        // Set default values
        this.pageState.pageSize = 20; 
        this.pageState.isLoading = false;
        this.pageState.hasMore = true;
        
        // Load sort preference
        this.loadSortPreference();
    }
    
    /**
     * Register API methods for the page
     * @param {Object} api - API methods for the page
     */
    registerAPI(api) {
        this.api = api;
        console.log(`API methods registered for ${this.pageType} page`);
    }
    
    /**
     * Initialize event listeners for controls
     */
    initEventListeners() {
        // Sort select handler
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = this.pageState.sortBy;
            sortSelect.addEventListener('change', async (e) => {
                this.pageState.sortBy = e.target.value;
                this.saveSortPreference(e.target.value);
                await this.resetAndReload();
            });
        }
        
        // Use event delegation for folder tags - this is the key fix
        const folderTagsContainer = document.querySelector('.folder-tags-container');
        if (folderTagsContainer) {
            folderTagsContainer.addEventListener('click', (e) => {
                const tag = e.target.closest('.tag');
                if (tag) {
                    this.handleFolderClick(tag);
                }
            });
        }
        
        // Refresh button handler
        const refreshBtn = document.querySelector('[data-action="refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshModels());
        }
        
        // Toggle folders button
        const toggleFoldersBtn = document.querySelector('.toggle-folders-btn');
        if (toggleFoldersBtn) {
            toggleFoldersBtn.addEventListener('click', () => this.toggleFolderTags());
        }
        
        // Clear custom filter handler
        const clearFilterBtn = document.querySelector('.clear-filter');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', () => this.clearCustomFilter());
        }
        
        // Page-specific event listeners
        this.initPageSpecificListeners();
    }
    
    /**
     * Initialize page-specific event listeners
     */
    initPageSpecificListeners() {
        // Fetch from Civitai button - available for both loras and checkpoints
        const fetchButton = document.querySelector('[data-action="fetch"]');
        if (fetchButton) {
            fetchButton.addEventListener('click', () => this.fetchFromCivitai());
        }
        
        const downloadButton = document.querySelector('[data-action="download"]');
        if (downloadButton) {
            downloadButton.addEventListener('click', () => this.showDownloadModal());
        }
        
        if (this.pageType === 'loras') {
            // Bulk operations button - LoRAs only
            const bulkButton = document.querySelector('[data-action="bulk"]');
            if (bulkButton) {
                bulkButton.addEventListener('click', () => this.toggleBulkMode());
            }
        }
    }
    
    /**
     * Toggle folder selection
     * @param {HTMLElement} tagElement - The folder tag element that was clicked
     */
    handleFolderClick(tagElement) {
        const folder = tagElement.dataset.folder;
        const wasActive = tagElement.classList.contains('active');
        
        document.querySelectorAll('.folder-tags .tag').forEach(t => {
            t.classList.remove('active');
        });
        
        if (!wasActive) {
            tagElement.classList.add('active');
            this.pageState.activeFolder = folder;
            setStorageItem(`${this.pageType}_activeFolder`, folder);
        } else {
            this.pageState.activeFolder = null;
            setStorageItem(`${this.pageType}_activeFolder`, null);
        }
        
        this.resetAndReload();
    }
    
    /**
     * Restore folder filter from storage
     */
    restoreFolderFilter() {
        const activeFolder = getStorageItem(`${this.pageType}_activeFolder`);
        const folderTag = activeFolder && document.querySelector(`.tag[data-folder="${activeFolder}"]`);
        
        if (folderTag) {
            folderTag.classList.add('active');
            this.pageState.activeFolder = activeFolder;
            this.filterByFolder(activeFolder);
        }
    }
    
    /**
     * Filter displayed cards by folder
     * @param {string} folderPath - Folder path to filter by
     */
    filterByFolder(folderPath) {
        const cardSelector = this.pageType === 'loras' ? '.lora-card' : '.checkpoint-card';
        document.querySelectorAll(cardSelector).forEach(card => {
            card.style.display = card.dataset.folder === folderPath ? '' : 'none';
        });
    }
    
    /**
     * Update the folder tags display with new folder list
     * @param {Array} folders - List of folder names
     */
    updateFolderTags(folders) {
        const folderTagsContainer = document.querySelector('.folder-tags');
        if (!folderTagsContainer) return;

        // Keep track of currently selected folder
        const currentFolder = this.pageState.activeFolder;

        // Create HTML for folder tags
        const tagsHTML = folders.map(folder => {
            const isActive = folder === currentFolder;
            return `<div class="tag ${isActive ? 'active' : ''}" data-folder="${folder}">${folder}</div>`;
        }).join('');

        // Update the container
        folderTagsContainer.innerHTML = tagsHTML;

        // Scroll active folder into view (no need to reattach click handlers)
        const activeTag = folderTagsContainer.querySelector(`.tag[data-folder="${currentFolder}"]`);
        if (activeTag) {
            activeTag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    /**
     * Toggle visibility of folder tags
     */
    toggleFolderTags() {
        const folderTags = document.querySelector('.folder-tags');
        const toggleBtn = document.querySelector('.toggle-folders-btn i');
        
        if (folderTags) {
            folderTags.classList.toggle('collapsed');
            
            if (folderTags.classList.contains('collapsed')) {
                // Change icon to indicate folders are hidden
                toggleBtn.className = 'fas fa-folder-plus';
                toggleBtn.parentElement.title = 'Show folder tags';
                setStorageItem('folderTagsCollapsed', 'true');
            } else {
                // Change icon to indicate folders are visible
                toggleBtn.className = 'fas fa-folder-minus';
                toggleBtn.parentElement.title = 'Hide folder tags';
                setStorageItem('folderTagsCollapsed', 'false');
            }
        }
    }
    
    /**
     * Initialize folder tags visibility based on stored preference
     */
    initFolderTagsVisibility() {
        const isCollapsed = getStorageItem('folderTagsCollapsed');
        if (isCollapsed) {
            const folderTags = document.querySelector('.folder-tags');
            const toggleBtn = document.querySelector('.toggle-folders-btn i');
            if (folderTags) {
                folderTags.classList.add('collapsed');
            }
            if (toggleBtn) {
                toggleBtn.className = 'fas fa-folder-plus';
                toggleBtn.parentElement.title = 'Show folder tags';
            }
        } else {
            const toggleBtn = document.querySelector('.toggle-folders-btn i');
            if (toggleBtn) {
                toggleBtn.className = 'fas fa-folder-minus';
                toggleBtn.parentElement.title = 'Hide folder tags';
            }
        }
    }
    
    /**
     * Load sort preference from storage
     */
    loadSortPreference() {
        const savedSort = getStorageItem(`${this.pageType}_sort`);
        if (savedSort) {
            this.pageState.sortBy = savedSort;
            const sortSelect = document.getElementById('sortSelect');
            if (sortSelect) {
                sortSelect.value = savedSort;
            }
        }
    }
    
    /**
     * Save sort preference to storage
     * @param {string} sortValue - The sort value to save
     */
    saveSortPreference(sortValue) {
        setStorageItem(`${this.pageType}_sort`, sortValue);
    }
    
    /**
     * Open model page on Civitai
     * @param {string} modelName - Name of the model
     */
    openCivitai(modelName) {
        // Get card selector based on page type
        const cardSelector = this.pageType === 'loras' 
            ? `.lora-card[data-name="${modelName}"]`
            : `.checkpoint-card[data-name="${modelName}"]`;
            
        const card = document.querySelector(cardSelector);
        if (!card) return;
        
        const metaData = JSON.parse(card.dataset.meta);
        const civitaiId = metaData.modelId;
        const versionId = metaData.id;
        
        // Build URL
        if (civitaiId) {
            let url = `https://civitai.com/models/${civitaiId}`;
            if (versionId) {
                url += `?modelVersionId=${versionId}`;
            }
            window.open(url, '_blank');
        } else {
            // If no ID, try searching by name
            window.open(`https://civitai.com/models?query=${encodeURIComponent(modelName)}`, '_blank');
        }
    }
    
    /**
     * Reset and reload the models list
     */
    async resetAndReload(updateFolders = false) {
        if (!this.api) {
            console.error('API methods not registered');
            return;
        }

        try {
            await this.api.resetAndReload(updateFolders);
        } catch (error) {
            console.error(`Error reloading ${this.pageType}:`, error);
            showToast(`Failed to reload ${this.pageType}: ${error.message}`, 'error');
        }
    }
    
    /**
     * Refresh models list
     */
    async refreshModels() {
        if (!this.api) {
            console.error('API methods not registered');
            return;
        }

        try {
            await this.api.refreshModels();
        } catch (error) {
            console.error(`Error refreshing ${this.pageType}:`, error);
            showToast(`Failed to refresh ${this.pageType}: ${error.message}`, 'error');
        }
    }
    
    /**
     * Fetch metadata from Civitai (available for both LoRAs and Checkpoints)
     */
    async fetchFromCivitai() {
        if (!this.api) {
            console.error('API methods not registered');
            return;
        }
        
        try {
            await this.api.fetchFromCivitai();
        } catch (error) {
            console.error('Error fetching metadata:', error);
            showToast('Failed to fetch metadata: ' + error.message, 'error');
        }
    }
    
    /**
     * Show download modal
     */
    showDownloadModal() {
        this.api.showDownloadModal();
    }
    
    /**
     * Toggle bulk mode (LoRAs only)
     */
    toggleBulkMode() {
        if (this.pageType !== 'loras' || !this.api) {
            console.error('Bulk mode is only available for LoRAs');
            return;
        }
        
        this.api.toggleBulkMode();
    }
    
    /**
     * Clear custom filter
     */
    async clearCustomFilter() {
        if (!this.api) {
            console.error('API methods not registered');
            return;
        }
        
        try {
            await this.api.clearCustomFilter();
        } catch (error) {
            console.error('Error clearing custom filter:', error);
            showToast('Failed to clear custom filter: ' + error.message, 'error');
        }
    }
}