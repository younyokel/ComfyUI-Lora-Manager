import { createModelApiClient } from './baseModelApi.js';
import { MODEL_TYPES } from './apiConfig.js';

// Create Checkpoint-specific API client
const checkpointApiClient = createModelApiClient(MODEL_TYPES.CHECKPOINT);

// Export all common operations using the unified client
export const deleteModel = (filePath) => checkpointApiClient.deleteModel(filePath);
export const excludeCheckpoint = (filePath) => checkpointApiClient.excludeModel(filePath);
export const renameCheckpointFile = (filePath, newFileName) => checkpointApiClient.renameModelFile(filePath, newFileName);
export const replacePreview = (filePath) => checkpointApiClient.replaceModelPreview(filePath);
export const saveModelMetadata = (filePath, data) => checkpointApiClient.saveModelMetadata(filePath, data);
export const refreshCheckpoints = (fullRebuild = false) => checkpointApiClient.refreshModels(fullRebuild);
export const refreshSingleCheckpointMetadata = (filePath) => checkpointApiClient.refreshSingleModelMetadata(filePath);
export const fetchCivitai = () => checkpointApiClient.fetchCivitaiMetadata();

// Pagination functions
export const fetchCheckpointsPage = (page = 1, pageSize = 50) => checkpointApiClient.fetchModelsPage(page, pageSize);

// Virtual scrolling operations
export async function loadMoreCheckpoints(resetPage = false, updateFolders = false) {
    return checkpointApiClient.loadMoreWithVirtualScroll(resetPage, updateFolders);
}

// Checkpoint-specific functions
export async function getCheckpointInfo(name) {
    try {
        const response = await fetch(`${checkpointApiClient.apiConfig.endpoints.specific.info}/${encodeURIComponent(name)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch checkpoint info: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching checkpoint info:', error);
        throw error;
    }
}