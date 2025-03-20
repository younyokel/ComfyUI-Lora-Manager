import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { createLoraCard } from '../components/LoraCard.js';
import { initializeInfiniteScroll } from '../utils/infiniteScroll.js';
import { showDeleteModal } from '../utils/modalUtils.js';
import { toggleFolder } from '../utils/uiHelpers.js';

export async function loadMoreLoras(resetPage = false, updateFolders = false) {
    const pageState = getCurrentPageState();
    
    if (pageState.isLoading || (!pageState.hasMore && !resetPage)) return;
    
    pageState.isLoading = true;
    try {
        // Reset to first page if requested
        if (resetPage) {
            pageState.currentPage = 1;
            // Clear grid if resetting
            const grid = document.getElementById('loraGrid');
            if (grid) grid.innerHTML = '';
            initializeInfiniteScroll();
        }
        
        const params = new URLSearchParams({
            page: pageState.currentPage,
            page_size: 20,
            sort_by: pageState.sortBy
        });
        
        if (pageState.activeFolder !== null) {
            params.append('folder', pageState.activeFolder);
        }

        // Add search parameters if there's a search term
        if (pageState.filters?.search) {
            params.append('search', pageState.filters.search);
            params.append('fuzzy', 'true');
            
            // Add search option parameters if available
            if (pageState.searchOptions) {
                params.append('search_filename', pageState.searchOptions.filename.toString());
                params.append('search_modelname', pageState.searchOptions.modelname.toString());
                params.append('search_tags', (pageState.searchOptions.tags || false).toString());
                params.append('recursive', (pageState.searchOptions?.recursive ?? false).toString());
            }
        }
        
        // Add filter parameters if active
        if (pageState.filters) {
            if (pageState.filters.tags && pageState.filters.tags.length > 0) {
                // Convert the array of tags to a comma-separated string
                params.append('tags', pageState.filters.tags.join(','));
            }
            if (pageState.filters.baseModel && pageState.filters.baseModel.length > 0) {
                // Convert the array of base models to a comma-separated string
                params.append('base_models', pageState.filters.baseModel.join(','));
            }
        }

        console.log('Loading loras with params:', params.toString());

        const response = await fetch(`/api/loras?${params}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch loras: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        
        if (data.items.length === 0 && pageState.currentPage === 1) {
            const grid = document.getElementById('loraGrid');
            grid.innerHTML = '<div class="no-results">No loras found in this folder</div>';
            pageState.hasMore = false;
        } else if (data.items.length > 0) {
            pageState.hasMore = pageState.currentPage < data.total_pages;
            pageState.currentPage++;
            appendLoraCards(data.items);
            
            const sentinel = document.getElementById('scroll-sentinel');
            if (sentinel && state.observer) {
                state.observer.observe(sentinel);
            }
        } else {
            pageState.hasMore = false;
        }

        if (updateFolders && data.folders) {
            updateFolderTags(data.folders);
        }
        
    } catch (error) {
        console.error('Error loading loras:', error);
        showToast('Failed to load loras: ' + error.message, 'error');
    } finally {
        pageState.isLoading = false;
    }
}

function updateFolderTags(folders) {
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
        tag.addEventListener('click', toggleFolder);
        if (tag.dataset.folder === currentFolder) {
            tag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

export async function fetchCivitai() {
    let ws = null;
    
    await state.loadingManager.showWithProgress(async (loading) => {
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            const ws = new WebSocket(`${wsProtocol}${window.location.host}/ws/fetch-progress`);
            
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
                                `Completed: Updated ${data.success} of ${data.processed} loras`
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
            
            const response = await fetch('/api/fetch-all-civitai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch metadata');
            }
            
            await operationComplete;
            
            await resetAndReload();
            
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

export async function deleteModel(filePath) {
    showDeleteModal(filePath);
}

export async function replacePreview(filePath) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatus = document.querySelector('.loading-status');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/mp4';
    
    input.onchange = async function() {
        if (!input.files || !input.files[0]) return;
        
        const file = input.files[0];
        const formData = new FormData();
        formData.append('preview_file', file);
        formData.append('model_path', filePath);
        
        try {
            loadingOverlay.style.display = 'flex';
            loadingStatus.textContent = 'Uploading preview...';
            
            const response = await fetch('/api/replace_preview', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            
            // 更新预览版本
            state.previewVersions.set(filePath, Date.now());
            
            // 更新卡片显示
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            const previewContainer = card.querySelector('.card-preview');
            const oldPreview = previewContainer.querySelector('img, video');
            
            const previewUrl = `${data.preview_url}?t=${state.previewVersions.get(filePath)}`;
            
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
            
        } catch (error) {
            console.error('Error uploading preview:', error);
            alert('Failed to upload preview image');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    };
    
    input.click();
}

export function appendLoraCards(loras) {
    const grid = document.getElementById('loraGrid');
    const sentinel = document.getElementById('scroll-sentinel');
    
    loras.forEach(lora => {
        const card = createLoraCard(lora);
        if (sentinel) {
            grid.insertBefore(card, sentinel);
        } else {
            grid.appendChild(card);
        }
    });
}

export async function resetAndReload(updateFolders = false) {
    const pageState = getCurrentPageState();
    console.log('Resetting with state:', { ...pageState });
    
    // Initialize infinite scroll - will reset the observer
    initializeInfiniteScroll();
    
    // Load more loras with reset flag
    await loadMoreLoras(true, updateFolders);
}

export async function refreshLoras() {
    try {
        state.loadingManager.showSimpleLoading('Refreshing loras...');
        await resetAndReload();
        showToast('Refresh complete', 'success');
    } catch (error) {
        console.error('Refresh failed:', error);
        showToast('Failed to refresh loras', 'error');
    } finally {
        state.loadingManager.hide();
        state.loadingManager.restoreProgressBar();
    }
}

export async function refreshSingleLoraMetadata(filePath) {
    try {
        state.loadingManager.showSimpleLoading('Refreshing metadata...');
        const response = await fetch('/api/fetch-civitai', {
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
            // Reload the current view to show updated data
            await resetAndReload();
        } else {
            throw new Error(data.error || 'Failed to refresh metadata');
        }
    } catch (error) {
        console.error('Error refreshing metadata:', error);
        showToast(error.message, 'error');
    } finally {
        state.loadingManager.hide();
        state.loadingManager.restoreProgressBar();
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