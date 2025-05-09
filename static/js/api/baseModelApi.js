// filepath: d:\Workspace\ComfyUI\custom_nodes\ComfyUI-Lora-Manager\static\js\api\baseModelApi.js
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { getSessionItem, saveMapToStorage } from '../utils/storageHelpers.js';

/**
 * Shared functionality for handling models (loras and checkpoints)
 */

// Virtual scrolling configuration
const VIRTUAL_SCROLL_CONFIG = {
    MAX_DOM_CARDS: 300, // Maximum DOM elements to keep
    BUFFER_SIZE: 20,    // Extra items to render above/below viewport
    CLEANUP_INTERVAL: 5000, // How often to check for cards to clean up (ms)
}

// Track rendered items and all loaded items
const virtualScrollState = {
    visibleItems: new Map(), // Track rendered items by filepath
    allItems: [],            // All data items loaded so far
    observer: null,          // IntersectionObserver for visibility tracking
    cleanupTimer: null,      // Timer for periodic cleanup
    initialized: false       // Whether virtual scrolling is initialized
}

// Initialize virtual scrolling
function initVirtualScroll(modelType) {
    if (virtualScrollState.initialized) return;
    
    const gridId = modelType === 'checkpoint' ? 'checkpointGrid' : 'loraGrid';
    const gridElement = document.getElementById(gridId);
    if (!gridElement) return;
    
    // Create intersection observer to track visible cards
    virtualScrollState.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const cardElement = entry.target;
            const filepath = cardElement.dataset.filepath;
            
            if (entry.isIntersecting) {
                // Load media for cards entering viewport
                lazyLoadCardMedia(cardElement);
            } else {
                // Card is no longer visible
                if (entry.boundingClientRect.top < -1000 || entry.boundingClientRect.top > window.innerHeight + 1000) {
                    // If card is far outside viewport, consider removing it
                    virtualScrollState.visibleItems.delete(filepath);
                    cleanupCardResources(cardElement);
                    cardElement.remove();
                }
            }
        });
    }, {
        rootMargin: '500px', // Start loading when within 500px of viewport
        threshold: 0
    });
    
    // Set up periodic cleanup for DOM elements
    virtualScrollState.cleanupTimer = setInterval(() => {
        checkCardThreshold(modelType);
    }, VIRTUAL_SCROLL_CONFIG.CLEANUP_INTERVAL);
    
    // Set up scroll event listener for loading more content
    window.addEventListener('scroll', throttle(() => {
        const scrollPosition = window.scrollY + window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // If we're close to the bottom and not already loading, load more
        if (scrollPosition > documentHeight - 1000) {
            const pageState = getCurrentPageState();
            if (!pageState.isLoading && pageState.hasMore) {
                // This will trigger loading more items using the existing pagination
                const loadMoreFunction = modelType === 'checkpoint' ? 
                    window.loadMoreCheckpoints : window.loadMoreLoras;
                    
                if (typeof loadMoreFunction === 'function') {
                    loadMoreFunction(false, false);
                }
            }
        }
    }, 200));
    
    virtualScrollState.initialized = true;
}

// Clean up resources for a card
function cleanupCardResources(cardElement) {
    try {
        // Stop videos and free resources
        const video = cardElement.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
            video.load();
        }
        
        // Remove from observer
        if (virtualScrollState.observer) {
            virtualScrollState.observer.unobserve(cardElement);
        }
    } catch (e) {
        console.error('Error cleaning up card resources:', e);
    }
}

// Lazy load media content in a card
function lazyLoadCardMedia(cardElement) {
    // Lazy load images
    const img = cardElement.querySelector('img[data-src]');
    if (img) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
    }
    
    // Lazy load videos
    const video = cardElement.querySelector('video[data-src]');
    if (video) {
        video.src = video.dataset.src;
        video.removeAttribute('data-src');
        
        // Check if we should autoplay this video
        const autoplayOnHover = state?.global?.settings?.autoplayOnHover || false;
        
        if (!autoplayOnHover) {
            // If not in hover-only mode, autoplay videos when they enter viewport
            video.muted = true; // Muted videos can autoplay without user interaction
            video.play().catch(err => {
                console.log("Could not autoplay video, likely due to browser policy:", err);
            });
        }
    }
}

// Check if we need to clean up any cards
function checkCardThreshold(modelType) {
    const gridId = modelType === 'checkpoint' ? 'checkpointGrid' : 'loraGrid';
    const cards = document.querySelectorAll(`#${gridId} .lora-card`);
    
    if (cards.length > VIRTUAL_SCROLL_CONFIG.MAX_DOM_CARDS) {
        // We have more cards than our threshold, remove those far from viewport
        const cardsToRemove = cards.length - VIRTUAL_SCROLL_CONFIG.MAX_DOM_CARDS;
        console.log(`Cleaning up ${cardsToRemove} cards to maintain performance`);
        
        let removedCount = 0;
        cards.forEach(card => {
            if (removedCount >= cardsToRemove) return;
            
            const rect = card.getBoundingClientRect();
            // Remove cards that are far outside viewport
            if (rect.bottom < -1000 || rect.top > window.innerHeight + 1000) {
                const filepath = card.dataset.filepath;
                virtualScrollState.visibleItems.delete(filepath);
                cleanupCardResources(card);
                card.remove();
                removedCount++;
            }
        });
    }
}

// Utility function to throttle function calls
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

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
        // Initialize virtual scrolling if not already done
        initVirtualScroll(modelType);
        
        // Reset pagination and state if requested
        if (resetPage) {
            pageState.currentPage = 1;
            
            // Clear the grid and virtual scroll state
            const gridId = modelType === 'checkpoint' ? 'checkpointGrid' : 'loraGrid';
            const grid = document.getElementById(gridId);
            if (grid) grid.innerHTML = '';
            
            virtualScrollState.visibleItems.clear();
            virtualScrollState.allItems = [];
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
            
            // Add new items to our collection of all items
            virtualScrollState.allItems = [...virtualScrollState.allItems, ...data.items];
            
            // Create and append cards with optimized rendering
            data.items.forEach(model => {
                // Skip if we already have this card rendered
                if (virtualScrollState.visibleItems.has(model.file_path)) return;
                
                // Create the card with lazy loading for media
                const card = createOptimizedCard(model, createCardFunction);
                grid.appendChild(card);
                
                // Track this card and observe it
                virtualScrollState.visibleItems.set(model.file_path, card);
                if (virtualScrollState.observer) {
                    virtualScrollState.observer.observe(card);
                }
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

// Create a card with optimizations for lazy loading media
function createOptimizedCard(model, createCardFunction) {
    // Create the card using the original function
    const card = createCardFunction(model);
    
    // Optimize image/video loading
    const img = card.querySelector('img');
    if (img) {
        // Replace src with data-src to defer loading
        img.dataset.src = img.src;
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // Tiny transparent placeholder
    }
    
    const video = card.querySelector('video');
    if (video) {
        const source = video.querySelector('source');
        if (source) {
            // Store the video source for lazy loading
            video.dataset.src = source.src;
            source.removeAttribute('src');
        } else if (video.src) {
            // Handle direct src attribute
            video.dataset.src = video.src;
            video.removeAttribute('src');
        }
        
        // Save autoplay state but prevent autoplay until visible
        if (video.hasAttribute('autoplay')) {
            video.dataset.autoplay = 'true';
            video.removeAttribute('autoplay');
        }
    }
    
    return card;
}

// Clean up virtual scroll when page changes
export function cleanupVirtualScroll() {
    if (virtualScrollState.observer) {
        virtualScrollState.observer.disconnect();
    }
    
    if (virtualScrollState.cleanupTimer) {
        clearInterval(virtualScrollState.cleanupTimer);
    }
    
    virtualScrollState.visibleItems.clear();
    virtualScrollState.allItems = [];
    virtualScrollState.initialized = false;
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
            // Remove the card from UI
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            if (card) {
                card.remove();
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
        resetAndReloadFunction
    } = options;
    
    try {
        state.loadingManager.showSimpleLoading(`Refreshing ${modelType}s...`);
        
        const response = await fetch(scanEndpoint);
        
        if (!response.ok) {
            throw new Error(`Failed to refresh ${modelType}s: ${response.status} ${response.statusText}`);
        }
        
        if (typeof resetAndReloadFunction === 'function') {
            await resetAndReloadFunction();
        }
        
        showToast(`Refresh complete`, 'success');
    } catch (error) {
        console.error(`Refresh failed:`, error);
        showToast(`Failed to refresh ${modelType}s`, 'error');
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
            // Remove the card from UI
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            if (card) {
                card.remove();
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