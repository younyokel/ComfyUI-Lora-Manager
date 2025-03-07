import { debounce } from './utils/debounce.js';
import { LoadingManager } from './managers/LoadingManager.js';
import { modalManager } from './managers/ModalManager.js';
import { updateService } from './managers/UpdateService.js';
import { state } from './state/index.js';
import { showLoraModal } from './components/LoraModal.js';
import { toggleShowcase, scrollToTop } from './components/LoraModal.js';
import { loadMoreLoras, fetchCivitai, deleteModel, replacePreview, resetAndReload, refreshLoras } from './api/loraApi.js';
import { 
    showToast, 
    lazyLoadImages, 
    restoreFolderFilter, 
    initTheme,
    toggleTheme,
    toggleFolder,
    copyTriggerWord,
    openCivitai,
    toggleFolderTags,
    initFolderTagsVisibility,
    initBackToTop
} from './utils/uiHelpers.js';
import { initializeInfiniteScroll } from './utils/infiniteScroll.js';
import { showDeleteModal, confirmDelete, closeDeleteModal } from './utils/modalUtils.js';
import { SearchManager } from './utils/search.js';
import { DownloadManager } from './managers/DownloadManager.js';
import { SettingsManager, toggleApiKeyVisibility } from './managers/SettingsManager.js';
import { LoraContextMenu } from './components/ContextMenu.js';
import { moveManager } from './managers/MoveManager.js';
import { FilterManager } from './managers/FilterManager.js';
import { createLoraCard, updateCardsForBulkMode } from './components/LoraCard.js';
import { bulkManager } from './managers/BulkManager.js';

// Add bulk mode to state
state.bulkMode = false;
state.selectedLoras = new Set();

// Export functions to global window object
window.loadMoreLoras = loadMoreLoras;
window.fetchCivitai = fetchCivitai;
window.deleteModel = deleteModel;
window.replacePreview = replacePreview;
window.toggleTheme = toggleTheme;
window.toggleFolder = toggleFolder;
window.copyTriggerWord = copyTriggerWord;
window.showLoraModal = showLoraModal;
window.modalManager = modalManager;
window.state = state;
window.confirmDelete = confirmDelete;
window.closeDeleteModal = closeDeleteModal;
window.refreshLoras = refreshLoras;
window.openCivitai = openCivitai;
window.showToast = showToast
window.toggleFolderTags = toggleFolderTags;
window.settingsManager = new SettingsManager();
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.moveManager = moveManager;
window.toggleShowcase = toggleShowcase;
window.scrollToTop = scrollToTop;

// Export bulk manager methods to window
window.toggleBulkMode = () => bulkManager.toggleBulkMode();
window.clearSelection = () => bulkManager.clearSelection();
window.toggleCardSelection = (card) => bulkManager.toggleCardSelection(card);
window.copyAllLorasSyntax = () => bulkManager.copyAllLorasSyntax();
window.updateSelectedCount = () => bulkManager.updateSelectedCount();
window.bulkManager = bulkManager;

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    state.loadingManager = new LoadingManager();
    modalManager.initialize();  // Initialize modalManager after DOM is loaded
    updateService.initialize(); // Initialize updateService after modalManager
    window.downloadManager = new DownloadManager();  // Move this after modalManager initialization
    window.filterManager = new FilterManager(); // Initialize filter manager
    
    // Initialize state filters from filterManager if available
    if (window.filterManager && window.filterManager.filters) {
        state.filters = { ...window.filterManager.filters };
    }
    
    initializeInfiniteScroll();
    initializeEventListeners();
    lazyLoadImages();
    restoreFolderFilter();
    initTheme();
    initFolderTagsVisibility();
    initBackToTop();
    window.searchManager = new SearchManager();
    new LoraContextMenu();
    
    // Initialize cards for current bulk mode state (should be false initially)
    updateCardsForBulkMode(state.bulkMode);
    
    // Initialize the bulk manager
    bulkManager.initialize();
});

// Initialize event listeners
function initializeEventListeners() {
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = state.sortBy;
        sortSelect.addEventListener('change', async (e) => {
            state.sortBy = e.target.value;
            await resetAndReload();
        });
    }

    document.querySelectorAll('.folder-tags .tag').forEach(tag => {
        tag.addEventListener('click', toggleFolder);
    });
}