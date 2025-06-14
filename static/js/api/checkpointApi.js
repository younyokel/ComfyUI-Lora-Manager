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
 * Fetch checkpoints with pagination for virtual scrolling
 * @param {number} page - Page number to fetch
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Object>} Object containing items, total count, and pagination info
 */
export async function fetchCheckpointsPage(page = 1, pageSize = 100) {
    return fetchModelsPage({
        modelType: 'checkpoint',
        page,
        pageSize,
        endpoint: '/api/checkpoints'
    });
}

/**
 * Load more checkpoints with pagination - updated to work with VirtualScroller
 * @param {boolean} resetPage - Whether to reset to the first page
 * @param {boolean} updateFolders - Whether to update folder tags
 * @returns {Promise<void>}
 */
export async function loadMoreCheckpoints(resetPage = false, updateFolders = false) {
    return loadMoreWithVirtualScroll({
        modelType: 'checkpoint',
        resetPage,
        updateFolders,
        fetchPageFunction: fetchCheckpointsPage
    });
}

// Reset and reload checkpoints
export async function resetAndReload(updateFolders = false) {
    return resetAndReloadWithVirtualScroll({
        modelType: 'checkpoint',
        updateFolders,
        fetchPageFunction: fetchCheckpointsPage
    });
}

// Refresh checkpoints
export async function refreshCheckpoints(fullRebuild = false) {
    return baseRefreshModels({
        modelType: 'checkpoint',
        scanEndpoint: '/api/checkpoints/scan',
        resetAndReloadFunction: resetAndReload,
        fullRebuild: fullRebuild
    });
}

// Delete a checkpoint
export function deleteCheckpoint(filePath) {
    return baseDeleteModel(filePath, 'checkpoint');
}

// Replace checkpoint preview
export function replaceCheckpointPreview(filePath) {
    return replaceModelPreview(filePath, 'checkpoint');
}

// Fetch metadata from Civitai for checkpoints
export async function fetchCivitai() {
    return fetchCivitaiMetadata({
        modelType: 'checkpoint',
        fetchEndpoint: '/api/checkpoints/fetch-all-civitai',
        resetAndReloadFunction: resetAndReload
    });
}

// Refresh single checkpoint metadata
export async function refreshSingleCheckpointMetadata(filePath) {
    const success = await refreshSingleModelMetadata(filePath, 'checkpoint');
    if (success) {
        // Reload the current view to show updated data
        await resetAndReload();
    }
}

/**
 * Save model metadata to the server
 * @param {string} filePath - Path to the model file
 * @param {Object} data - Metadata to save
 * @returns {Promise} - Promise that resolves with the server response
 */
export async function saveModelMetadata(filePath, data) {
    try {
        // Show loading indicator
        state.loadingManager.showSimpleLoading('Saving metadata...');
        
        const response = await fetch('/api/checkpoints/save-metadata', {
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
 * Exclude a checkpoint model from being shown in the UI
 * @param {string} filePath - File path of the checkpoint to exclude
 * @returns {Promise<boolean>} Promise resolving to success status
 */
export function excludeCheckpoint(filePath) {
    return baseExcludeModel(filePath, 'checkpoint');
}

/**
 * Rename a checkpoint file
 * @param {string} filePath - Current file path
 * @param {string} newFileName - New file name (without path)
 * @returns {Promise<Object>} - Promise that resolves with the server response
 */
export async function renameCheckpointFile(filePath, newFileName) {
    try {
        // Show loading indicator
        state.loadingManager.showSimpleLoading('Renaming checkpoint file...');
        
        const response = await fetch('/api/rename_checkpoint', {
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
        console.error('Error renaming checkpoint file:', error);
        throw error;
    } finally {
        // Hide loading indicator
        state.loadingManager.hide();
    }
}