import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { getStorageItem, setStorageItem } from './storageHelpers.js';

/**
 * Utility function to copy text to clipboard with fallback for older browsers
 * @param {string} text - The text to copy to clipboard
 * @param {string} successMessage - Optional success message to show in toast
 * @returns {Promise<boolean>} - Promise that resolves to true if copy was successful
 */
export async function copyToClipboard(text, successMessage = 'Copied to clipboard') {
    try {
        // Modern clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'absolute';
            textarea.style.left = '-99999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        
        if (successMessage) {
            showToast(successMessage, 'success');
        }
        return true;
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
        return false;
    }
}

export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Get or create toast container
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.append(toastContainer);
    }
    
    toastContainer.append(toast);

    // Calculate vertical position for stacked toasts
    const existingToasts = Array.from(toastContainer.querySelectorAll('.toast'));
    const toastIndex = existingToasts.indexOf(toast);
    const topOffset = 20; // Base offset from top
    const spacing = 10; // Space between toasts
    
    // Set position based on existing toasts
    toast.style.top = `${topOffset + (toastIndex * (toast.offsetHeight || 60 + spacing))}px`;

    requestAnimationFrame(() => {
        toast.classList.add('show');
        
        // Set timeout based on type
        let timeout = 2000; // Default (info)
        if (type === 'warning' || type === 'error') {
            timeout = 5000;
        }
        
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                toast.remove();
                
                // Reposition remaining toasts
                if (toastContainer) {
                    const remainingToasts = Array.from(toastContainer.querySelectorAll('.toast'));
                    remainingToasts.forEach((t, index) => {
                        t.style.top = `${topOffset + (index * (t.offsetHeight || 60 + spacing))}px`;
                    });
                    
                    // Remove container if empty
                    if (remainingToasts.length === 0) {
                        toastContainer.remove();
                    }
                }
            });
        }, timeout);
    });
}

export function lazyLoadImages() {
    // Use a single observer for all images with data-src attribute
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target.dataset.src) {
                // Only set src when the image becomes visible
                entry.target.src = entry.target.dataset.src;
                
                // Once loaded, stop observing this image
                observer.unobserve(entry.target);
                
                // Handle load error by replacing with a fallback
                entry.target.onerror = () => {
                    entry.target.src = '/loras_static/images/no-preview.png';
                };
            }
        });
    }, {
        rootMargin: '100px', // Load images a bit before they come into view
        threshold: 0.1
    });

    // Start observing all images with data-src attribute
    document.querySelectorAll('img[data-src]').forEach(img => {
        observer.observe(img);
    });
    
    // Store the observer in state to avoid multiple instances
    if (state.imageObserver) {
        state.imageObserver.disconnect();
    }
    state.imageObserver = observer;
    
    // Add a mutation observer to handle dynamically added images
    if (!state.mutationObserver) {
        state.mutationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Element node
                            // Check for img[data-src] in the added node
                            const images = node.querySelectorAll 
                                ? node.querySelectorAll('img[data-src]') 
                                : [];
                            
                            images.forEach(img => observer.observe(img));
                            
                            // Check if the node itself is an image with data-src
                            if (node.tagName === 'IMG' && node.dataset.src) {
                                observer.observe(node);
                            }
                        }
                    });
                }
            });
        });
        
        // Start observing the body for changes
        state.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

export function restoreFolderFilter() {
    const activeFolder = getStorageItem('activeFolder');
    const folderTag = activeFolder && document.querySelector(`.tag[data-folder="${activeFolder}"]`);
    if (folderTag) {
        folderTag.classList.add('active');
        filterByFolder(activeFolder);
    }
}

export function initTheme() {
    const savedTheme = getStorageItem('theme') || 'auto';
    applyTheme(savedTheme);
    
    // Update theme when system preference changes (for 'auto' mode)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentTheme = getStorageItem('theme') || 'auto';
        if (currentTheme === 'auto') {
            applyTheme('auto');
        }
    });
}

export function toggleTheme() {
    const currentTheme = getStorageItem('theme') || 'auto';
    let newTheme;
    
    if (currentTheme === 'dark') {
        newTheme = 'light';
    } else {
        newTheme = 'dark';
    }
    
    setStorageItem('theme', newTheme);
    applyTheme(newTheme);
    
    // Force a repaint to ensure theme changes are applied immediately
    document.body.style.display = 'none';
    document.body.offsetHeight; // Trigger a reflow
    document.body.style.display = '';
    
    return newTheme;
}

// Add a new helper function to apply the theme
function applyTheme(theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const htmlElement = document.documentElement;
    
    // Remove any existing theme attributes
    htmlElement.removeAttribute('data-theme');
    
    // Apply the appropriate theme
    if (theme === 'dark' || (theme === 'auto' && prefersDark)) {
        htmlElement.setAttribute('data-theme', 'dark');
        document.body.dataset.theme = 'dark';
    } else {
        htmlElement.setAttribute('data-theme', 'light');
        document.body.dataset.theme = 'light';
    }
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
    
    if (!searchOptionsPanel && !filterPanel) return;
    
    // Get the header element
    const header = document.querySelector('.app-header');
    if (!header) return;
    
    // Calculate the position based on the bottom of the header
    const headerRect = header.getBoundingClientRect();
    const topPosition = headerRect.bottom + 5; // Add 5px padding
    
    // Set the positions
    if (searchOptionsPanel) {
      searchOptionsPanel.style.top = `${topPosition}px`;
    }
    
    if (filterPanel) {
      filterPanel.style.top = `${topPosition}px`;
    }
    
    // Adjust panel horizontal position based on the search container
    const searchContainer = document.querySelector('.header-search');
    if (searchContainer) {
      const searchRect = searchContainer.getBoundingClientRect();
      
      // Position the search options panel aligned with the search container
      if (searchOptionsPanel) {
        searchOptionsPanel.style.right = `${window.innerWidth - searchRect.right}px`;
      }
      
      // Position the filter panel aligned with the filter button
      if (filterPanel) {
        const filterButton = document.getElementById('filterButton');
        if (filterButton) {
          const filterRect = filterButton.getBoundingClientRect();
          filterPanel.style.right = `${window.innerWidth - filterRect.right}px`;
        }
      }
    }
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
            setStorageItem('folderTagsCollapsed', 'true');
        } else {
            // Change icon to indicate folders are visible
            toggleBtn.className = 'fas fa-folder-minus';
            toggleBtn.parentElement.title = 'Hide folder tags';
            setStorageItem('folderTagsCollapsed', 'false');
        }
        
        // Update panel positions after toggling
        // Use a small delay to ensure the DOM has updated
        setTimeout(() => {
            updatePanelPositions();
        }, 50);
    }
}

// Add this to your existing initialization code
export function initFolderTagsVisibility() {
    const isCollapsed = getStorageItem('folderTagsCollapsed');
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
    const button = document.getElementById('backToTopBtn');
    if (!button) return;

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