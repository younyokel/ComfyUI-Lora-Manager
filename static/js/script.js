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

// 文件夹筛选
document.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', () => {
        document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        const folder = tag.dataset.folder;
        filterByFolder(folder);
    });
});

function filterByFolder(folder) {
    document.querySelectorAll('.lora-card').forEach(card => {
        card.style.display = card.dataset.folder === folder ? 'block' : 'none';
    });
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
function openCivitai(loraName) {
    // 从卡片的data-meta属性中获取civitai ID
    const loraCard = document.querySelector(`.lora-card[data-name="${loraName}"]`);
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
        window.open(`https://civitai.com/models?query=${encodeURIComponent(loraName)}`, '_blank');
    }
}

async function deleteModel(modelName) {
    // Prevent event bubbling
    event.stopPropagation();
    
    // Get the folder from the card's data attributes
    const card = document.querySelector(`.lora-card[data-name="${modelName}"]`);
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
    
    // Show loading overlay initially
    loadingOverlay.style.display = 'flex';
    
    // Listen for progress updates
    api.addEventListener("lora-scan-progress", (event) => {
        const data = event.detail;
        const progress = (data.value / data.max) * 100;
        
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        loadingStatus.textContent = data.status;
        
        if (data.value === data.max) {
            // Hide loading overlay when scan is complete
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 500);
        }
    });
});

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

initTheme();