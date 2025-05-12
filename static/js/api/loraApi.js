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

export async function loadMoreLoras(resetPage = false, updateFolders = false) {
    return loadMoreModels({
        resetPage,
        updateFolders,
        modelType: 'lora',
        createCardFunction: createLoraCard,
        endpoint: '/api/loras'
    });
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
    const grid = document.getElementById('loraGrid');
    const sentinel = document.getElementById('scroll-sentinel');
    
    loras.forEach(lora => {
        const card = createLoraCard(lora);
        grid.appendChild(card);
    });
}

export async function resetAndReload(updateFolders = false) {
    return baseResetAndReload({
        updateFolders,
        modelType: 'lora',
        loadMoreFunction: loadMoreLoras
    });
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