import { state, getCurrentPageState } from '../state/index.js';
import { showToast, updateFolderTags } from '../utils/uiHelpers.js';
import { getSessionItem, saveMapToStorage } from '../utils/storageHelpers.js';
import { 
    getCompleteApiConfig, 
    getCurrentModelType, 
    isValidModelType,
    DOWNLOAD_ENDPOINTS,
    WS_ENDPOINTS
} from './apiConfig.js';

/**
 * Universal API client for all model types
 */
class ModelApiClient {
    constructor(modelType = null) {
        this.modelType = modelType || getCurrentModelType();
        this.apiConfig = getCompleteApiConfig(this.modelType);
    }

    /**
     * Set the model type for this client instance
     * @param {string} modelType - The model type to use
     */
    setModelType(modelType) {
        if (!isValidModelType(modelType)) {
            throw new Error(`Invalid model type: ${modelType}`);
        }
        this.modelType = modelType;
        this.apiConfig = getCompleteApiConfig(modelType);
    }

    /**
     * Get the current page state for this model type
     */
    getPageState() {
        const currentType = state.currentPageType;
        // Temporarily switch to get the right page state
        state.currentPageType = this.modelType;
        const pageState = getCurrentPageState();
        state.currentPageType = currentType; // Restore
        return pageState;
    }

    /**
     * Fetch models with pagination
     */
    async fetchModelsPage(page = 1, pageSize = null) {
        const pageState = this.getPageState();
        const actualPageSize = pageSize || pageState.pageSize || this.apiConfig.config.defaultPageSize;
        
        try {
            const params = this._buildQueryParams({
                page,
                page_size: actualPageSize,
                sort_by: pageState.sortBy
            }, pageState);

            const response = await fetch(`${this.apiConfig.endpoints.list}?${params}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.apiConfig.config.displayName}s: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return {
                items: data.items,
                totalItems: data.total,
                totalPages: data.total_pages,
                currentPage: page,
                hasMore: page < data.total_pages,
                folders: data.folders
            };
            
        } catch (error) {
            console.error(`Error fetching ${this.apiConfig.config.displayName}s:`, error);
            showToast(`Failed to fetch ${this.apiConfig.config.displayName}s: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Reset and reload models with virtual scrolling
     */
    async loadMoreWithVirtualScroll(resetPage = false, updateFolders = false) {
        const pageState = this.getPageState();
        
        try {
            state.loadingManager.showSimpleLoading(`Loading more ${this.apiConfig.config.displayName}s...`);

            pageState.isLoading = true;
            if (resetPage) {
                pageState.currentPage = 1; // Reset to first page
            }
            
            // Fetch the current page
            const startTime = performance.now();
            const result = await this.fetchModelsPage(pageState.currentPage, pageState.pageSize);
            const endTime = performance.now();
            console.log(`fetchModelsPage耗时: ${(endTime - startTime).toFixed(2)} ms`);
            
            // Update the virtual scroller
            state.virtualScroller.refreshWithData(
                result.items,
                result.totalItems,
                result.hasMore
            );
            
            // Update state
            pageState.hasMore = result.hasMore;
            pageState.currentPage = pageState.currentPage + 1;
            
            // Update folders if needed
            if (updateFolders && result.folders) {
                updateFolderTags(result.folders);
            }
            
            return result;
        } catch (error) {
            console.error(`Error reloading ${this.apiConfig.config.displayName}s:`, error);
            showToast(`Failed to reload ${this.apiConfig.config.displayName}s: ${error.message}`, 'error');
            throw error;
        } finally {
            pageState.isLoading = false;
            state.loadingManager.hide();
        }
    }

    /**
     * Delete a model
     */
    async deleteModel(filePath) {
        try {
            state.loadingManager.showSimpleLoading(`Deleting ${this.apiConfig.config.singularName}...`);

            const response = await fetch(this.apiConfig.endpoints.delete, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to delete ${this.apiConfig.config.singularName}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                if (state.virtualScroller) {
                    state.virtualScroller.removeItemByFilePath(filePath);
                }
                showToast(`${this.apiConfig.config.displayName} deleted successfully`, 'success');
                return true;
            } else {
                throw new Error(data.error || `Failed to delete ${this.apiConfig.config.singularName}`);
            }
        } catch (error) {
            console.error(`Error deleting ${this.apiConfig.config.singularName}:`, error);
            showToast(`Failed to delete ${this.apiConfig.config.singularName}: ${error.message}`, 'error');
            return false;
        } finally {
            state.loadingManager.hide();
        }
    }

    /**
     * Exclude a model
     */
    async excludeModel(filePath) {
        try {
            state.loadingManager.showSimpleLoading(`Excluding ${this.apiConfig.config.singularName}...`);

            const response = await fetch(this.apiConfig.endpoints.exclude, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to exclude ${this.apiConfig.config.singularName}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                if (state.virtualScroller) {
                    state.virtualScroller.removeItemByFilePath(filePath);
                }
                showToast(`${this.apiConfig.config.displayName} excluded successfully`, 'success');
                return true;
            } else {
                throw new Error(data.error || `Failed to exclude ${this.apiConfig.config.singularName}`);
            }
        } catch (error) {
            console.error(`Error excluding ${this.apiConfig.config.singularName}:`, error);
            showToast(`Failed to exclude ${this.apiConfig.config.singularName}: ${error.message}`, 'error');
            return false;
        } finally {
            state.loadingManager.hide();
        }
    }

    /**
     * Rename a model file
     */
    async renameModelFile(filePath, newFileName) {
        try {
            state.loadingManager.showSimpleLoading(`Renaming ${this.apiConfig.config.singularName} file...`);
            
            const response = await fetch(this.apiConfig.endpoints.rename, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: filePath,
                    new_file_name: newFileName
                })
            });

            const result = await response.json();

            if (result.success) {
                state.virtualScroller.updateSingleItem(filePath, { 
                    file_name: newFileName, 
                    file_path: result.new_file_path,
                    preview_url: result.new_preview_path
                });
    
                showToast('File name updated successfully', 'success');
            } else {
                showToast('Failed to rename file: ' + (result.error || 'Unknown error'), 'error');
            }

            return result;
        } catch (error) {
            console.error(`Error renaming ${this.apiConfig.config.singularName} file:`, error);
            throw error;
        } finally {
            state.loadingManager.hide();
        }
    }

    /**
     * Replace model preview
     */
    replaceModelPreview(filePath) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/mp4';
        
        input.onchange = async () => {
            if (!input.files || !input.files[0]) return;
            
            const file = input.files[0];
            await this.uploadPreview(filePath, file);
        };
        
        input.click();
    }

    /**
     * Upload preview image
     */
    async uploadPreview(filePath, file, nsfwLevel = 0) {
        try {
            state.loadingManager.showSimpleLoading('Uploading preview...');
            
            const formData = new FormData();
            formData.append('preview_file', file);
            formData.append('model_path', filePath);
            formData.append('nsfw_level', nsfwLevel.toString());

            const response = await fetch(this.apiConfig.endpoints.replacePreview, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            const pageState = this.getPageState();
            
            // Update the version timestamp
            const timestamp = Date.now();
            if (pageState.previewVersions) {
                pageState.previewVersions.set(filePath, timestamp);
                
                const storageKey = `${this.modelType}_preview_versions`;
                saveMapToStorage(storageKey, pageState.previewVersions);
            }

            const updateData = {
                preview_url: data.preview_url,
                preview_nsfw_level: data.preview_nsfw_level
            };

            state.virtualScroller.updateSingleItem(filePath, updateData);
            showToast('Preview updated successfully', 'success');
        } catch (error) {
            console.error('Error uploading preview:', error);
            showToast('Failed to upload preview image', 'error');
        } finally {
            state.loadingManager.hide();
        }
    }

    /**
     * Save model metadata
     */
    async saveModelMetadata(filePath, data) {
        try {
            state.loadingManager.showSimpleLoading('Saving metadata...');
            
            const response = await fetch(this.apiConfig.endpoints.save, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: filePath,
                    ...data
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save metadata');
            }

            state.virtualScroller.updateSingleItem(filePath, data);
            return response.json();
        } finally {
            state.loadingManager.hide();
        }
    }

    /**
     * Refresh models (scan)
     */
    async refreshModels(fullRebuild = false) {
        try {
            state.loadingManager.showSimpleLoading(
                `${fullRebuild ? 'Full rebuild' : 'Refreshing'} ${this.apiConfig.config.displayName}s...`
            );
            
            const url = new URL(this.apiConfig.endpoints.scan, window.location.origin);
            url.searchParams.append('full_rebuild', fullRebuild);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to refresh ${this.apiConfig.config.displayName}s: ${response.status} ${response.statusText}`);
            }
            
            showToast(`${fullRebuild ? 'Full rebuild' : 'Refresh'} complete`, 'success');
        } catch (error) {
            console.error('Refresh failed:', error);
            showToast(`Failed to ${fullRebuild ? 'rebuild' : 'refresh'} ${this.apiConfig.config.displayName}s`, 'error');
        } finally {
            state.loadingManager.hide();
            state.loadingManager.restoreProgressBar();
        }
    }

    /**
     * Fetch CivitAI metadata for single model
     */
    async refreshSingleModelMetadata(filePath) {
        try {
            state.loadingManager.showSimpleLoading('Refreshing metadata...');
            
            const response = await fetch(this.apiConfig.endpoints.fetchCivitai, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh metadata');
            }

            const data = await response.json();
            
            if (data.success) {
                if (data.metadata && state.virtualScroller) {
                    state.virtualScroller.updateSingleItem(filePath, data.metadata);
                }

                showToast('Metadata refreshed successfully', 'success');
                return true;
            } else {
                throw new Error(data.error || 'Failed to refresh metadata');
            }
        } catch (error) {
            console.error('Error refreshing metadata:', error);
            showToast(error.message, 'error');
            return false;
        } finally {
            state.loadingManager.hide();
            state.loadingManager.restoreProgressBar();
        }
    }

    /**
     * Fetch CivitAI metadata for all models
     */
    async fetchCivitaiMetadata() {
        let ws = null;
        
        await state.loadingManager.showWithProgress(async (loading) => {
            try {
                const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
                ws = new WebSocket(`${wsProtocol}${window.location.host}${WS_ENDPOINTS.fetchProgress}`);
                
                const operationComplete = new Promise((resolve, reject) => {
                    ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        
                        switch(data.status) {
                            case 'started':
                                loading.setStatus('Starting metadata fetch...');
                                break;
                                
                            case 'processing':
                                const percent = ((data.processed / data.total) * 100).toFixed(1);
                                loading.setProgress(percent);
                                loading.setStatus(
                                    `Processing (${data.processed}/${data.total}) ${data.current_name}`
                                );
                                break;
                                
                            case 'completed':
                                loading.setProgress(100);
                                loading.setStatus(
                                    `Completed: Updated ${data.success} of ${data.processed} ${this.apiConfig.config.displayName}s`
                                );
                                resolve();
                                break;
                                
                            case 'error':
                                reject(new Error(data.error));
                                break;
                        }
                    };
                    
                    ws.onerror = (error) => {
                        reject(new Error('WebSocket error: ' + error.message));
                    };
                });
                
                await new Promise((resolve, reject) => {
                    ws.onopen = resolve;
                    ws.onerror = reject;
                });
                
                const response = await fetch(this.apiConfig.endpoints.fetchAllCivitai, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                
                if (!response.ok) {
                    throw new Error('Failed to fetch metadata');
                }
                
                await operationComplete;
                
            } catch (error) {
                console.error('Error fetching metadata:', error);
                showToast('Failed to fetch metadata: ' + error.message, 'error');
            } finally {
                if (ws) {
                    ws.close();
                }
            }
        }, {
            initialMessage: 'Connecting...',
            completionMessage: 'Metadata update complete'
        });
    }

    /**
     * Move a single model to target path
     * @returns {string|null} - The new file path if moved, null if not moved
     */
    async moveSingleModel(filePath, targetPath) {
        if (filePath.substring(0, filePath.lastIndexOf('/')) === targetPath) {
            showToast('Model is already in the selected folder', 'info');
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
            throw new Error('Failed to move model');
        }

        if (result && result.message) {
            showToast(result.message, 'info');
        } else {
            showToast('Model moved successfully', 'success');
        }

        // Return new file path if move succeeded
        if (result.success) {
            return targetPath;
        }
        return null;
    }

    /**
     * Move multiple models to target path
     * @returns {Array<string>} - Array of new file paths that were moved successfully
     */
    async moveBulkModels(filePaths, targetPath) {
        const movedPaths = filePaths.filter(path => {
            return path.substring(0, path.lastIndexOf('/')) !== targetPath;
        });

        if (movedPaths.length === 0) {
            showToast('All selected models are already in the target folder', 'info');
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
            throw new Error('Failed to move models');
        }

        let successFilePaths = [];
        if (result.success) {
            if (result.failure_count > 0) {
                showToast(`Moved ${result.success_count} models, ${result.failure_count} failed`, 'warning');
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
                showToast(`Successfully moved ${result.success_count} models`, 'success');
            }
            // Collect new file paths for successful moves
            successFilePaths = result.results
                .filter(r => r.success)
                .map(r => r.path);
        } else {
            throw new Error(result.message || 'Failed to move models');
        }
        return successFilePaths;
    }

    /**
     * Build query parameters for API requests
     */
    _buildQueryParams(baseParams, pageState) {
        const params = new URLSearchParams(baseParams);
        
        // Add common parameters
        if (pageState.activeFolder !== null) {
            params.append('folder', pageState.activeFolder);
        }

        if (pageState.showFavoritesOnly) {
            params.append('favorites_only', 'true');
        }
        
        // Add letter filter for supported model types
        if (this.apiConfig.config.supportsLetterFilter && pageState.activeLetterFilter) {
            params.append('first_letter', pageState.activeLetterFilter);
        }

        // Add search parameters
        if (pageState.filters?.search) {
            params.append('search', pageState.filters.search);
            params.append('fuzzy', 'true');
            
            if (pageState.searchOptions) {
                params.append('search_filename', pageState.searchOptions.filename.toString());
                params.append('search_modelname', pageState.searchOptions.modelname.toString());
                if (pageState.searchOptions.tags !== undefined) {
                    params.append('search_tags', pageState.searchOptions.tags.toString());
                }
                params.append('recursive', (pageState.searchOptions?.recursive ?? false).toString());
            }
        }
        
        // Add filter parameters
        if (pageState.filters) {
            if (pageState.filters.tags && pageState.filters.tags.length > 0) {
                pageState.filters.tags.forEach(tag => {
                    params.append('tag', tag);
                });
            }
            
            if (pageState.filters.baseModel && pageState.filters.baseModel.length > 0) {
                pageState.filters.baseModel.forEach(model => {
                    params.append('base_model', model);
                });
            }
        }

        // Add model-specific parameters
        this._addModelSpecificParams(params, pageState);

        return params;
    }

    /**
     * Add model-specific parameters to query
     */
    _addModelSpecificParams(params, pageState) {
        // Override in specific implementations or handle via configuration
        if (this.modelType === 'loras') {
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
    }
}

// Export factory functions and utilities
export function createModelApiClient(modelType = null) {
    return new ModelApiClient(modelType);
}

let _singletonClient = null;

export function getModelApiClient() {
    if (!_singletonClient) {
        _singletonClient = new ModelApiClient();
    }
    _singletonClient.setModelType(state.currentPageType);
    return _singletonClient;
}