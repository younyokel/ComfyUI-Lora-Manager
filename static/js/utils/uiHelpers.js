import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { getStorageItem, setStorageItem } from './storageHelpers.js';
import { NSFW_LEVELS } from './constants.js';

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

/**
 * Sends LoRA syntax to the active ComfyUI workflow
 * @param {string} loraSyntax - The LoRA syntax to send
 * @param {boolean} replaceMode - Whether to replace existing LoRAs (true) or append (false)
 * @param {string} syntaxType - The type of syntax ('lora' or 'recipe')
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function sendLoraToWorkflow(loraSyntax, replaceMode = false, syntaxType = 'lora') {
  try {
    let loraNodes = [];
    let isDesktopMode = false;
    
    // Get the current workflow from localStorage
    const workflowData = localStorage.getItem('workflow');
    if (workflowData) {
      // Web browser mode - extract node IDs from workflow
      const workflow = JSON.parse(workflowData);
      
      // Find all Lora Loader (LoraManager) nodes
      if (workflow.nodes && Array.isArray(workflow.nodes)) {
        for (const node of workflow.nodes) {
          if (node.type === "Lora Loader (LoraManager)") {
            loraNodes.push(node.id);
          }
        }
      }
      
      if (loraNodes.length === 0) {
        showToast('No Lora Loader nodes found in the workflow', 'warning');
        return false;
      }
    } else {
      // ComfyUI Desktop mode - don't specify node IDs and let backend handle it
      isDesktopMode = true;
    }
    
    // Call the backend API to update the lora code
    const response = await fetch('/api/update-lora-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        node_ids: isDesktopMode ? undefined : loraNodes,
        lora_code: loraSyntax,
        mode: replaceMode ? 'replace' : 'append'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Use different toast messages based on syntax type
      if (syntaxType === 'recipe') {
        showToast(`Recipe ${replaceMode ? 'replaced' : 'added'} to workflow`, 'success');
      } else {
        showToast(`LoRA ${replaceMode ? 'replaced' : 'added'} to workflow`, 'success');
      }
      return true;
    } else {
      showToast(result.error || `Failed to send ${syntaxType === 'recipe' ? 'recipe' : 'LoRA'} to workflow`, 'error');
      return false;
    }
  } catch (error) {
    console.error('Failed to send to workflow:', error);
    showToast(`Failed to send ${syntaxType === 'recipe' ? 'recipe' : 'LoRA'} to workflow`, 'error');
    return false;
  }
}

/**
 * Opens the example images folder for a specific model
 * @param {string} modelHash - The SHA256 hash of the model
 */
export async function openExampleImagesFolder(modelHash) {
  try {
    const response = await fetch('/api/open-example-images-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_hash: modelHash
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Opening example images folder', 'success');
      return true;
    } else {
      showToast(result.error || 'Failed to open example images folder', 'error');
      return false;
    }
  } catch (error) {
    console.error('Failed to open example images folder:', error);
    showToast('Failed to open example images folder', 'error');
    return false;
  }
}

/**
 * Gets local URLs for example images with primary and fallback options
 * @param {Object} img - Image object
 * @param {number} index - Image index
 * @param {string} modelHash - Model hash
 * @returns {Object} - Object with primary and fallback URLs
 */
export function getLocalExampleImageUrl(img, index, modelHash) {
    if (!modelHash) return { primary: null, fallback: null };
    
    // Get remote extension
    const remoteExt = (img.url || '').split('?')[0].split('.').pop().toLowerCase();
    
    // If it's a video (mp4), use that extension with no fallback
    if (remoteExt === 'mp4') {
        const videoUrl = `/example_images_static/${modelHash}/image_${index + 1}.mp4`;
        return { primary: videoUrl, fallback: null };
    }
    
    // For images, prepare both possible formats
    const basePath = `/example_images_static/${modelHash}/image_${index + 1}`;
    const webpUrl = `${basePath}.webp`;
    const originalExtUrl = remoteExt ? `${basePath}.${remoteExt}` : `${basePath}.jpg`;
    
    // Check if optimization is enabled (defaults to true)
    const optimizeImages = state.settings.optimizeExampleImages !== false;
    
    // Return primary and fallback URLs based on current settings
    return {
        primary: optimizeImages ? webpUrl : originalExtUrl,
        fallback: optimizeImages ? originalExtUrl : webpUrl
    };
}

/**
 * Try to load local image first, fall back to remote if local fails
 * @param {HTMLImageElement} imgElement - The image element to update
 * @param {Object} urls - Object with local URLs {primary, fallback} and remote URL
 */
export function tryLocalImageOrFallbackToRemote(imgElement, urls) {
    const { primary: localUrl, fallback: fallbackUrl } = urls.local || {};
    const remoteUrl = urls.remote;
    
    // If no local options, use remote directly
    if (!localUrl) {
        imgElement.src = remoteUrl;
        return;
    }
    
    // Try primary local URL
    const testImg = new Image();
    testImg.onload = () => {
        // Primary local image loaded successfully
        imgElement.src = localUrl;
    };
    testImg.onerror = () => {
        // Try fallback URL if available
        if (fallbackUrl) {
            const fallbackImg = new Image();
            fallbackImg.onload = () => {
                imgElement.src = fallbackUrl;
            };
            fallbackImg.onerror = () => {
                // Both local options failed, use remote
                imgElement.src = remoteUrl;
            };
            fallbackImg.src = fallbackUrl;
        } else {
            // No fallback, use remote
            imgElement.src = remoteUrl;
        }
    };
    testImg.src = localUrl;
}

/**
 * Try to load local video first, fall back to remote if local fails
 * @param {HTMLVideoElement} videoElement - The video element to update
 * @param {Object} urls - Object with local URLs {primary} and remote URL
 */
export function tryLocalVideoOrFallbackToRemote(videoElement, urls) {
    const { primary: localUrl } = urls.local || {};
    const remoteUrl = urls.remote;
    
    // Only try local if we have a local path
    if (localUrl) {
        // Try to fetch local file headers to see if it exists
        fetch(localUrl, { method: 'HEAD' })
            .then(response => {
                if (response.ok) {
                    // Local video exists, use it
                    videoElement.src = localUrl;
                    const source = videoElement.querySelector('source');
                    if (source) source.src = localUrl;
                } else {
                    // Local video doesn't exist, use remote
                    videoElement.src = remoteUrl;
                    const source = videoElement.querySelector('source');
                    if (source) source.src = remoteUrl;
                }
                videoElement.load();
            })
            .catch(() => {
                // Error fetching, use remote
                videoElement.src = remoteUrl;
                const source = videoElement.querySelector('source');
                if (source) source.src = remoteUrl;
                videoElement.load();
            });
    } else {
        // No local path, use remote directly
        videoElement.src = remoteUrl;
        const source = videoElement.querySelector('source');
        if (source) source.src = remoteUrl;
        videoElement.load();
    }
}

/**
 * Initialize lazy loading for images and videos in a container
 * @param {HTMLElement} container - The container with lazy-loadable elements
 */
export function initLazyLoading(container) {
    const lazyElements = container.querySelectorAll('.lazy');
    
    const lazyLoad = (element) => {
        // Get URLs from data attributes
        const localUrls = {
            primary: element.dataset.localSrc || null,
            fallback: element.dataset.localFallbackSrc || null
        };
        const remoteUrl = element.dataset.remoteSrc;
        
        const urls = {
            local: localUrls,
            remote: remoteUrl
        };
        
        // Check if element is a video or image
        if (element.tagName.toLowerCase() === 'video') {
            tryLocalVideoOrFallbackToRemote(element, urls);
        } else {
            tryLocalImageOrFallbackToRemote(element, urls);
        }
        
        element.classList.remove('lazy');
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                lazyLoad(entry.target);
                observer.unobserve(entry.target);
            }
        });
    });

    lazyElements.forEach(element => observer.observe(element));
}

/**
 * Get the actual rendered rectangle of a media element with object-fit: contain
 * @param {HTMLElement} mediaElement - The img or video element
 * @param {number} containerWidth - Width of the container
 * @param {number} containerHeight - Height of the container
 * @returns {Object} - Rect with left, top, right, bottom coordinates
 */
export function getRenderedMediaRect(mediaElement, containerWidth, containerHeight) {
    // Get natural dimensions of the media
    const naturalWidth = mediaElement.naturalWidth || mediaElement.videoWidth || mediaElement.clientWidth;
    const naturalHeight = mediaElement.naturalHeight || mediaElement.videoHeight || mediaElement.clientHeight;
    
    if (!naturalWidth || !naturalHeight) {
        // Fallback if dimensions cannot be determined
        return { left: 0, top: 0, right: containerWidth, bottom: containerHeight };
    }
    
    // Calculate aspect ratios
    const containerRatio = containerWidth / containerHeight;
    const mediaRatio = naturalWidth / naturalHeight;
    
    let renderedWidth, renderedHeight, left = 0, top = 0;
    
    // Apply object-fit: contain logic
    if (containerRatio > mediaRatio) {
        // Container is wider than media - will have empty space on sides
        renderedHeight = containerHeight;
        renderedWidth = renderedHeight * mediaRatio;
        left = (containerWidth - renderedWidth) / 2;
    } else {
        // Container is taller than media - will have empty space top/bottom
        renderedWidth = containerWidth;
        renderedHeight = renderedWidth / mediaRatio;
        top = (containerHeight - renderedHeight) / 2;
    }
    
    return {
        left,
        top,
        right: left + renderedWidth,
        bottom: top + renderedHeight
    };
}

/**
 * Initialize metadata panel interaction handlers
 * @param {HTMLElement} container - Container element with media wrappers
 */
export function initMetadataPanelHandlers(container) {
    const mediaWrappers = container.querySelectorAll('.media-wrapper');
    
    mediaWrappers.forEach(wrapper => {
        // Get the metadata panel and media element (img or video)
        const metadataPanel = wrapper.querySelector('.image-metadata-panel');
        const mediaElement = wrapper.querySelector('img, video');
        
        if (!metadataPanel || !mediaElement) return;
        
        let isOverMetadataPanel = false;
        
        // Add event listeners to the wrapper for mouse tracking
        wrapper.addEventListener('mousemove', (e) => {
            // Get mouse position relative to wrapper
            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Get the actual displayed dimensions of the media element
            const mediaRect = getRenderedMediaRect(mediaElement, rect.width, rect.height);
            
            // Check if mouse is over the actual media content
            const isOverMedia = (
                mouseX >= mediaRect.left && 
                mouseX <= mediaRect.right && 
                mouseY >= mediaRect.top && 
                mouseY <= mediaRect.bottom
            );
            
            // Show metadata panel when over media content or metadata panel itself
            if (isOverMedia || isOverMetadataPanel) {
                metadataPanel.classList.add('visible');
            } else {
                metadataPanel.classList.remove('visible');
            }
        });
        
        wrapper.addEventListener('mouseleave', () => {
            if (!isOverMetadataPanel) {
                metadataPanel.classList.remove('visible');
            }
        });
        
        // Add mouse enter/leave events for the metadata panel itself
        metadataPanel.addEventListener('mouseenter', () => {
            isOverMetadataPanel = true;
            metadataPanel.classList.add('visible');
        });
        
        metadataPanel.addEventListener('mouseleave', () => {
            isOverMetadataPanel = false;
            // Only hide if mouse is not over the media
            const rect = wrapper.getBoundingClientRect();
            const mediaRect = getRenderedMediaRect(mediaElement, rect.width, rect.height);
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            const isOverMedia = (
                mouseX >= mediaRect.left && 
                mouseX <= mediaRect.right && 
                mouseY >= mediaRect.top && 
                mouseY <= mediaRect.bottom
            );
            
            if (!isOverMedia) {
                metadataPanel.classList.remove('visible');
            }
        });
        
        // Prevent events from bubbling
        metadataPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Handle copy prompt buttons
        const copyBtns = metadataPanel.querySelectorAll('.copy-prompt-btn');
        copyBtns.forEach(copyBtn => {
            const promptIndex = copyBtn.dataset.promptIndex;
            const promptElement = wrapper.querySelector(`#prompt-${promptIndex}`);
            
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (!promptElement) return;
                
                try {
                    await copyToClipboard(promptElement.textContent, 'Prompt copied to clipboard');
                } catch (err) {
                    console.error('Copy failed:', err);
                    showToast('Copy failed', 'error');
                }
            });
        });
        
        // Prevent panel scroll from causing modal scroll
        metadataPanel.addEventListener('wheel', (e) => {
            const isAtTop = metadataPanel.scrollTop === 0;
            const isAtBottom = metadataPanel.scrollHeight - metadataPanel.scrollTop === metadataPanel.clientHeight;
            
            // Only prevent default if scrolling would cause the panel to scroll
            if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
                e.stopPropagation();
            }
        }, { passive: true });
    });
}

/**
 * Initialize NSFW content blur toggle handlers
 * @param {HTMLElement} container - Container element with media wrappers
 */
export function initNsfwBlurHandlers(container) {
    // Handle toggle blur buttons
    const toggleButtons = container.querySelectorAll('.toggle-blur-btn');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = btn.closest('.media-wrapper');
            const media = wrapper.querySelector('img, video');
            const isBlurred = media.classList.toggle('blurred');
            const icon = btn.querySelector('i');
            
            // Update the icon based on blur state
            if (isBlurred) {
                icon.className = 'fas fa-eye';
            } else {
                icon.className = 'fas fa-eye-slash';
            }
            
            // Toggle the overlay visibility
            const overlay = wrapper.querySelector('.nsfw-overlay');
            if (overlay) {
                overlay.style.display = isBlurred ? 'flex' : 'none';
            }
        });
    });
    
    // Handle "Show" buttons in overlays
    const showButtons = container.querySelectorAll('.show-content-btn');
    showButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = btn.closest('.media-wrapper');
            const media = wrapper.querySelector('img, video');
            media.classList.remove('blurred');
            
            // Update the toggle button icon
            const toggleBtn = wrapper.querySelector('.toggle-blur-btn');
            if (toggleBtn) {
                toggleBtn.querySelector('i').className = 'fas fa-eye-slash';
            }
            
            // Hide the overlay
            const overlay = wrapper.querySelector('.nsfw-overlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        });
    });
}

/**
 * Toggle showcase expansion
 * @param {HTMLElement} element - The scroll indicator element
 */
export function toggleShowcase(element) {
    const carousel = element.nextElementSibling;
    const isCollapsed = carousel.classList.contains('collapsed');
    const indicator = element.querySelector('span');
    const icon = element.querySelector('i');
    
    carousel.classList.toggle('collapsed');
    
    if (isCollapsed) {
        const count = carousel.querySelectorAll('.media-wrapper').length;
        indicator.textContent = `Scroll or click to hide examples`;
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        initLazyLoading(carousel);
        
        // Initialize NSFW content blur toggle handlers
        initNsfwBlurHandlers(carousel);
        
        // Initialize metadata panel interaction handlers
        initMetadataPanelHandlers(carousel);
    } else {
        const count = carousel.querySelectorAll('.media-wrapper').length;
        indicator.textContent = `Scroll or click to show ${count} examples`;
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        
        // Make sure any open metadata panels get closed
        const carouselContainer = carousel.querySelector('.carousel-container');
        if (carouselContainer) {
            carouselContainer.style.height = '0';
            setTimeout(() => {
                carouselContainer.style.height = '';
            }, 300);
        }
    }
}

/**
 * Set up showcase scroll functionality
 * @param {string} modalId - ID of the modal element
 */
export function setupShowcaseScroll(modalId) {
    // Listen for wheel events
    document.addEventListener('wheel', (event) => {
        const modalContent = document.querySelector(`#${modalId} .modal-content`);
        if (!modalContent) return;
        
        const showcase = modalContent.querySelector('.showcase-section');
        if (!showcase) return;
        
        const carousel = showcase.querySelector('.carousel');
        const scrollIndicator = showcase.querySelector('.scroll-indicator');
        
        if (carousel?.classList.contains('collapsed') && event.deltaY > 0) {
            const isNearBottom = modalContent.scrollHeight - modalContent.scrollTop - modalContent.clientHeight < 100;
            
            if (isNearBottom) {
                toggleShowcase(scrollIndicator);
                event.preventDefault();
            }
        }
    }, { passive: false });
    
    // Use MutationObserver to set up back-to-top button when modal content is added
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                const modal = document.getElementById(modalId);
                if (modal && modal.querySelector('.modal-content')) {
                    setupBackToTopButton(modal.querySelector('.modal-content'));
                }
            }
        }
    });
    
    // Start observing the document body for changes
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also try to set up the button immediately in case the modal is already open
    const modalContent = document.querySelector(`#${modalId} .modal-content`);
    if (modalContent) {
        setupBackToTopButton(modalContent);
    }
}

/**
 * Set up back-to-top button
 * @param {HTMLElement} modalContent - Modal content element
 */
export function setupBackToTopButton(modalContent) {
    // Remove any existing scroll listeners to avoid duplicates
    modalContent.onscroll = null;
    
    // Add new scroll listener
    modalContent.addEventListener('scroll', () => {
        const backToTopBtn = modalContent.querySelector('.back-to-top');
        if (backToTopBtn) {
            if (modalContent.scrollTop > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }
    });
    
    // Trigger a scroll event to check initial position
    modalContent.dispatchEvent(new Event('scroll'));
}

/**
 * Scroll to top of modal content
 * @param {HTMLElement} button - Back to top button element
 */
export function scrollToTop(button) {
    const modalContent = button.closest('.modal-content');
    if (modalContent) {
        modalContent.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

/**
 * Get example image files for a specific model from the backend
 * @param {string} modelHash - The model's hash
 * @returns {Promise<Array>} Array of file objects with path and metadata
 */
export async function getExampleImageFiles(modelHash) {
  try {
    const response = await fetch(`/api/example-image-files?model_hash=${modelHash}`);
    const result = await response.json();
    
    if (result.success) {
      return result.files;
    } else {
      console.error('Failed to get example image files:', result.error);
      return [];
    }
  } catch (error) {
    console.error('Error fetching example image files:', error);
    return [];
  }
}