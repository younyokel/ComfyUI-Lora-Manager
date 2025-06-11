import { createLoraCard } from '../components/LoraCard.js';
import {
    loadMoreModels,
    fetchModelsPage,
    resetAndReload as baseResetAndReload,
    resetAndReloadWithVirtualScroll,
    loadMoreWithVirtualScroll,
    refreshModels as baseRefreshModels,
    deleteModel as baseDeleteModel,
    replaceModelPreview,
    fetchCivitaiMetadata,
    refreshSingleModelMetadata,
    excludeModel as baseExcludeModel
} from './baseModelApi.js';
import { state, getCurrentPageState } from '../state/index.js';

/**
 * Save model metadata to the server
 * @param {string} filePath - File path
 * @param {Object} data - Data to save
 * @returns {Promise} Promise of the save operation
 */
export async function saveModelMetadata(filePath, data) {
    try {
        // Show loading indicator
        state.loadingManager.showSimpleLoading('Saving metadata...');
        
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
    } finally {
        // Always hide the loading indicator when done
        state.loadingManager.hide();
    }
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
        return loadMoreWithVirtualScroll({
            modelType: 'lora',
            resetPage,
            updateFolders,
            fetchPageFunction: fetchLorasPage
        });
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
export async function fetchLorasPage(page = 1, pageSize = 100) {
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
    // Check if virtual scroller is available
    if (state.virtualScroller) {
        return resetAndReloadWithVirtualScroll({
            modelType: 'lora',
            updateFolders,
            fetchPageFunction: fetchLorasPage
        });
    } else {
        // Fall back to original implementation
        return baseResetAndReload({
            updateFolders,
            modelType: 'lora',
            loadMoreFunction: loadMoreLoras
        });
    }
}

export async function refreshLoras(fullRebuild = false) {
    return baseRefreshModels({
        modelType: 'lora',
        scanEndpoint: '/api/loras/scan',
        resetAndReloadFunction: resetAndReload,
        fullRebuild: fullRebuild
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

/**
 * Rename a LoRA file
 * @param {string} filePath - Current file path
 * @param {string} newFileName - New file name (without path)
 * @returns {Promise<Object>} - Promise that resolves with the server response
 */
export async function renameLoraFile(filePath, newFileName) {
    try {
        // Show loading indicator
        state.loadingManager.showSimpleLoading('Renaming LoRA file...');
        
        const response = await fetch('/api/rename_lora', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_path: filePath,
                new_file_name: newFileName
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error renaming LoRA file:', error);
        throw error;
    } finally {
        // Hide loading indicator
        state.loadingManager.hide();
    }
}