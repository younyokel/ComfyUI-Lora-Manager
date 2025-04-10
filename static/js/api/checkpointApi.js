import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { confirmDelete } from '../utils/modalUtils.js';
import { createCheckpointCard } from '../components/CheckpointCard.js';

// Load more checkpoints with pagination
export async function loadMoreCheckpoints(resetPagination = true) {
    try {
        const pageState = getCurrentPageState();
        
        // Don't load if we're already loading or there are no more items
        if (pageState.isLoading || (!resetPagination && !pageState.hasMore)) {
            return;
        }
        
        // Set loading state
        pageState.isLoading = true;
        document.body.classList.add('loading');
        
        // Reset pagination if requested
        if (resetPagination) {
            pageState.currentPage = 1;
            const grid = document.getElementById('checkpointGrid');
            if (grid) grid.innerHTML = '';
        }
        
        // Build API URL with parameters
        const params = new URLSearchParams({
            page: pageState.currentPage,
            page_size: pageState.pageSize || 20,
            sort: pageState.sortBy || 'name'
        });
        
        // Add folder filter if active
        if (pageState.activeFolder) {
            params.append('folder', pageState.activeFolder);
        }
        
        // Add search if available
        if (pageState.filters && pageState.filters.search) {
            params.append('search', pageState.filters.search);
            
            // Add search options
            if (pageState.searchOptions) {
                params.append('search_filename', pageState.searchOptions.filename.toString());
                params.append('search_modelname', pageState.searchOptions.modelname.toString());
                params.append('recursive', pageState.searchOptions.recursive.toString());
            }
        }
        
        // Add base model filters
        if (pageState.filters && pageState.filters.baseModel && pageState.filters.baseModel.length > 0) {
            pageState.filters.baseModel.forEach(model => {
                params.append('base_model', model);
            });
        }
        
        // Add tags filters
        if (pageState.filters && pageState.filters.tags && pageState.filters.tags.length > 0) {
            pageState.filters.tags.forEach(tag => {
                params.append('tag', tag);
            });
        }
        
        // Execute fetch
        const response = await fetch(`/api/checkpoints?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load checkpoints: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Update state with response data
        pageState.hasMore = data.page < data.total_pages;
        
        // Update UI with checkpoints
        const grid = document.getElementById('checkpointGrid');
        if (!grid) {
            return;
        }
        
        // Clear grid if this is the first page
        if (resetPagination) {
            grid.innerHTML = '';
        }
        
        // Check for empty result
        if (data.items.length === 0 && resetPagination) {
            grid.innerHTML = `
                <div class="placeholder-message">
                    <p>No checkpoints found</p>
                    <p>Add checkpoints to your models folders to see them here.</p>
                </div>
            `;
            return;
        }
        
        // Render checkpoint cards
        data.items.forEach(checkpoint => {
            const card = createCheckpointCard(checkpoint);
            grid.appendChild(card);
        });
        
        // Increment the page number AFTER successful loading
        if (data.items.length > 0) {
            pageState.currentPage++;
        }
    } catch (error) {
        console.error('Error loading checkpoints:', error);
        showToast('Failed to load checkpoints', 'error');
    } finally {
        // Clear loading state
        const pageState = getCurrentPageState();
        pageState.isLoading = false;
        document.body.classList.remove('loading');
    }
}

// Reset and reload checkpoints
export async function resetAndReload() {
    const pageState = getCurrentPageState();
    pageState.currentPage = 1;
    pageState.hasMore = true;
    await loadMoreCheckpoints(true);
}

// Refresh checkpoints
export async function refreshCheckpoints() {
    try {
        showToast('Scanning for checkpoints...', 'info');
        const response = await fetch('/api/checkpoints/scan');
        
        if (!response.ok) {
            throw new Error(`Failed to scan checkpoints: ${response.status} ${response.statusText}`);
        }
        
        await resetAndReload();
        showToast('Checkpoints refreshed successfully', 'success');
    } catch (error) {
        console.error('Error refreshing checkpoints:', error);
        showToast('Failed to refresh checkpoints', 'error');
    }
}

// Delete a checkpoint
export function deleteCheckpoint(filePath) {
    confirmDelete('Are you sure you want to delete this checkpoint?', () => {
        _performDelete(filePath);
    });
}

// Private function to perform the delete operation
async function _performDelete(filePath) {
    try {
        showToast('Deleting checkpoint...', 'info');
        
        const response = await fetch('/api/model/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_path: filePath,
                model_type: 'checkpoint'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete checkpoint: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Remove the card from UI
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            if (card) {
                card.remove();
            }
            
            showToast('Checkpoint deleted successfully', 'success');
        } else {
            throw new Error(data.error || 'Failed to delete checkpoint');
        }
    } catch (error) {
        console.error('Error deleting checkpoint:', error);
        showToast(`Failed to delete checkpoint: ${error.message}`, 'error');
    }
}

// Replace checkpoint preview
export function replaceCheckpointPreview(filePath) {
    // Open file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        if (!e.target.files.length) return;
        
        const file = e.target.files[0];
        await _uploadPreview(filePath, file);
    };
    input.click();
}

// Upload a preview image
async function _uploadPreview(filePath, file) {
    try {
        showToast('Uploading preview...', 'info');
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_path', filePath);
        formData.append('model_type', 'checkpoint');
        
        const response = await fetch('/api/model/preview', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Failed to upload preview: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update the preview in UI
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            if (card) {
                const img = card.querySelector('.card-preview img');
                if (img) {
                    // Add timestamp to prevent caching
                    const timestamp = new Date().getTime();
                    if (data.preview_url) {
                        img.src = `${data.preview_url}?t=${timestamp}`;
                    } else {
                        img.src = `/api/model/preview_image?path=${encodeURIComponent(filePath)}&t=${timestamp}`;
                    }
                }
            }
            
            showToast('Preview updated successfully', 'success');
        } else {
            throw new Error(data.error || 'Failed to update preview');
        }
    } catch (error) {
        console.error('Error updating preview:', error);
        showToast(`Failed to update preview: ${error.message}`, 'error');
    }
}

// Fetch metadata from Civitai for checkpoints
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
                                `Completed: Updated ${data.success} of ${data.processed} checkpoints`
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
            
            const response = await fetch('/api/checkpoints/fetch-all-civitai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_type: 'checkpoint' }) // Specify we're fetching checkpoint metadata
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