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

// 立即执行初始排序
const sortSelect = document.getElementById('sortSelect');
if (sortSelect) {
    sortCards(sortSelect.value);
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

// State management
let state = {
    currentPage: 1,
    isLoading: false,
    hasMore: true,
    sortBy: 'name',
    activeFolder: null,
    loadingManager: null,
    observer: null  // 添加 observer 到状态管理中
};

// Initialize loading manager
document.addEventListener('DOMContentLoaded', () => {
    state.loadingManager = new LoadingManager();
    initializeInfiniteScroll();
    initializeEventListeners();
});

// Initialize infinite scroll
function initializeInfiniteScroll() {
    // 如果已存在 observer，先断开连接
    if (state.observer) {
        state.observer.disconnect();
    }

    // Create intersection observer for infinite scroll
    state.observer = new IntersectionObserver(
        (entries) => {
            const target = entries[0];
            if (target.isIntersecting && !state.isLoading && state.hasMore) {
                loadMoreLoras();
            }
        },
        { threshold: 0.1 }
    );

    // Add sentinel element for infinite scroll
    const existingSentinel = document.getElementById('scroll-sentinel');
    if (existingSentinel) {
        state.observer.observe(existingSentinel);
    } else {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '10px';
        document.getElementById('loraGrid').appendChild(sentinel);
        state.observer.observe(sentinel);
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Sort select handler
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = state.sortBy;
        sortSelect.addEventListener('change', async (e) => {
            state.sortBy = e.target.value;
            await resetAndReload();
        });
    }

    // Folder filter handler
    document.querySelectorAll('.folder-tags .tag').forEach(tag => {
        // 移除原有的 onclick 属性处理方式，改用事件监听器
        tag.removeAttribute('onclick');
        tag.addEventListener('click', toggleFolder);
    });
}

// Load more loras
async function loadMoreLoras() {
    if (state.isLoading || !state.hasMore) return;
    
    state.isLoading = true;
    try {
        // 构建请求参数
        const params = new URLSearchParams({
            page: state.currentPage,
            page_size: 20,
            sort_by: state.sortBy
        });
        
        // 只在有选中文件夹时添加 folder 参数
        if (state.activeFolder !== null) {
            params.append('folder', state.activeFolder);
        }

        console.log('Loading loras with params:', params.toString()); // 调试日志

        const response = await fetch(`/api/loras?${params}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch loras: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Received data:', data); // 调试日志
        
        if (data.items.length === 0 && state.currentPage === 1) {
            // 如果是第一页且没有数据，显示提示
            const grid = document.getElementById('loraGrid');
            grid.innerHTML = '<div class="no-results">No loras found in this folder</div>';
            state.hasMore = false;
        } else if (data.items.length > 0) {
            state.hasMore = state.currentPage < data.total_pages;
            state.currentPage++;
            appendLoraCards(data.items);
            
            // 确保 sentinel 元素被观察
            const sentinel = document.getElementById('scroll-sentinel');
            if (sentinel && state.observer) {
                state.observer.observe(sentinel);
            }
        } else {
            state.hasMore = false;
        }
        
    } catch (error) {
        console.error('Error loading loras:', error);
        showToast('Failed to load loras: ' + error.message, 'error');
    } finally {
        state.isLoading = false;
    }
}

// Reset and reload
async function resetAndReload() {
    console.log('Resetting with state:', { ...state }); // 调试日志
    
    state.currentPage = 1;
    state.hasMore = true;
    state.isLoading = false;
    
    const grid = document.getElementById('loraGrid');
    grid.innerHTML = ''; // 清空网格
    
    // 添加 sentinel
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    grid.appendChild(sentinel);
    
    // 重新初始化无限滚动
    initializeInfiniteScroll();
    
    await loadMoreLoras();
}

// Append lora cards
function appendLoraCards(loras) {
    const grid = document.getElementById('loraGrid');
    const sentinel = document.getElementById('scroll-sentinel');
    
    loras.forEach(lora => {
        const card = createLoraCard(lora);
        grid.insertBefore(card, sentinel);
    });
}

// Create lora card
function createLoraCard(lora) {
    const card = document.createElement('div');
    card.className = 'lora-card';
    card.dataset.sha256 = lora.sha256;
    card.dataset.filepath = lora.file_path;
    card.dataset.name = lora.model_name;
    card.dataset.file_name = lora.file_name;
    card.dataset.folder = lora.folder;
    card.dataset.modified = lora.modified;
    card.dataset.from_civitai = lora.from_civitai;
    card.dataset.meta = JSON.stringify(lora.civitai || {});

    card.innerHTML = `
        <div class="card-preview">
            ${lora.preview_url.endsWith('.mp4') ? 
                `<video controls autoplay muted loop>
                    <source src="${lora.preview_url}" type="video/mp4">
                </video>` :
                `<img src="${lora.preview_url || '/loras_static/images/no-preview.png'}" alt="${lora.model_name}">`
            }
            <div class="card-header">
                <span class="base-model-label" title="${lora.base_model}">
                    ${lora.base_model}
                </span>
                <div class="card-actions">
                    <i class="fas fa-globe" 
                       title="${lora.from_civitai ? 'View on Civitai' : 'Not available from Civitai'}"
                       ${lora.from_civitai ? 
                           `onclick="event.stopPropagation(); openCivitai('${lora.model_name}')"` : 
                           'style="opacity: 0.5; cursor: not-allowed"'}>
                    </i>
                    <i class="fas fa-copy" 
                       title="Copy Model Name"
                       onclick="event.stopPropagation(); navigator.clipboard.writeText('${lora.file_name}')">
                    </i>
                    <i class="fas fa-trash" 
                       title="Delete Model"
                       onclick="event.stopPropagation(); deleteModel('${lora.file_path}')">
                    </i>
                </div>
            </div>
            <div class="card-footer">
                <div class="model-info">
                    <span class="model-name">${lora.model_name}</span>
                </div>
                <div class="card-actions">
                    <i class="fas fa-image" 
                       title="Replace Preview Image"
                       onclick="event.stopPropagation(); replacePreview('${lora.file_path}')">
                    </i>
                </div>
            </div>
        </div>
    `;

    // Add click handler for showing modal
    card.addEventListener('click', () => {
        const meta = JSON.parse(card.dataset.meta || '{}');
        if (Object.keys(meta).length) {
            showLoraModal(meta);
        } else {
            showToast(
                card.dataset.from_civitai === 'true' ?
                'Click "Fetch" to retrieve metadata' :
                'No CivitAI information available',
                'info'
            );
        }
    });

    return card;
}

// Refresh loras
async function refreshLoras() {
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

function toggleFolder(tag) {
    // 确保 tag 是 DOM 元素
    const tagElement = (tag instanceof HTMLElement) ? tag : this;
    const folder = tagElement.dataset.folder;
    const wasActive = tagElement.classList.contains('active');
    
    // 清除所有标签的激活状态
    document.querySelectorAll('.folder-tags .tag').forEach(t => {
        t.classList.remove('active');
    });
    
    if (!wasActive) {
        // 激活当前标签
        tagElement.classList.add('active');
        state.activeFolder = folder;
    } else {
        // 取消激活
        state.activeFolder = null;
    }
    
    // 重置并重新加载数据
    resetAndReload();
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

// Fetch CivitAI metadata for all loras
async function fetchCivitai() {
    await state.loadingManager.showWithProgress(async (loading) => {
        try {
            loading.setStatus('Fetching metadata for all loras...');
            
            const response = await fetch('/api/fetch-all-civitai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch metadata');
            }
            
            const result = await response.json();
            showToast(result.message, 'success');
            
            // 重置并重新加载当前视图
            await resetAndReload();
            
        } catch (error) {
            console.error('Error fetching metadata:', error);
            showToast('Failed to fetch metadata: ' + error.message, 'error');
        }
    }, {
        initialMessage: 'Starting metadata fetch...',
        completionMessage: 'Metadata update complete'
    });
}