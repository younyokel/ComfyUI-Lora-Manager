import {
    fetchModelsPage,
    resetAndReloadWithVirtualScroll,
    loadMoreWithVirtualScroll,
    refreshModels as baseRefreshModels,
    deleteModel as baseDeleteModel,
    replaceModelPreview,
    fetchCivitaiMetadata,
    refreshSingleModelMetadata,
    excludeModel as baseExcludeModel
} from './baseModelApi.js';
import { state } from '../state/index.js';

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

        // Update the virtual scroller with the new data
        state.virtualScroller.updateSingleItem(filePath, data);
        
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
    return loadMoreWithVirtualScroll({
        modelType: 'lora',
        resetPage,
        updateFolders,
        fetchPageFunction: fetchLorasPage
    });
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
        fetchEndpoint: '/api/loras/fetch-all-civitai',
        resetAndReloadFunction: resetAndReload
    });
}

export async function deleteModel(filePath) {
    return baseDeleteModel(filePath, 'lora');
}

export async function replacePreview(filePath) {
    return replaceModelPreview(filePath, 'lora');
}

export async function resetAndReload(updateFolders = false) {
    return resetAndReloadWithVirtualScroll({
        modelType: 'lora',
        updateFolders,
        fetchPageFunction: fetchLorasPage
    });
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
    await refreshSingleModelMetadata(filePath, 'lora');
}

export async function fetchModelDescription(modelId, filePath) {
    try {
        const response = await fetch(`/api/loras/model-description?model_id=${modelId}&file_path=${encodeURIComponent(filePath)}`);
        
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
        
        const response = await fetch('/api/loras/rename', {
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