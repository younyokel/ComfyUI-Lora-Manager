import { BaseModelApiClient } from './baseModelApi.js';
import { showToast } from '../utils/uiHelpers.js';

/**
 * Embedding-specific API client
 */
export class EmbeddingApiClient extends BaseModelApiClient {
    /**
     * Move a single embedding to target path
     */
    async moveSingleModel(filePath, targetPath) {
        if (filePath.substring(0, filePath.lastIndexOf('/')) === targetPath) {
            showToast('Embedding is already in the selected folder', 'info');
            return null;
        }

        // TODO: Implement embedding move endpoint when available
        showToast('Moving embeddings is not yet implemented', 'info');
        return null;
    }

    /**
     * Move multiple embeddings to target path
     */
    async moveBulkModels(filePaths, targetPath) {
        // TODO: Implement embedding bulk move endpoint when available
        showToast('Moving embeddings is not yet implemented', 'info');
        return [];
    }
}
