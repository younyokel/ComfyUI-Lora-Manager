// 排序功能
function sortCards(sortBy) {
    const grid = document.getElementById('loraGrid');
    const cards = Array.from(grid.children);
    
    cards.sort((a, b) => {
        switch(sortBy) {
            case 'name':
                return a.dataset.name.localeCompare(b.dataset.name);
            case 'date':
                return new Date(b.dataset.date) - new Date(a.dataset.date);
            case 'size':
                return parseFloat(b.dataset.size) - parseFloat(a.dataset.size);
        }
    });
    
    cards.forEach(card => grid.appendChild(card));
}

// 刷新功能
async function refreshLoras() {
    try {
        const response = await fetch('/loras?refresh=true');
        if (response.ok) {
            location.reload();
        }
    } catch (error) {
        console.error('Refresh failed:', error);
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

async function deleteModel(modelName) {
    // Prevent event bubbling
    event.stopPropagation();
    
    // Get the folder from the card's data attributes
    const card = document.querySelector(`.lora-card[data-file_name="${modelName}"]`);
    const folder = card ? card.dataset.folder : null;
    
    // Show confirmation dialog
    const confirmed = confirm(`Are you sure you want to delete "${modelName}" and all associated files?`);
    
    if (confirmed) {
        try {
            const response = await fetch('/api/delete_model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    model_name: modelName,
                    folder: folder
                })
            });

            if (response.ok) {
                // Remove the card from UI
                if (card) {
                    card.remove();
                }
                // Show success message
                alert('Model deleted successfully');
            } else {
                const error = await response.text();
                alert(`Failed to delete model: ${error}`);
            }
        } catch (error) {
            alert(`Error deleting model: ${error}`);
        }
    }
}

// 初始化排序
document.getElementById('sortSelect').addEventListener('change', (e) => {
    sortCards(e.target.value);
});

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
    currentLora = JSON.parse(card.dataset.meta);
    showModal(currentLora);
  });
});

function showModal(lora) {
  const modal = document.getElementById('loraModal');
  modal.innerHTML = `
    <div class="modal-content">
      <h2>${lora.name}</h2>
      <div class="carousel">
        ${lora.images.map(img => `<img src="${img}" alt="Preview">`).join('')}
      </div>
      <div class="description">${lora.description}</div>
      <button class="close" onclick="closeModal()">&times;</button>
    </div>
  `;
  modal.style.display = 'block';
  document.body.classList.add('modal-open');

  // 添加点击事件监听器
  modal.onclick = function(event) {
    // 如果点击的是模态窗口的背景（不是内容区域），则关闭模态窗口
    if (event.target === modal) {
      closeModal();
    }
  };
}

function closeModal() {
  const modal = document.getElementById('loraModal');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  // 移除点击事件监听器
  modal.onclick = null;
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
});

function toggleFolder(element) {
    // Remove active class from all tags if clicking already active tag
    if (element.classList.contains('active')) {
        document.querySelectorAll('.tag').forEach(tag => tag.classList.remove('active'));
        // Show all cards
        document.querySelectorAll('.lora-card').forEach(card => card.style.display = '');
    } else {
        // Remove active class from all tags
        document.querySelectorAll('.tag').forEach(tag => tag.classList.remove('active'));
        // Add active class to clicked tag
        element.classList.add('active');
        // Hide all cards first
        document.querySelectorAll('.lora-card').forEach(card => {
            if (card.getAttribute('data-folder') === element.getAttribute('data-folder')) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }
}

// 主题切换
function toggleTheme() {
  const theme = document.body.dataset.theme || 'light';
  document.body.dataset.theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', document.body.dataset.theme);
}

// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.dataset.theme = savedTheme;
}

// 检测系统主题
window.matchMedia('(prefers-color-scheme: dark)').addListener(e => {
  document.body.dataset.theme = e.matches ? 'dark' : 'light';
});

// 键盘导航
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'ArrowRight') nextImage();
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
            
            // if(!response.ok) {
            //     const errorText = await response.text();
            //     throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            // }
            
            // // Optional: Update the card with new metadata
            // const result = await response.json();
            // if (result.success && result.metadata) {
            //     card.dataset.meta = JSON.stringify(result.metadata);
            //     // Update card display if needed
            // }
        }
        
        // Completion handling
        progressBar.style.width = '100%';
        loadingStatus.textContent = 'Metadata update complete';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            // Optionally reload the page to show updated data
            window.location.reload();
        }, 2000);
        
    } catch (error) {
        console.warn('Error fetching metadata:', error);
    }
}

initTheme();