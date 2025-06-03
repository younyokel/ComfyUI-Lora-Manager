/**
 * ShowcaseView.js
 * Handles showcase content (images, videos) display for checkpoint modal
 */
import { 
    showToast, 
    copyToClipboard, 
    getLocalExampleImageUrl,
    initLazyLoading,
    initNsfwBlurHandlers,
    initMetadataPanelHandlers,
    toggleShowcase,
    setupShowcaseScroll,
    scrollToTop 
} from '../../utils/uiHelpers.js';
import { state } from '../../state/index.js';
import { NSFW_LEVELS } from '../../utils/constants.js';

/**
 * Render showcase content
 * @param {Array} images - Array of images/videos to show
 * @param {string} modelHash - Model hash for identifying local files
 * @returns {string} HTML content
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
                    // Get URLs for the example image
                    const urls = getLocalExampleImageUrl(img, index, modelHash);
                    return generateMediaWrapper(img, urls);
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * Generate media wrapper HTML for an image or video
 * @param {Object} media - Media object with image or video data
 * @returns {string} HTML content
 */
function generateMediaWrapper(media, urls) {
    // Calculate appropriate aspect ratio
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
        return generateVideoWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel, urls);
    }
    
    return generateImageWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel, urls);
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
function generateVideoWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel, urls) {
    return `
        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
            ${shouldBlur ? `
                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            <video controls autoplay muted loop crossorigin="anonymous" 
                referrerpolicy="no-referrer" 
                data-local-src="${urls.primary || ''}"
                data-remote-src="${media.url}"
                class="lazy ${shouldBlur ? 'blurred' : ''}">
                <source data-local-src="${urls.primary || ''}" data-remote-src="${media.url}" type="video/mp4">
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
function generateImageWrapper(media, heightPercent, shouldBlur, nsfwText, metadataPanel, urls) {
    return `
        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
            ${shouldBlur ? `
                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            <img data-local-src="${urls.primary || ''}" 
                data-local-fallback-src="${urls.fallback || ''}"
                data-remote-src="${media.url}"
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

// Use the shared setupShowcaseScroll function with the correct modal ID
export { setupShowcaseScroll, scrollToTop, toggleShowcase };

// Initialize the showcase scroll when this module is imported
document.addEventListener('DOMContentLoaded', () => {
    setupShowcaseScroll('checkpointModal');
});
