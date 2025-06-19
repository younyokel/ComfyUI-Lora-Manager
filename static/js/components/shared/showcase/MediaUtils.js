/**
 * MediaUtils.js
 * Media-specific utility functions for showcase components
 * (Moved from uiHelpers.js to better organize code)
 */
import { showToast, copyToClipboard } from '../../../utils/uiHelpers.js';
import { state } from '../../../state/index.js';

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
 * Initialize media control buttons event handlers
 * @param {HTMLElement} container - Container with media wrappers
 */
export function initMediaControlHandlers(container) {
    // Find all delete buttons in the container
    const deleteButtons = container.querySelectorAll('.example-delete-btn');
    
    deleteButtons.forEach(btn => {
        // Set initial state
        btn.dataset.state = 'initial';
        
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const shortId = this.dataset.shortId;
            const state = this.dataset.state;
            
            if (!shortId) return;
            
            // Handle two-step confirmation
            if (state === 'initial') {
                // First click: show confirmation state
                this.dataset.state = 'confirm';
                this.classList.add('confirm');
                this.title = 'Click again to confirm deletion';
                
                // Auto-reset after 3 seconds
                setTimeout(() => {
                    if (this.dataset.state === 'confirm') {
                        this.dataset.state = 'initial';
                        this.classList.remove('confirm');
                        this.title = 'Delete this example';
                    }
                }, 3000);
                
                return;
            }
            
            // Second click within 3 seconds: proceed with deletion
            if (state === 'confirm') {
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                // Get model hash from URL or data attribute
                const mediaWrapper = this.closest('.media-wrapper');
                const modelIdAttr = document.querySelector('.showcase-section')?.dataset;
                const modelHash = modelIdAttr?.loraId || modelIdAttr?.checkpointId;
                
                try {
                    // Call the API to delete the custom example
                    const response = await fetch('/api/delete-example-image', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model_hash: modelHash,
                            short_id: shortId
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        // Success: remove the media wrapper from the DOM
                        mediaWrapper.style.opacity = '0';
                        mediaWrapper.style.height = '0';
                        mediaWrapper.style.transition = 'opacity 0.3s ease, height 0.3s ease 0.3s';
                        
                        setTimeout(() => {
                            mediaWrapper.remove();
                        }, 600);
                        
                        // Show success toast
                        showToast('Example image deleted', 'success');
                        
                        // Update VirtualScroller if available
                        if (state.virtualScroller && result.model_file_path) {
                            // Create an update object with only the necessary properties
                            const updateData = {
                                civitai: {
                                    images: result.regular_images || [],
                                    customImages: result.custom_images || []
                                }
                            };
                            
                            // Update the item in the virtual scroller
                            state.virtualScroller.updateSingleItem(result.model_file_path, updateData);
                        }
                    } else {
                        // Show error message
                        showToast(result.error || 'Failed to delete example image', 'error');
                        
                        // Reset button state
                        this.disabled = false;
                        this.dataset.state = 'initial';
                        this.classList.remove('confirm');
                        this.innerHTML = '<i class="fas fa-trash-alt"></i>';
                        this.title = 'Delete this example';
                    }
                } catch (error) {
                    console.error('Error deleting example image:', error);
                    showToast('Failed to delete example image', 'error');
                    
                    // Reset button state
                    this.disabled = false;
                    this.dataset.state = 'initial';
                    this.classList.remove('confirm');
                    this.innerHTML = '<i class="fas fa-trash-alt"></i>';
                    this.title = 'Delete this example';
                }
            }
        });
    });
    
    // Find all media controls
    const mediaControls = container.querySelectorAll('.media-controls');
    
    // Set up same visibility behavior as metadata panel
    mediaControls.forEach(controlsEl => {
        const mediaWrapper = controlsEl.closest('.media-wrapper');
        const mediaElement = mediaWrapper.querySelector('img, video');
        
        // Media controls should be visible when metadata panel is visible
        const metadataPanel = mediaWrapper.querySelector('.image-metadata-panel');
        if (metadataPanel) {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (metadataPanel.classList.contains('visible')) {
                            controlsEl.classList.add('visible');
                        } else if (!mediaWrapper.matches(':hover')) {
                            controlsEl.classList.remove('visible');
                        }
                    }
                });
            });
            
            observer.observe(metadataPanel, { attributes: true });
        }
    });
}

/**
 * Position media controls within the actual rendered media rectangle
 * @param {HTMLElement} mediaWrapper - The wrapper containing the media and controls
 */
export function positionMediaControlsInMediaRect(mediaWrapper) {
    const mediaElement = mediaWrapper.querySelector('img, video');
    const controlsElement = mediaWrapper.querySelector('.media-controls');
    
    if (!mediaElement || !controlsElement) return;
    
    // Get wrapper dimensions
    const wrapperRect = mediaWrapper.getBoundingClientRect();
    
    // Calculate the actual rendered media rectangle
    const mediaRect = getRenderedMediaRect(
        mediaElement, 
        wrapperRect.width, 
        wrapperRect.height
    );
    
    // Calculate the position for controls - place them inside the actual media area
    const padding = 8; // Padding from the edge of the media
    
    // Position at top-right inside the actual media rectangle
    controlsElement.style.top = `${mediaRect.top + padding}px`;
    controlsElement.style.right = `${wrapperRect.width - mediaRect.right + padding}px`;
    
    // Also position any toggle blur buttons in the same way but on the left
    const toggleBlurBtn = mediaWrapper.querySelector('.toggle-blur-btn');
    if (toggleBlurBtn) {
        toggleBlurBtn.style.top = `${mediaRect.top + padding}px`;
        toggleBlurBtn.style.left = `${mediaRect.left + padding}px`;
    }
}

/**
 * Position all media controls in a container
 * @param {HTMLElement} container - Container with media wrappers
 */
export function positionAllMediaControls(container) {
    const mediaWrappers = container.querySelectorAll('.media-wrapper');
    mediaWrappers.forEach(wrapper => {
        positionMediaControlsInMediaRect(wrapper);
    });
}