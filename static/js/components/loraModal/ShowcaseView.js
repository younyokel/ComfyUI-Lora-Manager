/**
 * ShowcaseView.js
 * 处理LoRA模型展示内容（图片、视频）的功能模块
 */
import { 
    toggleShowcase,
    setupShowcaseScroll,
    scrollToTop 
} from '../../utils/uiHelpers.js';
import { state } from '../../state/index.js';
import { NSFW_LEVELS } from '../../utils/constants.js';

/**
 * 获取展示内容并进行渲染
 * @param {Array} images - 要展示的图片/视频数组
 * @param {Array} exampleFiles - Local example files already fetched
 * @returns {Promise<string>} HTML内容
 */
export function renderShowcaseContent(images, exampleFiles = []) {
    if (!images?.length) {
        // Replace empty message with import interface
        return renderImportInterface(true);
    }
    
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
                    // Find matching file in our list of actual files
                    let localFile = null;
                    if (exampleFiles.length > 0) {
                        if (img.id) {
                            // This is a custom image, find by custom_<id>
                            const customPrefix = `custom_${img.id}`;
                            localFile = exampleFiles.find(file => file.name.startsWith(customPrefix));
                        } else {
                            // This is a regular image from civitai, find by index
                            localFile = exampleFiles.find(file => {
                                const match = file.name.match(/image_(\d+)\./);
                                return match && parseInt(match[1]) === index;
                            });
                            
                            // If not found by index, just use the same position in the array if available
                            if (!localFile && index < exampleFiles.length) {
                                localFile = exampleFiles[index];
                            }
                        }
                    }
                    
                    const remoteUrl = img.url || '';
                    const localUrl = localFile ? localFile.path : '';
                    const isVideo = localFile ? localFile.is_video : 
                                    remoteUrl.endsWith('.mp4') || remoteUrl.endsWith('.webm');
                    
                    // 计算适当的展示高度
                    const aspectRatio = (img.height / img.width) * 100;
                    const containerWidth = 800; 
                    const minHeightPercent = 40; 
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
                    
                    const hasParams = seed || model || steps || sampler || cfgScale || clipSkip;
                    const hasPrompts = prompt || negativePrompt;
                    
                    const metadataPanel = generateMetadataPanel(
                        hasParams, hasPrompts, 
                        prompt, negativePrompt, 
                        size, seed, model, steps, sampler, cfgScale, clipSkip
                    );
                    
                    if (isVideo) {
                        return generateVideoWrapper(
                            img, heightPercent, shouldBlur, nsfwText, metadataPanel, 
                            localUrl, remoteUrl
                        );
                    }
                    return generateImageWrapper(
                        img, heightPercent, shouldBlur, nsfwText, metadataPanel, 
                        localUrl, remoteUrl
                    );
                }).join('')}
            </div>
            
            <!-- Add import interface at the bottom of existing examples -->
            ${renderImportInterface(false)}
        </div>
    `;
}

/**
 * Render the import interface for example images
 * @param {boolean} isEmpty - Whether there are no existing examples
 * @returns {string} HTML content for import interface
 */
function renderImportInterface(isEmpty) {
    return `
        <div class="example-import-area ${isEmpty ? 'empty' : ''}">
            <div class="import-container" id="exampleImportContainer">
                <div class="import-placeholder">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <h3>${isEmpty ? 'No example images available' : 'Add more examples'}</h3>
                    <p>Drag & drop images or videos here</p>
                    <p class="sub-text">or</p>
                    <button class="select-files-btn" id="selectExampleFilesBtn">
                        <i class="fas fa-folder-open"></i> Select Files
                    </button>
                    <p class="import-formats">Supported formats: jpg, png, gif, webp, mp4, webm</p>
                </div>
                <input type="file" id="exampleFilesInput" multiple accept="image/*,video/mp4,video/webm" style="display: none;">
                <div class="import-progress-container" style="display: none;">
                    <div class="import-progress">
                        <div class="progress-bar"></div>
                    </div>
                    <span class="progress-text">Importing files...</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize the import functionality for example images
 * @param {string} modelHash - The SHA256 hash of the model
 * @param {Element} container - The container element for the import area
 */
export function initExampleImport(modelHash, container) {
    if (!container) return;
    
    const importContainer = container.querySelector('#exampleImportContainer');
    const fileInput = container.querySelector('#exampleFilesInput');
    const selectFilesBtn = container.querySelector('#selectExampleFilesBtn');
    
    // Set up file selection button
    if (selectFilesBtn) {
        selectFilesBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }
    
    // Handle file selection
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleImportFiles(Array.from(e.target.files), modelHash, importContainer);
            }
        });
    }
    
    // Set up drag and drop
    if (importContainer) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            importContainer.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Highlight drop area on drag over
        ['dragenter', 'dragover'].forEach(eventName => {
            importContainer.addEventListener(eventName, () => {
                importContainer.classList.add('highlight');
            }, false);
        });
        
        // Remove highlight on drag leave
        ['dragleave', 'drop'].forEach(eventName => {
            importContainer.addEventListener(eventName, () => {
                importContainer.classList.remove('highlight');
            }, false);
        });
        
        // Handle dropped files
        importContainer.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            handleImportFiles(files, modelHash, importContainer);
        }, false);
    }
}

/**
 * Handle the file import process
 * @param {File[]} files - Array of files to import
 * @param {string} modelHash - The SHA256 hash of the model
 * @param {Element} importContainer - The container element for import UI
 */
async function handleImportFiles(files, modelHash, importContainer) {
    // Filter for supported file types
    const supportedImages = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const supportedVideos = ['.mp4', '.webm'];
    const supportedExtensions = [...supportedImages, ...supportedVideos];
    
    const validFiles = files.filter(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return supportedExtensions.includes(ext);
    });
    
    if (validFiles.length === 0) {
        alert('No supported files selected. Please select image or video files.');
        return;
    }
    
    try {
        // Get file paths to send to backend
        const filePaths = validFiles.map(file => {
            // We need the full path, but we only have the filename
            // For security reasons, browsers don't provide full paths
            // This will only work if the backend can handle just filenames
            return URL.createObjectURL(file);
        });
        
        // Use FileReader to get the file data for direct upload
        const formData = new FormData();
        formData.append('model_hash', modelHash);
        
        validFiles.forEach(file => {
            formData.append('files', file);
        });
        
        // Call API to import files
        const response = await fetch('/api/import-example-images', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to import example files');
        }
        
        // Get updated local files
        const updatedFilesResponse = await fetch(`/api/example-image-files?model_hash=${modelHash}`);
        const updatedFilesResult = await updatedFilesResponse.json();
        
        if (!updatedFilesResult.success) {
            throw new Error(updatedFilesResult.error || 'Failed to get updated file list');
        }
        
        // Re-render the showcase content
        const showcaseTab = document.getElementById('showcase-tab');
        if (showcaseTab) {
            // Get the updated images from the result
            const regularImages = result.regular_images || [];
            const customImages = result.custom_images || [];
            // Combine both arrays for rendering
            const allImages = [...regularImages, ...customImages];
            showcaseTab.innerHTML = renderShowcaseContent(allImages, updatedFilesResult.files);
            
            // Re-initialize showcase functionality
            const carousel = showcaseTab.querySelector('.carousel');
            if (carousel) {
                if (!carousel.classList.contains('collapsed')) {
                    initLazyLoading(carousel);
                    initNsfwBlurHandlers(carousel);
                    initMetadataPanelHandlers(carousel);
                }
                // Initialize the import UI for the new content
                initExampleImport(modelHash, showcaseTab);
            }
            
            // Update VirtualScroller if available
            if (state.virtualScroller && result.model_file_path) {
                // Create an update object with only the necessary properties
                const updateData = {
                    civitai: {
                        images: regularImages,
                        customImages: customImages
                    }
                };
                
                // Update the item in the virtual scroller
                state.virtualScroller.updateSingleItem(result.model_file_path, updateData);
                console.log('Updated VirtualScroller item with new example images');
            }
        }
    } catch (error) {
        console.error('Error importing examples:', error);
    }
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

// Use the shared setupShowcaseScroll function with the correct modal ID
export { setupShowcaseScroll, scrollToTop, toggleShowcase };

// Initialize the showcase scroll when this module is imported
document.addEventListener('DOMContentLoaded', () => {
    setupShowcaseScroll('loraModal');
});
