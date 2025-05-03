import { createCheckpointCard } from '../components/CheckpointCard.js';
import {
    loadMoreModels,
    resetAndReload as baseResetAndReload,
    refreshModels as baseRefreshModels,
    deleteModel as baseDeleteModel,
    replaceModelPreview,
    fetchCivitaiMetadata,
    refreshSingleModelMetadata,
    excludeModel as baseExcludeModel
} from './baseModelApi.js';

// Load more checkpoints with pagination
export async function loadMoreCheckpoints(resetPagination = true) {
    return loadMoreModels({
        resetPage: resetPagination,
        updateFolders: true,
        modelType: 'checkpoint',
        createCardFunction: createCheckpointCard,
        endpoint: '/api/checkpoints'
    });
}

// Reset and reload checkpoints
export async function resetAndReload() {
    return baseResetAndReload({
        updateFolders: true,
        modelType: 'checkpoint',
        loadMoreFunction: loadMoreCheckpoints
    });
}

// Refresh checkpoints
export async function refreshCheckpoints() {
    return baseRefreshModels({
        modelType: 'checkpoint',
        scanEndpoint: '/api/checkpoints/scan',
        resetAndReloadFunction: resetAndReload
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
    return refreshSingleModelMetadata(filePath, 'checkpoint');
}

/**
 * Save model metadata to the server
 * @param {string} filePath - Path to the model file
 * @param {Object} data - Metadata to save
 * @returns {Promise} - Promise that resolves with the server response
 */
export async function saveModelMetadata(filePath, data) {
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
}

/**
 * Exclude a checkpoint model from being shown in the UI
 * @param {string} filePath - File path of the checkpoint to exclude
 * @returns {Promise<boolean>} Promise resolving to success status
 */
export function excludeCheckpoint(filePath) {
    return baseExcludeModel(filePath, 'checkpoint');
}