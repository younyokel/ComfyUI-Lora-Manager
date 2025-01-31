// 添加防抖函数
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 优化排序功能
function sortCards(sortBy) {
    const grid = document.getElementById('loraGrid');
    if (!grid) return;

    const fragment = document.createDocumentFragment();
    const cards = Array.from(grid.children);
    
    requestAnimationFrame(() => {
        cards.sort((a, b) => {
            if (sortBy === 'date') {
                // 将字符串转换为浮点数进行比较
                return parseFloat(b.dataset.modified) - parseFloat(a.dataset.modified);
            } else {
                // 名称排序保持不变
                return a.dataset.name.localeCompare(b.dataset.name);
            }
        }).forEach(card => fragment.appendChild(card));
        
        grid.appendChild(fragment);
    });
}

// 改进WebSocket处理
class WebSocketClient {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            reconnectDelay: 1000,
            maxReconnectAttempts: 5,
            ...options
        };
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = this.onOpen.bind(this);
        this.ws.onclose = this.onClose.bind(this);
        this.ws.onerror = this.onError.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
    }

    onOpen() {
        this.reconnectAttempts = 0;
        console.log('WebSocket connected');
    }

    onClose() {
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
            setTimeout(() => {
                this.reconnectAttempts++;
                this.connect();
            }, this.options.reconnectDelay);
        }
    }

    onError(error) {
        console.error('WebSocket error:', error);
    }

    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            window.api.dispatchEvent(new CustomEvent('lora-scan-progress', { detail: data }));
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }
}

// 优化图片加载
function lazyLoadImages() {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                observer.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// 优化模态窗口管理
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

// 创建全局 modalManager 实例
const modalManager = new ModalManager();

// 修改现有的 showModal 函数为 showLoraModal
function showLoraModal(lora) {
    const escapedWords = lora.trainedWords?.length ? 
        lora.trainedWords.join(', ').toUpperCase().replace(/'/g, '\\\'') : '';
        
    const content = `
      <div class="modal-content">
        <h2>${lora.model.name}</h2>
        <div class="carousel">
          ${lora.images.map(img => img.type === 'video' ? `<video controls autoplay muted loop><source src="${img.url}" type="video/mp4">Your browser does not support the video tag.</video>` : `<img src="${img.url}" alt="Preview">`).join('')}
        </div>
        <div class="description">About this version: ${lora.description ? lora.description : 'N/A'}</div>
        <div class="trigger-words">
          <strong>Trigger Words:</strong>
          <span class="word-list">${escapedWords || 'N/A'}</span>
          ${escapedWords ? `
          <button class="copy-btn" onclick="copyTriggerWords(\`${escapedWords}\`)">
            <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
          </button>
          ` : ''}
        </div>
        <div class="model-link">
          <a href="https://civitai.com/models/${lora.modelId}?modelVersionId=${lora.id}" target="_blank">more details on CivitAI</a>
        </div>
        <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
      </div>
    `;
    
    modalManager.showModal('loraModal', content);
}

// 修改现有的 showDeleteModal 函数
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

// 修改现有的 closeDeleteModal 函数
function closeDeleteModal() {
    modalManager.closeModal('deleteModal');
}

// 添加 toast 通知功能
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // 移除任何现有的 toast
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    document.body.appendChild(toast);

    // 如果模态窗口打开，调整 toast 位置
    if (document.body.classList.contains('modal-open')) {
        toast.style.transform = 'translate(-50%, 50%)';  // 在屏幕中间显示
    }

    // 触发动画
    requestAnimationFrame(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const wsClient = new WebSocketClient(`ws://${window.location.host}/ws`);
    
    // 优化搜索功能，添加防抖
    const debouncedSearch = debounce((term) => {
        const cards = document.querySelectorAll('.lora-card');
        requestAnimationFrame(() => {
            cards.forEach(card => {
                const match = card.dataset.name.toLowerCase().includes(term) ||
                             card.dataset.folder.toLowerCase().includes(term);
                card.style.display = match ? 'block' : 'none';
            });
        });
    }, 250);

    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        debouncedSearch(e.target.value.toLowerCase());
    });

    // 初始化懒加载
    lazyLoadImages();
    
    // 优化滚动性能
    document.addEventListener('scroll', debounce(() => {
        lazyLoadImages();
    }, 100), { passive: true });
});

// 刷新功能
async function refreshLoras() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loraGrid = document.getElementById('loraGrid');
    const currentSort = document.getElementById('sortSelect').value;
    const activeFolder = document.querySelector('.tag.active')?.dataset.folder;

    try {
        // Show loading overlay
        loadingOverlay.style.display = 'flex';
        
        // Fetch new data
        const response = await fetch('/loras?refresh=true');
        if (!response.ok) throw new Error('Refresh failed');
        
        // Parse the HTML response
        const parser = new DOMParser();
        const doc = parser.parseFromString(await response.text(), 'text/html');
        
        // Get the new lora cards
        const newLoraGrid = doc.getElementById('loraGrid');
        
        // Update the grid content
        loraGrid.innerHTML = newLoraGrid.innerHTML;
        
        // Re-attach click listeners to new cards
        document.querySelectorAll('.lora-card').forEach(card => {
            card.addEventListener('click', () => {
                const meta = JSON.parse(card.dataset.meta || '{}');
                if (Object.keys(meta).length > 0) {
                    showModal(meta);
                }
            });
        });
        
        // Re-apply current sorting
        sortCards(currentSort);
        
        // Modified folder filtering logic
        if (activeFolder !== undefined) {  // Check if there's an active folder
            document.querySelectorAll('.lora-card').forEach(card => {
                const cardFolder = card.getAttribute('data-folder');
                // For empty folder (root directory), only show cards with empty folder path
                if (activeFolder === '') {
                    card.style.display = cardFolder === '' ? '' : 'none';
                } else {
                    // For other folders, show cards matching the folder path
                    card.style.display = cardFolder === activeFolder ? '' : 'none';
                }
            });
        }
        
    } catch (error) {
        console.error('Refresh failed:', error);
        alert('Failed to refresh loras');
    } finally {
        // Hide loading overlay
        loadingOverlay.style.display = 'none';
    }
}

// 占位功能函数
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

let pendingDeletePath = null;

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

// 初始化排序
document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    sortCards(e.target.value);
});

// 立即执行初始排序
const sortSelect = document.getElementById('sortSelect');
if (sortSelect) {
    sortCards(sortSelect.value);
}

// 添加搜索功能
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.lora-card').forEach(card => {
        const match = card.dataset.name.toLowerCase().includes(term) ||
                      card.dataset.folder.toLowerCase().includes(term);
        card.style.display = match ? 'block' : 'none';
    });
});

// 模态窗口管理
let currentLora = null;
let currentImageIndex = 0;

document.querySelectorAll('.lora-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.dataset.meta && Object.keys(JSON.parse(card.dataset.meta)).length > 0) {
      currentLora = JSON.parse(card.dataset.meta);
      showLoraModal(currentLora);
    }
  });
});

// 更新卡片复制操作
document.querySelectorAll('.lora-card').forEach(card => {
    const copyBtn = card.querySelector('.fa-copy');
    if (copyBtn) {
        copyBtn.onclick = (event) => {
            event.stopPropagation();
            navigator.clipboard.writeText(card.dataset.file_name)
                .then(() => showToast('Model name copied to clipboard', 'success'))
                .catch(() => showToast('Failed to copy model name', 'error'));
        };
    }

    // 为没有元数据的卡片添加点击反馈
    card.addEventListener('click', () => {
        const meta = JSON.parse(card.dataset.meta || '{}');
        if (Object.keys(meta).length === 0) {
            showToast('This model is not available on Civitai. No additional information to display.', 'info');
        }
    });
});

function copyTriggerWords(words) {
    if (!words) return;
    
    navigator.clipboard.writeText(words)
         .then(() => {
            const toast = document.createElement('div');
            toast.className = 'toast toast-success';
            toast.textContent = 'Trigger words copied to clipboard';
            document.body.appendChild(toast);
            
            // Force recalculation of toast position for modal context
            toast.style.position = 'fixed';
            toast.style.zIndex = '9999';  // 确保显示在最上层
            toast.style.bottom = '50%';
            toast.style.transform = 'translate(-50%, 50%)';
            
            requestAnimationFrame(() => {
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, 2000);
            });
        })
        .catch(() => {
            const toast = document.createElement('div');
            toast.className = 'toast toast-error';
            toast.textContent = 'Failed to copy trigger words';
            // ... 相同的 toast 显示逻辑
        });
}

// WebSocket handling for progress updates
document.addEventListener('DOMContentLoaded', function() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressBar = document.querySelector('.progress-bar');
    const loadingStatus = document.querySelector('.loading-status');
    
    // 默认隐藏 loading overlay
    loadingOverlay.style.display = 'none';
    
    const api = new EventTarget();
    window.api = api;

    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'lora-scan-progress') {
            // 当收到扫描进度消息时显示 overlay
            loadingOverlay.style.display = 'flex';
            api.dispatchEvent(new CustomEvent('lora-scan-progress', { detail: data }));
        }
    };
    
    api.addEventListener("lora-scan-progress", (event) => {
        const data = event.detail;
        const progress = (data.value / data.max) * 100;
        
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        loadingStatus.textContent = data.status;
        
        if (data.value === data.max) {
            // 确保在扫描完成时隐藏 overlay
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                // 重置进度条
                progressBar.style.width = '0%';
                progressBar.setAttribute('aria-valuenow', 0);
            }, 500);
        }
    });

    // Restore folder filter state
    restoreFolderFilter();
    
    // Restore scroll position if exists
    const savedScrollPos = localStorage.getItem('scrollPosition');
    if (savedScrollPos !== null) {
        window.scrollTo(0, parseInt(savedScrollPos));
        localStorage.removeItem('scrollPosition');
    }
});

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

// Add this function to restore folder filter state
function restoreFolderFilter() {
    const activeFolder = localStorage.getItem('activeFolder');
    if (activeFolder !== null) {
        const folderTag = document.querySelector(`.tag[data-folder="${activeFolder}"]`);
        if (folderTag) {
            folderTag.classList.add('active');
            document.querySelectorAll('.lora-card').forEach(card => {
                if (card.getAttribute('data-folder') === activeFolder) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }
    }
}

// 主题切换
function toggleTheme() {
  const theme = document.body.dataset.theme || 'dark';
  document.body.dataset.theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', document.body.dataset.theme);
}

// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.dataset.theme = savedTheme;
}

// 键盘导航
document.addEventListener('keydown', (e) => {
     if (e.key === 'Escape') modalManager.closeModal('loraModal');
});

// 图片预加载
function preloadImages(urls) {
    urls.forEach(url => {
        new Image().src = url;
    });
}

// 新增 fetchCivitai 函数
async function fetchCivitai() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressBar = document.querySelector('.progress-bar');
    const loadingStatus = document.querySelector('.loading-status');
    const loraCards = document.querySelectorAll('.lora-card');
    
    // 显示进度条
    loadingOverlay.style.display = 'flex';
    loadingStatus.textContent = 'Fetching metadata...';
    
    try {
        // Iterate through all lora cards
        for(let i = 0; i < loraCards.length; i++) {
            const card = loraCards[i];
            // Skip if already has metadata
            if (card.dataset.meta && Object.keys(JSON.parse(card.dataset.meta)).length > 0) {
                continue;
            }
            
            // Make sure these data attributes exist on your lora-card elements
            const sha256 = card.dataset.sha256;
            const filePath = card.dataset.filepath;
            
            // Add validation
            if (!sha256 || !filePath) {
                console.warn(`Missing data for card ${card.dataset.name}:`, { sha256, filePath });
                continue;
            }
            
            // Update progress
            const progress = (i / loraCards.length * 100).toFixed(1);
            progressBar.style.width = `${progress}%`;
            loadingStatus.textContent = `Processing (${i+1}/${loraCards.length}) ${card.dataset.name}`;
            
            // Call backend API
            const response = await fetch('/api/fetch-civitai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sha256: sha256,
                    file_path: filePath
                })
            });
        }
        
        // Completion handling
        progressBar.style.width = '100%';
        loadingStatus.textContent = 'Metadata update complete';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            // Store current scroll position
            const scrollPos = window.scrollY;
            localStorage.setItem('scrollPosition', scrollPos.toString());
            // Reload the page
            window.location.reload();
        }, 2000);
        
    } catch (error) {
        console.warn('Error fetching metadata:', error);
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

initTheme();