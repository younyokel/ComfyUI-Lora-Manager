import { createLoraCard } from '../components/LoraCard.js';
import {
    loadMoreModels,
    fetchModelsPage,
    resetAndReload as baseResetAndReload,
    refreshModels as baseRefreshModels,
    deleteModel as baseDeleteModel,
    replaceModelPreview,
    fetchCivitaiMetadata,
    refreshSingleModelMetadata,
    excludeModel as baseExcludeModel
} from './baseModelApi.js';
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';

/**
 * Save model metadata to the server
 * @param {string} filePath - File path
 * @param {Object} data - Data to save
 * @returns {Promise} Promise of the save operation
 */
export async function saveModelMetadata(filePath, data) {
    const response = await fetch('/api/loras/save-metadata', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            file_path: filePath,
            ...data
        })
    });

    if (!response.ok) {
        throw new Error('Failed to save metadata');
    }
    
    return response.json();
}

/**
 * Exclude a lora model from being shown in the UI
 * @param {string} filePath - File path of the model to exclude
 * @returns {Promise<boolean>} Promise resolving to success status
 */
export async function excludeLora(filePath) {
    return baseExcludeModel(filePath, 'lora');
}

/**
 * Load more loras with pagination - updated to work with VirtualScroller
 * @param {boolean} resetPage - Whether to reset to the first page
 * @param {boolean} updateFolders - Whether to update folder tags
 * @returns {Promise<void>}
 */
export async function loadMoreLoras(resetPage = false, updateFolders = false) {
    const pageState = getCurrentPageState();
    
    // Check if virtual scroller is available
    if (state.virtualScroller) {
        try {
            // Start loading state
            pageState.isLoading = true;
            document.body.classList.add('loading');
            
            // Reset to first page if requested
            if (resetPage) {
                pageState.currentPage = 1;
            }
            
            // Fetch the first page of data
            const result = await fetchLorasPage(pageState.currentPage, pageState.pageSize || 50);
            
            // Update virtual scroller with the new data
            state.virtualScroller.refreshWithData(
                result.items,
                result.totalItems,
                result.hasMore
            );
            
            // Update state
            pageState.hasMore = result.hasMore;
            pageState.currentPage = 2; // Next page to load would be 2
            
            // Update folders if needed
            if (updateFolders && result.folders) {
                // Import function dynamically to avoid circular dependencies
                const { updateFolderTags } = await import('./baseModelApi.js');
                updateFolderTags(result.folders);
            }
            
            return result;
        } catch (error) {
            console.error('Error loading loras:', error);
            showToast(`Failed to load loras: ${error.message}`, 'error');
        } finally {
            pageState.isLoading = false;
            document.body.classList.remove('loading');
        }
    } else {
        // Fall back to the original implementation if virtual scroller isn't available
        return loadMoreModels({
            resetPage,
            updateFolders,
            modelType: 'lora',
            createCardFunction: createLoraCard,
            endpoint: '/api/loras'
        });
    }
}

/**
 * Fetch loras with pagination for virtual scrolling
 * @param {number} page - Page number to fetch
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Object>} Object containing items, total count, and pagination info
 */
export async function fetchLorasPage(page = 1, pageSize = 50) {
    return fetchModelsPage({
        modelType: 'lora',
        page,
        pageSize,
        endpoint: '/api/loras'
    });
}

export async function fetchCivitai() {
    return fetchCivitaiMetadata({
        modelType: 'lora',
        fetchEndpoint: '/api/fetch-all-civitai',
        resetAndReloadFunction: resetAndReload
    });
}

export async function deleteModel(filePath) {
    return baseDeleteModel(filePath, 'lora');
}

export async function replacePreview(filePath) {
    return replaceModelPreview(filePath, 'lora');
}

export function appendLoraCards(loras) {
    // This function is no longer needed with virtual scrolling
    // but kept for compatibility
    if (state.virtualScroller) {
        console.warn('appendLoraCards is deprecated when using virtual scrolling');
    } else {
        const grid = document.getElementById('loraGrid');
        
        loras.forEach(lora => {
            const card = createLoraCard(lora);
            grid.appendChild(card);
        });
    }
}

export async function resetAndReload(updateFolders = false) {
    const pageState = getCurrentPageState();
    
    // Check if virtual scroller is available
    if (state.virtualScroller) {
        try {
            pageState.isLoading = true;
            document.body.classList.add('loading');
            
            // Reset page counter
            pageState.currentPage = 1;
            
            // Fetch the first page
            const result = await fetchLorasPage(1, pageState.pageSize || 50);
            
            // Update the virtual scroller
            state.virtualScroller.refreshWithData(
                result.items,
                result.totalItems,
                result.hasMore
            );
            
            // Update state
            pageState.hasMore = result.hasMore;
            pageState.currentPage = 2; // Next page will be 2
            
            // Update folders if needed
            if (updateFolders && result.folders) {
                // Import function dynamically to avoid circular dependencies
                const { updateFolderTags } = await import('./baseModelApi.js');
                updateFolderTags(result.folders);
            }
            
            return result;
        } catch (error) {
            console.error('Error reloading loras:', error);
            showToast(`Failed to reload loras: ${error.message}`, 'error');
        } finally {
            pageState.isLoading = false;
            document.body.classList.remove('loading');
        }
    } else {
        // Fall back to original implementation
        return baseResetAndReload({
            updateFolders,
            modelType: 'lora',
            loadMoreFunction: loadMoreLoras
        });
    }
}

export async function refreshLoras() {
    return baseRefreshModels({
        modelType: 'lora',
        scanEndpoint: '/api/loras/scan',
        resetAndReloadFunction: resetAndReload
    });
}

export async function refreshSingleLoraMetadata(filePath) {
    const success = await refreshSingleModelMetadata(filePath, 'lora');
    if (success) {
        // Reload the current view to show updated data
        await resetAndReload();
    }
}

export async function fetchModelDescription(modelId, filePath) {
    try {
        const response = await fetch(`/api/lora-model-description?model_id=${modelId}&file_path=${encodeURIComponent(filePath)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch model description: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching model description:', error);
        throw error;
    }
}