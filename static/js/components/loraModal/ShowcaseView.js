/**
 * ShowcaseView.js
 * 处理LoRA模型展示内容（图片、视频）的功能模块
 */
import { showToast, copyToClipboard } from '../../utils/uiHelpers.js';
import { state } from '../../state/index.js';
import { NSFW_LEVELS } from '../../utils/constants.js';

/**
 * Get the local URL for an example image if available
 * @param {Object} img - Image object
 * @param {number} index - Image index
 * @param {string} modelHash - Model hash
 * @returns {string|null} - Local URL or null if not available
 */
function getLocalExampleImageUrl(img, index, modelHash) {
    if (!modelHash) return null;
    
    // Get remote extension
    const remoteExt = (img.url || '').split('?')[0].split('.').pop().toLowerCase();
    
    // If it's a video (mp4), use that extension
    if (remoteExt === 'mp4') {
        return `/example_images_static/${modelHash}/image_${index + 1}.mp4`;
    }
    
    // For images, check if optimization is enabled (defaults to true) 
    const optimizeImages = state.settings.optimizeExampleImages !== false;
    
    // Use .webp for images if optimization enabled, otherwise use original extension
    const extension = optimizeImages ? 'webp' : remoteExt;
    
    return `/example_images_static/${modelHash}/image_${index + 1}.${extension}`;
}

/**
 * 渲染展示内容
 * @param {Array} images - 要展示的图片/视频数组
 * @param {string} modelHash - Model hash for identifying local files
 * @returns {string} HTML内容
 */
export function renderShowcaseContent(images, modelHash) {
    if (!images?.length) return '<div class="no-examples">No example images available</div>';
    
    // Filter images based on SFW setting
    const showOnlySFW = state.settings.show_only_sfw;
    let filteredImages = images;
    let hiddenCount = 0;
    
    if (showOnlySFW) {
        filteredImages = images.filter(img => {
            const nsfwLevel = img.nsfwLevel !== undefined ? img.nsfwLevel : 0;
            const isSfw = nsfwLevel < NSFW_LEVELS.R;
            if (!isSfw) hiddenCount++;
            return isSfw;
        });
    }
    
    // Show message if no images are available after filtering
    if (filteredImages.length === 0) {
        return `
            <div class="no-examples">
                <p>All example images are filtered due to NSFW content settings</p>
                <p class="nsfw-filter-info">Your settings are currently set to show only safe-for-work content</p>
                <p>You can change this in Settings <i class="fas fa-cog"></i></p>
            </div>
        `;
    }
    
    // Show hidden content notification if applicable
    const hiddenNotification = hiddenCount > 0 ? 
        `<div class="nsfw-filter-notification">
            <i class="fas fa-eye-slash"></i> ${hiddenCount} ${hiddenCount === 1 ? 'image' : 'images'} hidden due to SFW-only setting
        </div>` : '';
    
    return `
        <div class="scroll-indicator" onclick="toggleShowcase(this)">
            <i class="fas fa-chevron-down"></i>
            <span>Scroll or click to show ${filteredImages.length} examples</span>
        </div>
        <div class="carousel collapsed">
            ${hiddenNotification}
            <div class="carousel-container">
                ${filteredImages.map((img, index) => {
                    // Try to get local URL for the example image
                    const localUrl = getLocalExampleImageUrl(img, index, modelHash);
                    
                    // Create data attributes for both remote and local URLs
                    const remoteUrl = img.url;
                    const dataRemoteSrc = remoteUrl;
                    const dataLocalSrc = localUrl;
                    
                    // 计算适当的展示高度：
                    // 1. 保持原始宽高比
                    // 2. 限制最大高度为视窗高度的60%
                    // 3. 确保最小高度为容器宽度的40%
                    const aspectRatio = (img.height / img.width) * 100;
                    const containerWidth = 800; // modal content的最大宽度
                    const minHeightPercent = 40; // 最小高度为容器宽度的40%
                    const maxHeightPercent = (window.innerHeight * 0.6 / containerWidth) * 100;
                    const heightPercent = Math.max(
                        minHeightPercent,
                        Math.min(maxHeightPercent, aspectRatio)
                    );
                    
                    // Check if image should be blurred
                    const nsfwLevel = img.nsfwLevel !== undefined ? img.nsfwLevel : 0;
                    const shouldBlur = state.settings.blurMatureContent && nsfwLevel > NSFW_LEVELS.PG13;
                    
                    // Determine NSFW warning text based on level
                    let nsfwText = "Mature Content";
                    if (nsfwLevel >= NSFW_LEVELS.XXX) {
                        nsfwText = "XXX-rated Content";
                    } else if (nsfwLevel >= NSFW_LEVELS.X) {
                        nsfwText = "X-rated Content";
                    } else if (nsfwLevel >= NSFW_LEVELS.R) {
                        nsfwText = "R-rated Content";
                    }
                    
                    // Extract metadata from the image
                    const meta = img.meta || {};
                    const prompt = meta.prompt || '';
                    const negativePrompt = meta.negative_prompt || meta.negativePrompt || '';
                    const size = meta.Size || `${img.width}x${img.height}`;
                    const seed = meta.seed || '';
                    const model = meta.Model || '';
                    const steps = meta.steps || '';
                    const sampler = meta.sampler || '';
                    const cfgScale = meta.cfgScale || '';
                    const clipSkip = meta.clipSkip || '';
                    
                    // Check if we have any meaningful generation parameters
                    const hasParams = seed || model || steps || sampler || cfgScale || clipSkip;
                    const hasPrompts = prompt || negativePrompt;
                    
                    // If no metadata available, show a message
                    if (!hasParams && !hasPrompts) {
                        const metadataPanel = `
                            <div class="image-metadata-panel">
                                <div class="metadata-content">
                                    <div class="no-metadata-message">
                                        <i class="fas fa-info-circle"></i>
                                        <span>No generation parameters available</span>
                                    </div>
                                </div>
                            </div>
                        `;
                        
                        if (img.type === 'video') {
                            return generateVideoWrapper(img, heightPercent, shouldBlur, nsfwText, metadataPanel, dataLocalSrc, dataRemoteSrc);
                        }
                        return generateImageWrapper(img, heightPercent, shouldBlur, nsfwText, metadataPanel, dataLocalSrc, dataRemoteSrc);
                    }
                    
                    // Create a data attribute with the prompt for copying instead of trying to handle it in the onclick
                    // This avoids issues with quotes and special characters
                    const promptIndex = Math.random().toString(36).substring(2, 15);
                    const negPromptIndex = Math.random().toString(36).substring(2, 15);
                    
                    // Create parameter tags HTML
                    const paramTags = `
                        <div class="params-tags">
                            ${size ? `<div class="param-tag"><span class="param-name">Size:</span><span class="param-value">${size}</span></div>` : ''}
                            ${seed ? `<div class="param-tag"><span class="param-name">Seed:</span><span class="param-value">${seed}</span></div>` : ''}
                            ${model ? `<div class="param-tag"><span class="param-name">Model:</span><span class="param-value">${model}</span></div>` : ''}
                            ${steps ? `<div class="param-tag"><span class="param-name">Steps:</span><span class="param-value">${steps}</span></div>` : ''}
                            ${sampler ? `<div class="param-tag"><span class="param-name">Sampler:</span><span class="param-value">${sampler}</span></div>` : ''}
                            ${cfgScale ? `<div class="param-tag"><span class="param-name">CFG:</span><span class="param-value">${cfgScale}</span></div>` : ''}
                            ${clipSkip ? `<div class="param-tag"><span class="param-name">Clip Skip:</span><span class="param-value">${clipSkip}</span></div>` : ''}
                        </div>
                    `;
                    
                    // Metadata panel HTML
                    const metadataPanel = `
                        <div class="image-metadata-panel">
                            <div class="metadata-content">
                                ${hasParams ? paramTags : ''}
                                ${!hasParams && !hasPrompts ? `
                                <div class="no-metadata-message">
                                    <i class="fas fa-info-circle"></i>
                                    <span>No generation parameters available</span>
                                </div>
                                ` : ''}
                                ${prompt ? `
                                <div class="metadata-row prompt-row">
                                    <span class="metadata-label">Prompt:</span>
                                    <div class="metadata-prompt-wrapper">
                                        <div class="metadata-prompt">${prompt}</div>
                                        <button class="copy-prompt-btn" data-prompt-index="${promptIndex}">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="hidden-prompt" id="prompt-${promptIndex}" style="display:none;">${prompt}</div>
                                ` : ''}
                                ${negativePrompt ? `
                                <div class="metadata-row prompt-row">
                                    <span class="metadata-label">Negative Prompt:</span>
                                    <div class="metadata-prompt-wrapper">
                                        <div class="metadata-prompt">${negativePrompt}</div>
                                        <button class="copy-prompt-btn" data-prompt-index="${negPromptIndex}">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="hidden-prompt" id="prompt-${negPromptIndex}" style="display:none;">${negativePrompt}</div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                    
                    if (img.type === 'video') {
                        return generateVideoWrapper(img, heightPercent, shouldBlur, nsfwText, metadataPanel, dataLocalSrc, dataRemoteSrc);
                    }
                    return generateImageWrapper(img, heightPercent, shouldBlur, nsfwText, metadataPanel, dataLocalSrc, dataRemoteSrc);
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * 生成视频包装HTML
 */
function generateVideoWrapper(img, heightPercent, shouldBlur, nsfwText, metadataPanel, localUrl, remoteUrl) {
    return `
        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
            ${shouldBlur ? `
                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            <video controls autoplay muted loop crossorigin="anonymous" 
                referrerpolicy="no-referrer" 
                data-local-src="${localUrl || ''}"
                data-remote-src="${remoteUrl}"
                class="lazy ${shouldBlur ? 'blurred' : ''}">
                <source data-local-src="${localUrl || ''}" data-remote-src="${remoteUrl}" type="video/mp4">
                Your browser does not support video playback
            </video>
            ${shouldBlur ? `
                <div class="nsfw-overlay">
                    <div class="nsfw-warning">
                        <p>${nsfwText}</p>
                        <button class="show-content-btn">Show</button>
                    </div>
                </div>
            ` : ''}
            ${metadataPanel}
        </div>
    `;
}

/**
 * 生成图片包装HTML
 */
function generateImageWrapper(img, heightPercent, shouldBlur, nsfwText, metadataPanel, localUrl, remoteUrl) {
    return `
        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
            ${shouldBlur ? `
                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            <img data-local-src="${localUrl || ''}" 
                data-remote-src="${remoteUrl}"
                alt="Preview" 
                crossorigin="anonymous" 
                referrerpolicy="no-referrer"
                width="${img.width}"
                height="${img.height}"
                class="lazy ${shouldBlur ? 'blurred' : ''}"> 
            ${shouldBlur ? `
                <div class="nsfw-overlay">
                    <div class="nsfw-warning">
                        <p>${nsfwText}</p>
                        <button class="show-content-btn">Show</button>
                    </div>
                </div>
            ` : ''}
            ${metadataPanel}
        </div>
    `;
}

/**
 * 切换展示区域的显示状态
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
 * 初始化元数据面板交互处理
 */
function initMetadataPanelHandlers(container) {
    // Find all media wrappers
    const mediaWrappers = container.querySelectorAll('.media-wrapper');
    
    mediaWrappers.forEach(wrapper => {
        // Get the metadata panel
        const metadataPanel = wrapper.querySelector('.image-metadata-panel');
        if (!metadataPanel) return;
        
        // Prevent events from the metadata panel from bubbling
        metadataPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Handle copy prompt button clicks
        const copyBtns = metadataPanel.querySelectorAll('.copy-prompt-btn');
        copyBtns.forEach(copyBtn => {
            const promptIndex = copyBtn.dataset.promptIndex;
            const promptElement = wrapper.querySelector(`#prompt-${promptIndex}`);
            
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent bubbling
                
                if (!promptElement) return;
                
                try {
                    await copyToClipboard(promptElement.textContent, 'Prompt copied to clipboard');
                } catch (err) {
                    console.error('Copy failed:', err);
                    showToast('Copy failed', 'error');
                }
            });
        });
        
        // Prevent scrolling in the metadata panel from scrolling the whole modal
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
 * 初始化模糊切换处理
 */
function initNsfwBlurHandlers(container) {
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
 * 初始化延迟加载
 */
function initLazyLoading(container) {
    const lazyElements = container.querySelectorAll('.lazy');
    
    const lazyLoad = (element) => {
        const localSrc = element.dataset.localSrc;
        const remoteSrc = element.dataset.remoteSrc;
        
        // Check if element is an image or video
        if (element.tagName.toLowerCase() === 'video') {
            // Try local first, then remote
            tryLocalOrFallbackToRemote(element, localSrc, remoteSrc);
        } else {
            // For images, we'll use an Image object to test if local file exists
            tryLocalImageOrFallbackToRemote(element, localSrc, remoteSrc);
        }
        
        element.classList.remove('lazy');
    };
    
    // Try to load local image first, fall back to remote if local fails
    const tryLocalImageOrFallbackToRemote = (imgElement, localSrc, remoteSrc) => {
        // Only try local if we have a local path
        if (localSrc) {
            const testImg = new Image();
            testImg.onload = () => {
                // Local image loaded successfully
                imgElement.src = localSrc;
            };
            testImg.onerror = () => {
                // Local image failed, use remote
                imgElement.src = remoteSrc;
            };
            // Start loading test image
            testImg.src = localSrc;
        } else {
            // No local path, use remote directly
            imgElement.src = remoteSrc;
        }
    };
    
    // Try to load local video first, fall back to remote if local fails
    const tryLocalOrFallbackToRemote = (videoElement, localSrc, remoteSrc) => {
        // Only try local if we have a local path
        if (localSrc) {
            // Try to fetch local file headers to see if it exists
            fetch(localSrc, { method: 'HEAD' })
                .then(response => {
                    if (response.ok) {
                        // Local video exists, use it
                        videoElement.src = localSrc;
                        videoElement.querySelector('source').src = localSrc;
                    } else {
                        // Local video doesn't exist, use remote
                        videoElement.src = remoteSrc;
                        videoElement.querySelector('source').src = remoteSrc;
                    }
                    videoElement.load();
                })
                .catch(() => {
                    // Error fetching, use remote
                    videoElement.src = remoteSrc;
                    videoElement.querySelector('source').src = remoteSrc;
                    videoElement.load();
                });
        } else {
            // No local path, use remote directly
            videoElement.src = remoteSrc;
            videoElement.querySelector('source').src = remoteSrc;
            videoElement.load();
        }
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
 * 设置展示区域的滚动处理
 */
export function setupShowcaseScroll() {
    // Add event listener to document for wheel events
    document.addEventListener('wheel', (event) => {
        // Find the active modal content
        const modalContent = document.querySelector('#loraModal .modal-content');
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

    // Use MutationObserver instead of deprecated DOMNodeInserted
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                // Check if loraModal content was added
                const loraModal = document.getElementById('loraModal');
                if (loraModal && loraModal.querySelector('.modal-content')) {
                    setupBackToTopButton(loraModal.querySelector('.modal-content'));
                }
            }
        }
    });
    
    // Start observing the document body for changes
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also try to set up the button immediately in case the modal is already open
    const modalContent = document.querySelector('#loraModal .modal-content');
    if (modalContent) {
        setupBackToTopButton(modalContent);
    }
}

/**
 * 设置返回顶部按钮
 */
function setupBackToTopButton(modalContent) {
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
 * 滚动到顶部
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
