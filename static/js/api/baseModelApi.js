// filepath: d:\Workspace\ComfyUI\custom_nodes\ComfyUI-Lora-Manager\static\js\api\baseModelApi.js
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { getSessionItem, saveMapToStorage } from '../utils/storageHelpers.js';

/**
 * Shared functionality for handling models (loras and checkpoints)
 */

// Generic function to load more models with pagination
export async function loadMoreModels(options = {}) {
    const {
        resetPage = false,
        updateFolders = false,
        modelType = 'lora', // 'lora' or 'checkpoint'
        createCardFunction,
        endpoint = '/api/loras'
    } = options;

    const pageState = getCurrentPageState();
    
    if (pageState.isLoading || (!pageState.hasMore && !resetPage)) return;
    
    pageState.isLoading = true;
    document.body.classList.add('loading');
    
    try {
        // Reset to first page if requested
        if (resetPage) {
            pageState.currentPage = 1;
            // Clear grid if resetting
            const gridId = modelType === 'checkpoint' ? 'checkpointGrid' : 'loraGrid';
            const grid = document.getElementById(gridId);
            if (grid) grid.innerHTML = '';
        }
        
        const params = new URLSearchParams({
            page: pageState.currentPage,
            page_size: pageState.pageSize || 20,
            sort_by: pageState.sortBy
        });
        
        if (pageState.activeFolder !== null) {
            params.append('folder', pageState.activeFolder);
        }

        // Add favorites filter parameter if enabled
        if (pageState.showFavoritesOnly) {
            params.append('favorites_only', 'true');
        }
        
        // Add active letter filter if set
        if (pageState.activeLetterFilter) {
            params.append('first_letter', pageState.activeLetterFilter);
        }

        // Add search parameters if there's a search term
        if (pageState.filters?.search) {
            params.append('search', pageState.filters.search);
            params.append('fuzzy', 'true');
            
            // Add search option parameters if available
            if (pageState.searchOptions) {
                params.append('search_filename', pageState.searchOptions.filename.toString());
                params.append('search_modelname', pageState.searchOptions.modelname.toString());
                if (pageState.searchOptions.tags !== undefined) {
                    params.append('search_tags', pageState.searchOptions.tags.toString());
                }
                params.append('recursive', (pageState.searchOptions?.recursive ?? false).toString());
            }
        }
        
        // Add filter parameters if active
        if (pageState.filters) {
            // Handle tags filters
            if (pageState.filters.tags && pageState.filters.tags.length > 0) {
                // Checkpoints API expects individual 'tag' parameters, Loras API expects comma-separated 'tags'
                if (modelType === 'checkpoint') {
                    pageState.filters.tags.forEach(tag => {
                        params.append('tag', tag);
                    });
                } else {
                    params.append('tags', pageState.filters.tags.join(','));
                }
            }
            
            // Handle base model filters
            if (pageState.filters.baseModel && pageState.filters.baseModel.length > 0) {
                if (modelType === 'checkpoint') {
                    pageState.filters.baseModel.forEach(model => {
                        params.append('base_model', model);
                    });
                } else {
                    params.append('base_models', pageState.filters.baseModel.join(','));
                }
            }
        }

        // Add model-specific parameters
        if (modelType === 'lora') {
            // Check for recipe-based filtering parameters from session storage
            const filterLoraHash = getSessionItem('recipe_to_lora_filterLoraHash');
            const filterLoraHashes = getSessionItem('recipe_to_lora_filterLoraHashes');

            // Add hash filter parameter if present
            if (filterLoraHash) {
                params.append('lora_hash', filterLoraHash);
            } 
            // Add multiple hashes filter if present
            else if (filterLoraHashes) {
                try {
                    if (Array.isArray(filterLoraHashes) && filterLoraHashes.length > 0) {
                        params.append('lora_hashes', filterLoraHashes.join(','));
                    }
                } catch (error) {
                    console.error('Error parsing lora hashes from session storage:', error);
                }
            }
        }

        const response = await fetch(`${endpoint}?${params}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const gridId = modelType === 'checkpoint' ? 'checkpointGrid' : 'loraGrid';
        const grid = document.getElementById(gridId);
        
        if (data.items.length === 0 && pageState.currentPage === 1) {
            grid.innerHTML = `<div class="no-results">No ${modelType}s found in this folder</div>`;
            pageState.hasMore = false;
        } else if (data.items.length > 0) {
            pageState.hasMore = pageState.currentPage < data.total_pages;
            
            // Append model cards using the provided card creation function
            data.items.forEach(model => {
                const card = createCardFunction(model);
                grid.appendChild(card);
            });
            
            // Increment the page number AFTER successful loading
            pageState.currentPage++;
        } else {
            pageState.hasMore = false;
        }

        if (updateFolders && data.folders) {
            updateFolderTags(data.folders);
        }
        
    } catch (error) {
        console.error(`Error loading ${modelType}s:`, error);
        showToast(`Failed to load ${modelType}s: ${error.message}`, 'error');
    } finally {
        pageState.isLoading = false;
        document.body.classList.remove('loading');
    }
}

// New method for virtual scrolling fetch
export async function fetchModelsPage(options = {}) {
    const {
        modelType = 'lora',
        page = 1,
        pageSize = 100,
        endpoint = '/api/loras'
    } = options;

    const pageState = getCurrentPageState();
    
    try {
        const params = new URLSearchParams({
            page: page,
            page_size: pageSize || pageState.pageSize || 20,
            sort_by: pageState.sortBy
        });
        
        if (pageState.activeFolder !== null) {
            params.append('folder', pageState.activeFolder);
        }

        // Add favorites filter parameter if enabled
        if (pageState.showFavoritesOnly) {
            params.append('favorites_only', 'true');
        }
        
        // Add active letter filter if set
        if (pageState.activeLetterFilter) {
            params.append('first_letter', pageState.activeLetterFilter);
        }

        // Add search parameters if there's a search term
        if (pageState.filters?.search) {
            params.append('search', pageState.filters.search);
            params.append('fuzzy', 'true');
            
            // Add search option parameters if available
            if (pageState.searchOptions) {
                params.append('search_filename', pageState.searchOptions.filename.toString());
                params.append('search_modelname', pageState.searchOptions.modelname.toString());
                if (pageState.searchOptions.tags !== undefined) {
                    params.append('search_tags', pageState.searchOptions.tags.toString());
                }
                params.append('recursive', (pageState.searchOptions?.recursive ?? false).toString());
            }
        }
        
        // Add filter parameters if active
        if (pageState.filters) {
            // Handle tags filters
            if (pageState.filters.tags && pageState.filters.tags.length > 0) {
                // Checkpoints API expects individual 'tag' parameters, Loras API expects comma-separated 'tags'
                if (modelType === 'checkpoint') {
                    pageState.filters.tags.forEach(tag => {
                        params.append('tag', tag);
                    });
                } else {
                    params.append('tags', pageState.filters.tags.join(','));
                }
            }
            
            // Handle base model filters
            if (pageState.filters.baseModel && pageState.filters.baseModel.length > 0) {
                if (modelType === 'checkpoint') {
                    pageState.filters.baseModel.forEach(model => {
                        params.append('base_model', model);
                    });
                } else {
                    params.append('base_models', pageState.filters.baseModel.join(','));
                }
            }
        }

        // Add model-specific parameters
        if (modelType === 'lora') {
            // Check for recipe-based filtering parameters from session storage
            const filterLoraHash = getSessionItem('recipe_to_lora_filterLoraHash');
            const filterLoraHashes = getSessionItem('recipe_to_lora_filterLoraHashes');

            // Add hash filter parameter if present
            if (filterLoraHash) {
                params.append('lora_hash', filterLoraHash);
            } 
            // Add multiple hashes filter if present
            else if (filterLoraHashes) {
                try {
                    if (Array.isArray(filterLoraHashes) && filterLoraHashes.length > 0) {
                        params.append('lora_hashes', filterLoraHashes.join(','));
                    }
                } catch (error) {
                    console.error('Error parsing lora hashes from session storage:', error);
                }
            }
        }

        const response = await fetch(`${endpoint}?${params}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
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
        console.error(`Error fetching ${modelType}s:`, error);
        showToast(`Failed to fetch ${modelType}s: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Reset and reload models using virtual scrolling
 * @param {Object} options - Operation options
 * @returns {Promise<Object>} The fetch result
 */
export async function resetAndReloadWithVirtualScroll(options = {}) {
    const {
        modelType = 'lora',
        updateFolders = false,
        fetchPageFunction
    } = options;
    
    const pageState = getCurrentPageState();
    
    try {
        pageState.isLoading = true;
        document.body.classList.add('loading');
        
        // Reset page counter
        pageState.currentPage = 1;
        
        // Fetch the first page
        const result = await fetchPageFunction(1, pageState.pageSize || 50);
        
        // Update the virtual scroller
        state.virtualScroller.refreshWithData(
            result.items,
            result.totalItems,
            result.hasMore
        );
        
        // Update state
        pageState.hasMore = result.hasMore;
        pageState.currentPage = 2; // Next page will be 2
        
        // Update folders if needed
        if (updateFolders && result.folders) {
            updateFolderTags(result.folders);
        }
        
        return result;
    } catch (error) {
        console.error(`Error reloading ${modelType}s:`, error);
        showToast(`Failed to reload ${modelType}s: ${error.message}`, 'error');
        throw error;
    } finally {
        pageState.isLoading = false;
        document.body.classList.remove('loading');
    }
}

/**
 * Load more models using virtual scrolling
 * @param {Object} options - Operation options
 * @returns {Promise<Object>} The fetch result
 */
export async function loadMoreWithVirtualScroll(options = {}) {
    const {
        modelType = 'lora',
        resetPage = false,
        updateFolders = false,
        fetchPageFunction
    } = options;
    
    const pageState = getCurrentPageState();
    
    try {
        // Start loading state
        pageState.isLoading = true;
        document.body.classList.add('loading');
        
        // Reset to first page if requested
        if (resetPage) {
            pageState.currentPage = 1;
        }
        
        // Fetch the first page of data
        const result = await fetchPageFunction(pageState.currentPage, pageState.pageSize || 50);
        
        // Update virtual scroller with the new data
        state.virtualScroller.refreshWithData(
            result.items,
            result.totalItems,
            result.hasMore
        );
        
        // Update state
        pageState.hasMore = result.hasMore;
        pageState.currentPage = 2; // Next page to load would be 2
        
        // Update folders if needed
        if (updateFolders && result.folders) {
            updateFolderTags(result.folders);
        }
        
        return result;
    } catch (error) {
        console.error(`Error loading ${modelType}s:`, error);
        showToast(`Failed to load ${modelType}s: ${error.message}`, 'error');
        throw error;
    } finally {
        pageState.isLoading = false;
        document.body.classList.remove('loading');
    }
}

// Update folder tags in the UI
export function updateFolderTags(folders) {
    const folderTagsContainer = document.querySelector('.folder-tags');
    if (!folderTagsContainer) return;

    // Keep track of currently selected folder
    const pageState = getCurrentPageState();
    const currentFolder = pageState.activeFolder;

    // Create HTML for folder tags
    const tagsHTML = folders.map(folder => {
        const isActive = folder === currentFolder;
        return `<div class="tag ${isActive ? 'active' : ''}" data-folder="${folder}">${folder}</div>`;
    }).join('');

    // Update the container
    folderTagsContainer.innerHTML = tagsHTML;

    // Reattach click handlers and ensure the active tag is visible
    const tags = folderTagsContainer.querySelectorAll('.tag');
    tags.forEach(tag => {
        if (typeof toggleFolder === 'function') {
            tag.addEventListener('click', toggleFolder);
        }
        if (tag.dataset.folder === currentFolder) {
            tag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

// Generic function to replace a model preview
export function replaceModelPreview(filePath, modelType = 'lora') {
    // Open file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept ='image/*,video/mp4'; 
    
    input.onchange = async function() {
        if (!input.files || !input.files[0]) return;
        
        const file = input.files[0];
        await uploadPreview(filePath, file, modelType);
    };
    
    input.click();
}

// Delete a model (generic)
export async function deleteModel(filePath, modelType = 'lora') {
    try {
        const endpoint = modelType === 'checkpoint' 
            ? '/api/checkpoints/delete' 
            : '/api/delete_model';
            
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_path: filePath
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete ${modelType}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // If virtual scroller exists, update its data
            if (state.virtualScroller) {
                state.virtualScroller.removeItemByFilePath(filePath);
            } else {
                // Legacy approach: remove the card from UI directly
                const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
                if (card) {
                    card.remove();
                }
            }
            
            showToast(`${modelType} deleted successfully`, 'success');
            return true;
        } else {
            throw new Error(data.error || `Failed to delete ${modelType}`);
        }
    } catch (error) {
        console.error(`Error deleting ${modelType}:`, error);
        showToast(`Failed to delete ${modelType}: ${error.message}`, 'error');
        return false;
    }
}

// Reset and reload models
export async function resetAndReload(options = {}) {
    const {
        updateFolders = false,
        modelType = 'lora', 
        loadMoreFunction
    } = options;
    
    const pageState = getCurrentPageState();
    
    // Reset pagination and load more models
    if (typeof loadMoreFunction === 'function') {
        await loadMoreFunction(true, updateFolders);
    }
}

// Generic function to refresh models
export async function refreshModels(options = {}) {
    const { 
        modelType = 'lora',
        scanEndpoint = '/api/loras/scan',
        resetAndReloadFunction,
        fullRebuild = false // New parameter with default value false
    } = options;
    
    try {
        state.loadingManager.showSimpleLoading(`${fullRebuild ? 'Full rebuild' : 'Refreshing'} ${modelType}s...`);
        
        // Add fullRebuild parameter to the request
        const url = new URL(scanEndpoint, window.location.origin);
        url.searchParams.append('full_rebuild', fullRebuild);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to refresh ${modelType}s: ${response.status} ${response.statusText}`);
        }
        
        if (typeof resetAndReloadFunction === 'function') {
            await resetAndReloadFunction(true); // update folders
        }
        
        showToast(`${fullRebuild ? 'Full rebuild' : 'Refresh'} complete`, 'success');
    } catch (error) {
        console.error(`Refresh failed:`, error);
        showToast(`Failed to ${fullRebuild ? 'rebuild' : 'refresh'} ${modelType}s`, 'error');
    } finally {
        state.loadingManager.hide();
        state.loadingManager.restoreProgressBar();
    }
}

// Generic fetch from Civitai
export async function fetchCivitaiMetadata(options = {}) {
    const {
        modelType = 'lora',
        fetchEndpoint = '/api/fetch-all-civitai',
        resetAndReloadFunction
    } = options;
    
    let ws = null;
    
    await state.loadingManager.showWithProgress(async (loading) => {
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            ws = new WebSocket(`${wsProtocol}${window.location.host}/ws/fetch-progress`);
            
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
                                `Completed: Updated ${data.success} of ${data.processed} ${modelType}s`
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
            
            const requestBody = modelType === 'checkpoint' 
                ? JSON.stringify({ model_type: 'checkpoint' }) 
                : JSON.stringify({});
                
            const response = await fetch(fetchEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch metadata');
            }
            
            await operationComplete;
            
            if (typeof resetAndReloadFunction === 'function') {
                await resetAndReloadFunction();
            }
            
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

// Generic function to refresh single model metadata
export async function refreshSingleModelMetadata(filePath, modelType = 'lora') {
    try {
        state.loadingManager.showSimpleLoading('Refreshing metadata...');
        
        const endpoint = modelType === 'checkpoint' 
            ? '/api/checkpoints/fetch-civitai'
            : '/api/fetch-civitai';
            
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file_path: filePath })
        });

        if (!response.ok) {
            throw new Error('Failed to refresh metadata');
        }

        const data = await response.json();
        
        if (data.success) {
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

// Generic function to exclude a model
export async function excludeModel(filePath, modelType = 'lora') {
    try {
        const endpoint = modelType === 'checkpoint' 
            ? '/api/checkpoints/exclude' 
            : '/api/loras/exclude';
            
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_path: filePath
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to exclude ${modelType}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // If virtual scroller exists, update its data
            if (state.virtualScroller) {
                state.virtualScroller.removeItemByFilePath(filePath);
            } else {
                // Legacy approach: remove the card from UI directly
                const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
                if (card) {
                    card.remove();
                }
            }
            
            showToast(`${modelType} excluded successfully`, 'success');
            return true;
        } else {
            throw new Error(data.error || `Failed to exclude ${modelType}`);
        }
    } catch (error) {
        console.error(`Error excluding ${modelType}:`, error);
        showToast(`Failed to exclude ${modelType}: ${error.message}`, 'error');
        return false;
    }
}

// Private methods

// Upload a preview image
async function uploadPreview(filePath, file, modelType = 'lora') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatus = document.querySelector('.loading-status');
    
    try {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (loadingStatus) loadingStatus.textContent = 'Uploading preview...';
        
        const formData = new FormData();
        
        // Use appropriate parameter names and endpoint based on model type
        // Prepare common form data
        formData.append('preview_file', file);
        formData.append('model_path', filePath);

        // Set endpoint based on model type
        const endpoint = modelType === 'checkpoint' 
            ? '/api/checkpoints/replace-preview'
            : '/api/replace_preview';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        
        // Update the card preview in UI
        const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
        if (card) {
            const previewContainer = card.querySelector('.card-preview');
            const oldPreview = previewContainer.querySelector('img, video');
            
            // Get the current page's previewVersions Map based on model type
            const pageType = modelType === 'checkpoint' ? 'checkpoints' : 'loras';
            const previewVersions = state.pages[pageType].previewVersions;
            
            // Update the version timestamp
            const timestamp = Date.now();
            if (previewVersions) {
                previewVersions.set(filePath, timestamp);
                
                // Save the updated Map to localStorage
                const storageKey = modelType === 'checkpoint' ? 'checkpoint_preview_versions' : 'lora_preview_versions';
                saveMapToStorage(storageKey, previewVersions);
            }
            
            const previewUrl = data.preview_url ? 
                `${data.preview_url}?t=${timestamp}` : 
                `/api/model/preview_image?path=${encodeURIComponent(filePath)}&t=${timestamp}`;
            
            // Create appropriate element based on file type
            if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.controls = true;
                video.autoplay = true;
                video.muted = true;
                video.loop = true;
                video.src = previewUrl;
                oldPreview.replaceWith(video);
            } else {
                const img = document.createElement('img');
                img.src = previewUrl;
                oldPreview.replaceWith(img);
            }
            
            showToast('Preview updated successfully', 'success');
        }
    } catch (error) {
        console.error('Error uploading preview:', error);
        showToast('Failed to upload preview image', 'error');
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// Private function to perform the delete operation
async function performDelete(filePath, modelType = 'lora') {
    try {
        showToast(`Deleting ${modelType}...`, 'info');
        
        const response = await fetch('/api/model/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_path: filePath,
                model_type: modelType
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete ${modelType}: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Remove the card from UI
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            if (card) {
                card.remove();
            }
            
            showToast(`${modelType} deleted successfully`, 'success');
        } else {
            throw new Error(data.error || `Failed to delete ${modelType}`);
        }
    } catch (error) {
        console.error(`Error deleting ${modelType}:`, error);
        showToast(`Failed to delete ${modelType}: ${error.message}`, 'error');
    }
}