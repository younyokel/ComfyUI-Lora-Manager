import { createModelApiClient } from './baseModelApi.js';
import { MODEL_TYPES } from './apiConfig.js';

// Create LoRA-specific API client
const loraApiClient = createModelApiClient(MODEL_TYPES.LORA);

// Export all common operations using the unified client
export const deleteModel = (filePath) => loraApiClient.deleteModel(filePath);
export const excludeLora = (filePath) => loraApiClient.excludeModel(filePath);
export const renameLoraFile = (filePath, newFileName) => loraApiClient.renameModelFile(filePath, newFileName);
export const replacePreview = (filePath) => loraApiClient.replaceModelPreview(filePath);
export const saveModelMetadata = (filePath, data) => loraApiClient.saveModelMetadata(filePath, data);
export const refreshLoras = (fullRebuild = false) => loraApiClient.refreshModels(fullRebuild);
export const refreshSingleLoraMetadata = (filePath) => loraApiClient.refreshSingleModelMetadata(filePath);
export const fetchCivitai = () => loraApiClient.fetchCivitaiMetadata();

// Pagination functions
export const fetchLorasPage = (page = 1, pageSize = 100) => loraApiClient.fetchModelsPage(page, pageSize);

// Virtual scrolling operations
export async function loadMoreLoras(resetPage = false, updateFolders = false) {
    return loraApiClient.loadMoreWithVirtualScroll(resetPage, updateFolders);
}

// LoRA-specific functions that don't have common equivalents
export async function fetchModelDescription(modelId, filePath) {
    try {
        const response = await fetch(`${loraApiClient.apiConfig.endpoints.specific.modelDescription}?model_id=${modelId}&file_path=${encodeURIComponent(filePath)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch model description: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching model description:', error);
        throw error;
    }
}

// Move operations (LoRA-specific)
export async function moveModel(filePath, targetPath) {
    try {
        const response = await fetch(loraApiClient.apiConfig.endpoints.specific.moveModel, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: filePath,
                target_path: targetPath
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to move model');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error moving model:', error);
        throw error;
    }
}

export async function moveModelsBulk(filePaths, targetPath) {
    try {
        const response = await fetch(loraApiClient.apiConfig.endpoints.specific.moveBulk, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_paths: filePaths,
                target_path: targetPath
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to move models');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error moving models in bulk:', error);
        throw error;
    }
}