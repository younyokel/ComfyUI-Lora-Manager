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

/**
 * Dynamically positions the search options panel and filter panel
 * based on the current layout and folder tags container height
 */
export function updatePanelPositions() {
    const searchOptionsPanel = document.getElementById('searchOptionsPanel');
    const filterPanel = document.getElementById('filterPanel');
    
    if (!searchOptionsPanel || !filterPanel) return;
    
    // Get the controls container
    const controls = document.querySelector('.controls');
    if (!controls) return;
    
    // Calculate the position based on the bottom of the controls container
    const controlsRect = controls.getBoundingClientRect();
    const topPosition = controlsRect.bottom + 10; // Add 10px padding
    
    // Set the positions
    searchOptionsPanel.style.top = `${topPosition}px`;
    filterPanel.style.top = `${topPosition}px`;
}

// Update the toggleFolderTags function
export function toggleFolderTags() {
    const folderTags = document.querySelector('.folder-tags');
    const toggleBtn = document.querySelector('.toggle-folders-btn i');
    
    if (folderTags) {
        folderTags.classList.toggle('collapsed');
        
        if (folderTags.classList.contains('collapsed')) {
            // Change icon to indicate folders are hidden
            toggleBtn.className = 'fas fa-folder-plus';
            toggleBtn.parentElement.title = 'Show folder tags';
            localStorage.setItem('folderTagsCollapsed', 'true');
        } else {
            // Change icon to indicate folders are visible
            toggleBtn.className = 'fas fa-folder-minus';
            toggleBtn.parentElement.title = 'Hide folder tags';
            localStorage.setItem('folderTagsCollapsed', 'false');
        }
        
        // Update panel positions after toggling
        // Use a small delay to ensure the DOM has updated
        setTimeout(() => {
            if (window.searchManager && typeof window.searchManager.updatePanelPositions === 'function') {
                window.searchManager.updatePanelPositions();
            } else if (typeof updatePanelPositions === 'function') {
                updatePanelPositions();
            }
        }, 50);
    }
}

// Add this to your existing initialization code
export function initFolderTagsVisibility() {
    const isCollapsed = localStorage.getItem('folderTagsCollapsed') === 'true';
    if (isCollapsed) {
        const folderTags = document.querySelector('.folder-tags');
        const toggleBtn = document.querySelector('.toggle-folders-btn i');
        if (folderTags) {
            folderTags.classList.add('collapsed');
        }
        if (toggleBtn) {
            toggleBtn.className = 'fas fa-folder-plus';
            toggleBtn.parentElement.title = 'Show folder tags';
        }
    } else {
        const toggleBtn = document.querySelector('.toggle-folders-btn i');
        if (toggleBtn) {
            toggleBtn.className = 'fas fa-folder-minus';
            toggleBtn.parentElement.title = 'Hide folder tags';
        }
    }
}

export function initBackToTop() {
    const button = document.createElement('button');
    button.className = 'back-to-top';
    button.innerHTML = '<i class="fas fa-chevron-up"></i>';
    button.title = 'Back to top';
    document.body.appendChild(button);

    // Get the scrollable container
    const scrollContainer = document.querySelector('.page-content');

    // Show/hide button based on scroll position
    const toggleBackToTop = () => {
        const scrollThreshold = window.innerHeight * 0.3;
        if (scrollContainer.scrollTop > scrollThreshold) {
            button.classList.add('visible');
        } else {
            button.classList.remove('visible');
        }
    };

    // Smooth scroll to top
    button.addEventListener('click', () => {
        scrollContainer.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Listen for scroll events on the scrollable container
    scrollContainer.addEventListener('scroll', toggleBackToTop);
    
    // Initial check
    toggleBackToTop();
}

export function getNSFWLevelName(level) {
    if (level === 0) return 'Unknown';
    if (level >= 32) return 'Blocked';
    if (level >= 16) return 'XXX';
    if (level >= 8) return 'X';
    if (level >= 4) return 'R';
    if (level >= 2) return 'PG13';
    if (level >= 1) return 'PG';
    return 'Unknown';
}