import { BaseModelApiClient } from './baseModelApi.js';
import { showToast } from '../utils/uiHelpers.js';

/**
 * Checkpoint-specific API client
 */
export class CheckpointApiClient extends BaseModelApiClient {
    /**
     * Checkpoints don't support move operations
     */
    async moveSingleModel(filePath, targetPath) {
        showToast('Moving checkpoints is not supported', 'warning');
        return null;
    }

    /**
     * Checkpoints don't support bulk move operations
     */
    async moveBulkModels(filePaths, targetPath) {
        showToast('Moving checkpoints is not supported', 'warning');
        return [];
    }

    /**
     * Get checkpoint information
     */
    async getCheckpointInfo(filePath) {
        try {
            const response = await fetch(this.apiConfig.endpoints.specific.info, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_path: filePath })
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch checkpoint info');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching checkpoint info:', error);
            throw error;
        }
    }
}
