// Debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Sorting functionality
function sortCards(sortBy) {
    const grid = document.getElementById('loraGrid');
    if (!grid) return;

    const fragment = document.createDocumentFragment();
    const cards = Array.from(grid.children);
    
    requestAnimationFrame(() => {
        cards.sort((a, b) => sortBy === 'date' 
            ? parseFloat(b.dataset.modified) - parseFloat(a.dataset.modified)
            : a.dataset.name.localeCompare(b.dataset.name)
        ).forEach(card => fragment.appendChild(card));
        
        grid.appendChild(fragment);
    });
}

// Loading management
class LoadingManager {
    constructor() {
        this.overlay = document.getElementById('loading-overlay');
        this.progressBar = this.overlay.querySelector('.progress-bar');
        this.statusText = this.overlay.querySelector('.loading-status');
    }

    show(message = 'Loading...', progress = 0) {
        this.overlay.style.display = 'flex';
        this.setProgress(progress);
        this.setStatus(message);
    }

    hide() {
        this.overlay.style.display = 'none';
        this.reset();
    }

    setProgress(percent) {
        this.progressBar.style.width = `${percent}%`;
        this.progressBar.setAttribute('aria-valuenow', percent);
    }

    setStatus(message) {
        this.statusText.textContent = message;
    }

    reset() {
        this.setProgress(0);
        this.setStatus('');
    }

    async showWithProgress(callback, options = {}) {
        const { initialMessage = 'Processing...', completionMessage = 'Complete' } = options;
        
        try {
            this.show(initialMessage);
            await callback(this);
            this.setProgress(100);
            this.setStatus(completionMessage);
            await new Promise(resolve => setTimeout(resolve, 500));
        } finally {
            this.hide();
        }
    }

    showSimpleLoading(message = 'Loading...') {
        this.overlay.style.display = 'flex';
        this.progressBar.style.display = 'none';
        this.setStatus(message);
    }

    restoreProgressBar() {
        this.progressBar.style.display = 'block';
    }
}

const loadingManager = new LoadingManager();

// Media preview handling
function createVideoPreview(url) {
    const video = document.createElement('video');
    video.controls = video.autoplay = video.muted = video.loop = true;
    video.src = url;
    return video;
}

function createImagePreview(url) {
    const img = document.createElement('img');
    img.src = url;
    return img;
}

function updatePreviewInCard(filePath, file, previewUrl) {
    const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
    const previewContainer = card?.querySelector('.card-preview');
    const oldPreview = previewContainer?.querySelector('img, video');
    
    if (oldPreview) {
        const newPreviewUrl = `${previewUrl}?t=${Date.now()}`;
        const newPreview = file.type.startsWith('video/') 
            ? createVideoPreview(newPreviewUrl)
            : createImagePreview(newPreviewUrl);
        oldPreview.replaceWith(newPreview);
    }
}

// Modal management
class ModalManager {
    constructor() {
        this.modals = new Map();
        this.boundHandleEscape = this.handleEscape.bind(this);
        
        // 注册所有模态窗口
        this.registerModal('loraModal', {
            element: document.getElementById('loraModal'),
            onClose: () => {
                this.getModal('loraModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });
        
        this.registerModal('deleteModal', {
            element: document.getElementById('deleteModal'),
            onClose: () => {
                this.getModal('deleteModal').element.classList.remove('show');
                document.body.classList.remove('modal-open');
                pendingDeletePath = null;
            }
        });

        // 添加全局事件监听
        document.addEventListener('keydown', this.boundHandleEscape);
    }

    registerModal(id, config) {
        this.modals.set(id, {
            element: config.element,
            onClose: config.onClose,
            isOpen: false
        });

        // 为每个模态窗口添加点击外部关闭事件
        config.element.addEventListener('click', (e) => {
            if (e.target === config.element) {
                this.closeModal(id);
            }
        });
    }

    getModal(id) {
        return this.modals.get(id);
    }

    showModal(id, content = null) {
        const modal = this.getModal(id);
        if (!modal) return;

        if (content) {
            modal.element.innerHTML = content;
        }

        if (id === 'loraModal') {
            modal.element.style.display = 'block';
        } else if (id === 'deleteModal') {
            modal.element.classList.add('show');
        }

        modal.isOpen = true;
        document.body.classList.add('modal-open');
    }

    closeModal(id) {
        const modal = this.getModal(id);
        if (!modal) return;

        modal.onClose();
        modal.isOpen = false;
    }

    handleEscape(e) {
        if (e.key === 'Escape') {
            // 关闭最后打开的模态窗口
            for (const [id, modal] of this.modals) {
                if (modal.isOpen) {
                    this.closeModal(id);
                    break;
                }
            }
        }
    }
}

const modalManager = new ModalManager();

// Data management functions
async function refreshLoras() {
    const loraGrid = document.getElementById('loraGrid');
    const currentSort = document.getElementById('sortSelect').value;
    const activeFolder = document.querySelector('.tag.active')?.dataset.folder;

    try {
        loadingManager.showSimpleLoading('Refreshing loras...');
        const response = await fetch('/loras?refresh=true');
        if (!response.ok) throw new Error('Refresh failed');
        
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        loraGrid.innerHTML = doc.getElementById('loraGrid').innerHTML;
        
        initializeLoraCards();
        sortCards(currentSort);
        if (activeFolder) filterByFolder(activeFolder);
        
        showToast('Refresh complete', 'success');
    } catch (error) {
        console.error('Refresh failed:', error);
        showToast('Failed to refresh loras', 'error');
    } finally {
        loadingManager.hide();
        loadingManager.restoreProgressBar();
    }
}

async function fetchCivitai() {
    const loraCards = document.querySelectorAll('.lora-card');
    const totalCards = loraCards.length;

    await loadingManager.showWithProgress(async (loading) => {
        for (let i = 0; i < totalCards; i++) {
            const card = loraCards[i];
            if (card.dataset.meta?.length > 2) continue;
            
            const { sha256, filepath: filePath } = card.dataset;
            if (!sha256 || !filePath) continue;

            loading.setProgress((i / totalCards * 100).toFixed(1));
            loading.setStatus(`Processing (${i+1}/${totalCards}) ${card.dataset.name}`);

            try {
                await fetch('/api/fetch-civitai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sha256, file_path: filePath })
                });
            } catch (error) {
                console.error(`Failed to fetch ${card.dataset.name}:`, error);
            }
        }

        localStorage.setItem('scrollPosition', window.scrollY.toString());
        window.location.reload();
    }, {
        initialMessage: 'Fetching metadata...',
        completionMessage: 'Metadata update complete'
    });
}

// UI interaction functions
function showLoraModal(lora) {
    const escapedWords = lora.trainedWords?.length ? 
        lora.trainedWords.map(word => word.replace(/'/g, '\\\'')) : [];

    // Organize trigger words by categories
    const categories = {};
    escapedWords.forEach(word => {
        const category = word.includes(':') ? word.split(':')[0] : 'General';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(word);
    });
        
    const imageMarkup = lora.images.map(img => {
        if (img.type === 'video') {
            return `<video controls autoplay muted loop crossorigin="anonymous" referrerpolicy="no-referrer">
                     <source src="${img.url}" type="video/mp4">
                     Your browser does not support the video tag.
                   </video>`;
        } else {
            return `<img src="${img.url}" alt="Preview" 
                        crossorigin="anonymous" 
                        referrerpolicy="no-referrer" 
                        loading="lazy">`;
        }
    }).join('');
 
    const triggerWordsMarkup = escapedWords.length ? `
        <div class="trigger-words-container">
            <div class="trigger-words-title">Trigger Words</div>
            <div class="trigger-words-tags">
                ${escapedWords.map(word => `
                    <div class="trigger-word-tag" onclick="copyTriggerWord('${word}')">
                        <span class="trigger-word-content">${word}</span>
                        <span class="trigger-word-copy">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '<div class="trigger-words-container">No trigger words</div>';
    
    const content = `
        <div class="modal-content">
            <h2>${lora.model.name}</h2>
            <div class="carousel">
                ${imageMarkup}
            </div>
            <div class="description">About this version: ${lora.description || 'N/A'}</div>
            ${triggerWordsMarkup}
            <div class="model-link">
                <a href="https://civitai.com/models/${lora.modelId}?modelVersionId=${lora.id}" 
                   target="_blank">more details on CivitAI</a>
            </div>
            <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
        </div>
    `;
    
    modalManager.showModal('loraModal', content);

    // Add category switching event listeners
    document.querySelectorAll('.trigger-category').forEach(category => {
        category.addEventListener('click', function() {
            const categoryName = this.dataset.category;
            document.querySelectorAll('.trigger-category').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            const wordsList = document.querySelector('.trigger-words-list');
            wordsList.innerHTML = categories[categoryName].map(word => `
                <div class="trigger-word-tag" onclick="copyTriggerWord('${word}')">
                    <span class="trigger-word-content">${word}</span>
                    <span class="trigger-word-copy">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                    </span>
                </div>
            `).join('');
        });
    });
}

function filterByFolder(folderPath) {
    document.querySelectorAll('.lora-card').forEach(card => {
        card.style.display = card.dataset.folder === folderPath ? '' : 'none';
    });
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const searchHandler = debounce(term => {
        document.querySelectorAll('.lora-card').forEach(card => {
            card.style.display = [card.dataset.name, card.dataset.folder]
                .some(text => text.toLowerCase().includes(term)) 
                ? 'block' 
                : 'none';
        });
    }, 250);

    document.getElementById('searchInput')?.addEventListener('input', e => {
        searchHandler(e.target.value.toLowerCase());
    });

    document.getElementById('sortSelect')?.addEventListener('change', e => {
        sortCards(e.target.value);
    });

    lazyLoadImages();
    restoreFolderFilter();
    initializeLoraCards();
    initTheme();
});

function initializeLoraCards() {
    document.querySelectorAll('.lora-card').forEach(card => {
        card.addEventListener('click', () => {
            const meta = JSON.parse(card.dataset.meta || '{}');
            if (Object.keys(meta).length) {
                showLoraModal(meta);
            } else {
                showToast(card.dataset.from_civitai === 'True'
                    ? 'Click "Fetch" to retrieve metadata'
                    : 'No CivitAI information available', 'info');
            }
        });

        card.querySelector('.fa-copy')?.addEventListener('click', e => {
            e.stopPropagation();
            navigator.clipboard.writeText(card.dataset.file_name)
                .then(() => showToast('Model name copied', 'success'))
                .catch(() => showToast('Copy failed', 'error'));
        });
    });
}

// Helper functions
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.append(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
        setTimeout(() => toast.remove(), 2300);
    });
}

function lazyLoadImages() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target.dataset.src) {
                entry.target.src = entry.target.dataset.src;
                observer.unobserve(entry.target);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
}

function restoreFolderFilter() {
    const activeFolder = localStorage.getItem('activeFolder');
    const folderTag = activeFolder && document.querySelector(`.tag[data-folder="${activeFolder}"]`);
    if (folderTag) {
        folderTag.classList.add('active');
        filterByFolder(activeFolder);
    }
}

function initTheme() {
    document.body.dataset.theme = localStorage.getItem('theme') || 'dark';
}

// Theme toggle
function toggleTheme() {
    const theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
}

let pendingDeletePath = null;

function toggleFolder(element) {
    // Store the previous state
    const wasActive = element.classList.contains('active');
    
    // Remove active class from all tags
    document.querySelectorAll('.tag').forEach(tag => tag.classList.remove('active'));
    
    if (!wasActive) {
        // Add active class to clicked tag
        element.classList.add('active');
        // Store active folder in localStorage
        localStorage.setItem('activeFolder', element.getAttribute('data-folder'));
        // Hide all cards first
        document.querySelectorAll('.lora-card').forEach(card => {
            if (card.getAttribute('data-folder') === element.getAttribute('data-folder')) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    } else {
        // Clear stored folder when deactivating
        localStorage.removeItem('activeFolder');
        // Show all cards
        document.querySelectorAll('.lora-card').forEach(card => card.style.display = '');
    }
}

async function confirmDelete() {
    if (!pendingDeletePath) return;
    
    const modal = document.getElementById('deleteModal');
    const card = document.querySelector(`.lora-card[data-filepath="${pendingDeletePath}"]`);
    
    try {
        const response = await fetch('/api/delete_model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                file_path: pendingDeletePath
            })
        });

        if (response.ok) {
            if (card) {
                card.remove();
            }
            closeDeleteModal();
        } else {
            const error = await response.text();
            alert(`Failed to delete model: ${error}`);
        }
    } catch (error) {
        alert(`Error deleting model: ${error}`);
    }
}

// Replace the existing deleteModel function with this one
async function deleteModel(filePath) {
    showDeleteModal(filePath);
}

function showDeleteModal(filePath) {
    event.stopPropagation();
    pendingDeletePath = filePath;
    
    const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
    const modelName = card.dataset.name;
    const modal = modalManager.getModal('deleteModal').element;
    const modelInfo = modal.querySelector('.delete-model-info');
    
    modelInfo.innerHTML = `
        <strong>Model:</strong> ${modelName}
        <br>
        <strong>File:</strong> ${filePath}
    `;
    
    modalManager.showModal('deleteModal');
}

function copyTriggerWord(word) {
    navigator.clipboard.writeText(word).then(() => {
        const toast = document.createElement('div');
        toast.className = 'toast toast-copy';
        toast.textContent = 'Copied!';
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 1000);
        });
    });
}

function closeDeleteModal() {
    modalManager.closeModal('deleteModal');
}

function openCivitai(modelName) {
    // 从卡片的data-meta属性中获取civitai ID
    const loraCard = document.querySelector(`.lora-card[data-name="${modelName}"]`);
    if (!loraCard) return;
    
    const metaData = JSON.parse(loraCard.dataset.meta);
    const civitaiId = metaData.modelId;  // 使用modelId作为civitai模型ID
    const versionId = metaData.id;       // 使用id作为版本ID
    
    // 构建URL
    if (civitaiId) {
        let url = `https://civitai.com/models/${civitaiId}`;
        if (versionId) {
            url += `?modelVersionId=${versionId}`;
        }
        window.open(url, '_blank');
    } else {
        // 如果没有ID，尝试使用名称搜索
        window.open(`https://civitai.com/models?query=${encodeURIComponent(modelName)}`, '_blank');
    }
}

async function replacePreview(filePath) {
    // Get loading elements first
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatus = document.querySelector('.loading-status');
    
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/mp4';  // Accept images and MP4 videos
    
    // Handle file selection
    input.onchange = async function() {
        if (!input.files || !input.files[0]) return;
        
        const file = input.files[0];
        const formData = new FormData();
        formData.append('preview_file', file);
        formData.append('model_path', filePath);
        
        try {
            // Show loading overlay
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
            const newPreviewPath = `${data.preview_url}?t=${new Date().getTime()}`;
            
            // Update the preview image in the card
            const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            const previewContainer = card.querySelector('.card-preview');
            const oldPreview = previewContainer.querySelector('img, video');
            
            // Create new preview element based on file type
            if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.controls = true;
                video.autoplay = true;
                video.muted = true;
                video.loop = true;
                video.src = newPreviewPath;
                oldPreview.replaceWith(video);
            } else {
                const img = document.createElement('img');
                img.src = newPreviewPath;
                oldPreview.replaceWith(img);
            }
            
        } catch (error) {
            console.error('Error uploading preview:', error);
            alert('Failed to upload preview image');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    };
    
    // Trigger file selection
    input.click();
}