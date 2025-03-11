import { state } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { createLoraCard } from '../components/LoraCard.js';
import { initializeInfiniteScroll } from '../utils/infiniteScroll.js';
import { showDeleteModal } from '../utils/modalUtils.js';
import { toggleFolder } from '../utils/uiHelpers.js';

export async function loadMoreLoras(boolUpdateFolders = false) {
    if (state.isLoading || !state.hasMore) return;
    
    state.isLoading = true;
    try {
        const params = new URLSearchParams({
            page: state.currentPage,
            page_size: 20,
            sort_by: state.sortBy
        });
        
        // 使用 state 中的 searchManager 获取递归搜索状态
        const isRecursiveSearch = state.searchManager?.isRecursiveSearch ?? false;
        
        if (state.activeFolder !== null) {
            params.append('folder', state.activeFolder);
            params.append('recursive', isRecursiveSearch.toString());
        }

        // Add search parameters if there's a search term
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            params.append('search', searchInput.value.trim());
            params.append('fuzzy', 'true');
        }
        
        // Add filter parameters if active
        if (state.filters) {
            if (state.filters.tags && state.filters.tags.length > 0) {
                // Convert the array of tags to a comma-separated string
                params.append('tags', state.filters.tags.join(','));
            }
            if (state.filters.baseModel && state.filters.baseModel.length > 0) {
                // Convert the array of base models to a comma-separated string
                params.append('base_models', state.filters.baseModel.join(','));
            }
        }

        console.log('Loading loras with params:', params.toString());

        const response = await fetch(`/api/loras?${params}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch loras: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        
        if (data.items.length === 0 && state.currentPage === 1) {
            const grid = document.getElementById('loraGrid');
            grid.innerHTML = '<div class="no-results">No loras found in this folder</div>';
            state.hasMore = false;
        } else if (data.items.length > 0) {
            state.hasMore = state.currentPage < data.total_pages;
            state.currentPage++;
            appendLoraCards(data.items);
            
            const sentinel = document.getElementById('scroll-sentinel');
            if (sentinel && state.observer) {
                state.observer.observe(sentinel);
            }
        } else {
            state.hasMore = false;
        }

        if (boolUpdateFolders && data.folders) {
            updateFolderTags(data.folders);
        }
        
    } catch (error) {
        console.error('Error loading loras:', error);
        showToast('Failed to load loras: ' + error.message, 'error');
    } finally {
        state.isLoading = false;
    }
}

function updateFolderTags(folders) {
    const folderTagsContainer = document.querySelector('.folder-tags');
    if (!folderTagsContainer) return;

    // Keep track of currently selected folder
    const currentFolder = state.activeFolder;

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

export async function resetAndReload(boolUpdateFolders = false) {
    console.log('Resetting with state:', { ...state });
    
    state.currentPage = 1;
    state.hasMore = true;
    state.isLoading = false;
    
    const grid = document.getElementById('loraGrid');
    grid.innerHTML = '';
    
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    grid.appendChild(sentinel);
    
    initializeInfiniteScroll();
    
    await loadMoreLoras(boolUpdateFolders);
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