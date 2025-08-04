import { LoraApiClient } from './loraApi.js';
import { CheckpointApiClient } from './checkpointApi.js';
import { EmbeddingApiClient } from './embeddingApi.js';
import { MODEL_TYPES } from './apiConfig.js';
import { state } from '../state/index.js';

export function createModelApiClient(modelType) {
    switch (modelType) {
        case MODEL_TYPES.LORA:
            return new LoraApiClient();
        case MODEL_TYPES.CHECKPOINT:
            return new CheckpointApiClient();
        case MODEL_TYPES.EMBEDDING:
            return new EmbeddingApiClient();
        default:
            throw new Error(`Unsupported model type: ${modelType}`);
    }
}

let _singletonClient = null;

export function getModelApiClient() {
    const currentType = state.currentPageType;
    
    if (!_singletonClient || _singletonClient.modelType !== currentType) {
        _singletonClient = createModelApiClient(currentType);
    }
    
    return _singletonClient;
}

export function resetAndReload(updateFolders = false) {
    const client = getModelApiClient();
    return client.loadMoreWithVirtualScroll(true, updateFolders);
}