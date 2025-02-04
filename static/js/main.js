import { debounce } from './utils/debounce.js';
import { LoadingManager } from './managers/LoadingManager.js';
import { modalManager } from './managers/ModalManager.js';
import { state } from './state/index.js';
import { createLoraCard, updatePreviewInCard, showLoraModal, initializeLoraCards } from './components/LoraCard.js';
import { loadMoreLoras, fetchCivitai, deleteModel, replacePreview, resetAndReload, refreshLoras } from './api/loraApi.js';
import { showToast, lazyLoadImages, restoreFolderFilter, initTheme, toggleTheme, toggleFolder, copyTriggerWord } from './utils/uiHelpers.js';
import { initializeInfiniteScroll } from './utils/infiniteScroll.js';
import { showDeleteModal, confirmDelete, closeDeleteModal } from './utils/modalUtils.js';

// Export all functions that need global access
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

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    state.loadingManager = new LoadingManager();
    modalManager.initialize();  // Initialize modalManager after DOM is loaded
    initializeInfiniteScroll();
    initializeEventListeners();
    lazyLoadImages();
    restoreFolderFilter();
    initializeLoraCards();
    initTheme();

    // Search handler
    const searchHandler = debounce(term => {
        document.querySelectorAll('.lora-card').forEach(card => {
            card.style.display = [card.dataset.name, card.dataset.folder]
                .some(text => text.toLowerCase().includes(term)) 
                ? 'block' 
                : 'none';
        });
    }, 250);

    document.getElementById('searchInput')?.addEventListener('input', e => {
        searchHandler(e.target.value.toLowerCase());
    });
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