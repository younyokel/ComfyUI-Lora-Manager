/**
 * ShowcaseView.js
 * Handles showcase content (images, videos) display for checkpoint modal
 */
import { showToast } from '../../utils/uiHelpers.js';
import { state } from '../../state/index.js';
import { NSFW_LEVELS } from '../../utils/constants.js';

/**
 * Render showcase content
 * @param {Array} images - Array of images/videos to show
 * @returns {string} HTML content
 */
export function renderShowcaseContent(images) {
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
                ${filteredImages.map(img => generateMediaWrapper(img)).join('')}
            </div>
        </div>
    `;
}

/**
 * Generate media wrapper HTML for an image or video
 * @param {Object} media - Media object with image or video data
 * @returns {string} HTML content
 */
function generateMediaWrapper(media) {
    // Calculate appropriate aspect ratio:
    // 1. Keep original aspect ratio
    // 2. Limit maximum height to 60% of viewport height
    // 3. Ensure minimum height is 40% of container width
    const aspectRatio = (media.height / media.width) * 100;
    const containerWidth = 800; // modal content maximum width
    const minHeightPercent = 40; 
    const maxHeightPercent = (window.innerHeight * 0.6 / containerWidth) * 100;
    const heightPercent = Math.max(
        minHeightPercent,
        Math.min(maxHeightPercent, aspectRatio)
    );
    
    // Check if media should be blurred
    const nsfwLevel = media.nsfwLevel !== undefined ? media.nsfwLevel : 0;
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
    
    // Extract metadata from the media
    const meta = media.meta || {};
    const prompt = meta.prompt || '';
    const negativePrompt = meta.negative_prompt || meta.negativePrompt || '';
    const size = meta.Size || `${media.width}x${media.height}`;
    const seed = meta.seed || '';
    const model = meta.Model || '';
    const steps = meta.steps || '';
    const sampler = meta.sampler || '';
    const cfgScale = meta.cfgScale || '';
    const clipSkip = meta.clipSkip || '';
    
    // Check if we have any meaningful generation parameters
    const hasParams = seed || model || steps || sampler || cfgScale || clipSkip;
    const hasPrompts = prompt || negativePrompt;
    
    // Create metadata panel content
    const metadataPanel = generateMetadataPanel(
        hasParams, hasPrompts, 
        prompt, negativePrompt, 
        size, seed, model, steps, sampler, cfgScale, clipSkip
    );
    
    // Check if this is a video or image
    if (media.type === 'video') {
        return generateVideoWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel);
    }
    
    return generateImageWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel);
}

/**
 * Generate metadata panel HTML
 */
function generateMetadataPanel(hasParams, hasPrompts, prompt, negativePrompt, size, seed, model, steps, sampler, cfgScale, clipSkip) {
    // Create unique IDs for prompt copying
    const promptIndex = Math.random().toString(36).substring(2, 15);
    const negPromptIndex = Math.random().toString(36).substring(2, 15);
    
    let content = '<div class="image-metadata-panel"><div class="metadata-content">';
    
    if (hasParams) {
        content += `
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
    }
    
    if (!hasParams && !hasPrompts) {
        content += `
            <div class="no-metadata-message">
                <i class="fas fa-info-circle"></i>
                <span>No generation parameters available</span>
            </div>
        `;
    }
    
    if (prompt) {
        content += `
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
        `;
    }
    
    if (negativePrompt) {
        content += `
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
        `;
    }
    
    content += '</div></div>';
    return content;
}

/**
 * Generate video wrapper HTML
 */
function generateVideoWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel) {
    return `
        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
            ${shouldBlur ? `
                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            <video controls autoplay muted loop crossorigin="anonymous" 
                referrerpolicy="no-referrer" data-src="${media.url}"
                class="lazy ${shouldBlur ? 'blurred' : ''}">
                <source data-src="${media.url}" type="video/mp4">
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
 * Generate image wrapper HTML
 */
function generateImageWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel) {
    return `
        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
            ${shouldBlur ? `
                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            <img data-src="${media.url}" 
                alt="Preview" 
                crossorigin="anonymous" 
                referrerpolicy="no-referrer"
                width="${media.width}"
                height="${media.height}"
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
 * Toggle showcase expansion
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
    }
}

/**
 * Initialize metadata panel interaction handlers
 */
function initMetadataPanelHandlers(container) {
    const mediaWrappers = container.querySelectorAll('.media-wrapper');
    
    mediaWrappers.forEach(wrapper => {
        const metadataPanel = wrapper.querySelector('.image-metadata-panel');
        if (!metadataPanel) return;
        
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
                    await navigator.clipboard.writeText(promptElement.textContent);
                    showToast('Prompt copied to clipboard', 'success');
                } catch (err) {
                    console.error('Copy failed:', err);
                    showToast('Copy failed', 'error');
                }
            });
        });
        
        // Prevent panel scroll from causing modal scroll
        metadataPanel.addEventListener('wheel', (e) => {
            e.stopPropagation();
        });
    });
}

/**
 * Initialize blur toggle handlers
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
 * Initialize lazy loading for images and videos
 */
function initLazyLoading(container) {
    const lazyElements = container.querySelectorAll('.lazy');
    
    const lazyLoad = (element) => {
        if (element.tagName.toLowerCase() === 'video') {
            element.src = element.dataset.src;
            element.querySelector('source').src = element.dataset.src;
            element.load();
        } else {
            element.src = element.dataset.src;
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
 * Set up showcase scroll functionality
 */
export function setupShowcaseScroll() {
    // Listen for wheel events
    document.addEventListener('wheel', (event) => {
        const modalContent = document.querySelector('#checkpointModal .modal-content');
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
                const checkpointModal = document.getElementById('checkpointModal');
                if (checkpointModal && checkpointModal.querySelector('.modal-content')) {
                    setupBackToTopButton(checkpointModal.querySelector('.modal-content'));
                }
            }
        }
    });
    
    // Start observing the document body for changes
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also try to set up the button immediately in case the modal is already open
    const modalContent = document.querySelector('#checkpointModal .modal-content');
    if (modalContent) {
        setupBackToTopButton(modalContent);
    }
}

/**
 * Set up back-to-top button
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
 * Scroll to top of modal content
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