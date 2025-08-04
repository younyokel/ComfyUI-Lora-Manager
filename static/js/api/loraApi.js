import { BaseModelApiClient } from './baseModelApi.js';
import { showToast } from '../utils/uiHelpers.js';
import { getSessionItem } from '../utils/storageHelpers.js';

/**
 * LoRA-specific API client
 */
export class LoraApiClient extends BaseModelApiClient {
    /**
     * Add LoRA-specific parameters to query
     */
    _addModelSpecificParams(params, pageState) {
        const filterLoraHash = getSessionItem('recipe_to_lora_filterLoraHash');
        const filterLoraHashes = getSessionItem('recipe_to_lora_filterLoraHashes');

        if (filterLoraHash) {
            params.append('lora_hash', filterLoraHash);
        } else if (filterLoraHashes) {
            try {
                if (Array.isArray(filterLoraHashes) && filterLoraHashes.length > 0) {
                    params.append('lora_hashes', filterLoraHashes.join(','));
                }
            } catch (error) {
                console.error('Error parsing lora hashes from session storage:', error);
            }
        }
    }

    /**
     * Move a single LoRA to target path
     */
    async moveSingleModel(filePath, targetPath) {
        if (filePath.substring(0, filePath.lastIndexOf('/')) === targetPath) {
            showToast('LoRA is already in the selected folder', 'info');
            return null;
        }

        const response = await fetch(this.apiConfig.endpoints.specific.moveModel, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_path: filePath,
                target_path: targetPath
            })
        });

        const result = await response.json();

        if (!response.ok) {
            if (result && result.error) {
                throw new Error(result.error);
            }
            throw new Error('Failed to move LoRA');
        }

        if (result && result.message) {
            showToast(result.message, 'info');
        } else {
            showToast('LoRA moved successfully', 'success');
        }

        if (result.success) {
            return result.new_file_path;
        }
        return null;
    }

    /**
     * Move multiple LoRAs to target path
     */
    async moveBulkModels(filePaths, targetPath) {
        const movedPaths = filePaths.filter(path => {
            return path.substring(0, path.lastIndexOf('/')) !== targetPath;
        });

        if (movedPaths.length === 0) {
            showToast('All selected LoRAs are already in the target folder', 'info');
            return [];
        }

        const response = await fetch(this.apiConfig.endpoints.specific.moveBulk, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_paths: movedPaths,
                target_path: targetPath
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error('Failed to move LoRAs');
        }

        let successFilePaths = [];
        if (result.success) {
            if (result.failure_count > 0) {
                showToast(`Moved ${result.success_count} LoRAs, ${result.failure_count} failed`, 'warning');
                console.log('Move operation results:', result.results);
                const failedFiles = result.results
                    .filter(r => !r.success)
                    .map(r => {
                        const fileName = r.path.substring(r.path.lastIndexOf('/') + 1);
                        return `${fileName}: ${r.message}`;
                    });
                if (failedFiles.length > 0) {
                    const failureMessage = failedFiles.length <= 3 
                        ? failedFiles.join('\n')
                        : failedFiles.slice(0, 3).join('\n') + `\n(and ${failedFiles.length - 3} more)`;
                    showToast(`Failed moves:\n${failureMessage}`, 'warning', 6000);
                }
            } else {
                showToast(`Successfully moved ${result.success_count} LoRAs`, 'success');
            }
            successFilePaths = result.results
                .filter(r => r.success)
                .map(r => r.path);
        } else {
            throw new Error(result.message || 'Failed to move LoRAs');
        }
        return successFilePaths;
    }

    /**
     * Get LoRA notes
     */
    async getLoraNote(filePath) {
        try {
            const response = await fetch(this.apiConfig.endpoints.specific.notes,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ file_path: filePath })
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to fetch LoRA notes');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching LoRA notes:', error);
            throw error;
        }
    }

    /**
     * Get LoRA trigger words
     */
    async getLoraTriggerWords(filePath) {
        try {
            const response = await fetch(this.apiConfig.endpoints.specific.triggerWords, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_path: filePath })
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch trigger words');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching trigger words:', error);
            throw error;
        }
    }

    /**
     * Get letter counts for LoRAs
     */
    async getLetterCounts() {
        try {
            const response = await fetch(this.apiConfig.endpoints.specific.letterCounts);
            if (!response.ok) {
                throw new Error('Failed to fetch letter counts');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching letter counts:', error);
            throw error;
        }
    }
}
