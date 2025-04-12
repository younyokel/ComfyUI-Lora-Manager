import { createCheckpointCard } from '../components/CheckpointCard.js';
import {
    loadMoreModels,
    resetAndReload as baseResetAndReload,
    refreshModels as baseRefreshModels,
    deleteModel as baseDeleteModel,
    replaceModelPreview,
    fetchCivitaiMetadata
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