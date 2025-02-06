import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';

export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.append(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
        setTimeout(() => toast.remove(), 2300);
    });
}

export function lazyLoadImages() {
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

export function restoreFolderFilter() {
    const activeFolder = localStorage.getItem('activeFolder');
    const folderTag = activeFolder && document.querySelector(`.tag[data-folder="${activeFolder}"]`);
    if (folderTag) {
        folderTag.classList.add('active');
        filterByFolder(activeFolder);
    }
}

export function initTheme() {
    document.body.dataset.theme = localStorage.getItem('theme') || 'dark';
}

export function toggleTheme() {
    const theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
}

export function toggleFolder(tag) {
    const tagElement = (tag instanceof HTMLElement) ? tag : this;
    const folder = tagElement.dataset.folder;
    const wasActive = tagElement.classList.contains('active');
    
    document.querySelectorAll('.folder-tags .tag').forEach(t => {
        t.classList.remove('active');
    });
    
    if (!wasActive) {
        tagElement.classList.add('active');
        state.activeFolder = folder;
    } else {
        state.activeFolder = null;
    }
    
    resetAndReload();
}

export function copyTriggerWord(word) {
    navigator.clipboard.writeText(word).then(() => {
        showToast('Trigger word copied', 'success');
    });
}

function filterByFolder(folderPath) {
    document.querySelectorAll('.lora-card').forEach(card => {
        card.style.display = card.dataset.folder === folderPath ? '' : 'none';
    });
}

export function openCivitai(modelName) {
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

export function toggleFolderTags() {
    const folderTags = document.querySelector('.folder-tags');
    const btn = document.querySelector('.toggle-folders-btn');
    const isCollapsed = folderTags.classList.toggle('collapsed');
    
    // 更新按钮提示文本
    btn.title = isCollapsed ? 'Expand folder tags' : 'Collapse folder tags';
    
    // 保存状态到 localStorage
    localStorage.setItem('folderTagsCollapsed', isCollapsed);
}

// Add this to your existing initialization code
export function initFolderTagsVisibility() {
    const isCollapsed = localStorage.getItem('folderTagsCollapsed') === 'true';
    if (isCollapsed) {
        const folderTags = document.querySelector('.folder-tags');
        const btn = document.querySelector('.toggle-folders-btn');
        folderTags.classList.add('collapsed');
        btn.title = 'Expand folder tags';
    }
}

export function initBackToTop() {
    const button = document.createElement('button');
    button.className = 'back-to-top';
    button.innerHTML = '<i class="fas fa-chevron-up"></i>';
    button.title = 'Back to top';
    document.body.appendChild(button);

    // Show/hide button based on scroll position
    const toggleBackToTop = () => {
        const scrollThreshold = window.innerHeight * 0.75;
        if (window.scrollY > scrollThreshold) {
            button.classList.add('visible');
        } else {
            button.classList.remove('visible');
        }
    };

    // Smooth scroll to top
    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Listen for scroll events
    window.addEventListener('scroll', toggleBackToTop);
    
    // Initial check
    toggleBackToTop();
}