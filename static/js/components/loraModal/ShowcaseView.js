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
                    // Find matching file in our list of actual files
                    let localFile = null;
                    if (exampleFiles.length > 0) {
                        // Try to find the corresponding file by index first
                        localFile = exampleFiles.find(file => {
                            const match = file.name.match(/image_(\d+)\./);
                            return match && parseInt(match[1]) === index;
                        });
                        
                        // If not found by index, just use the same position in the array if available
                        if (!localFile && index < exampleFiles.length) {
                            localFile = exampleFiles[index];
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
        </div>
    `;
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
