import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { showCheckpointModal } from './checkpointModal/index.js';
import { NSFW_LEVELS } from '../utils/constants.js';
import { replaceCheckpointPreview as apiReplaceCheckpointPreview } from '../api/checkpointApi.js';

export function createCheckpointCard(checkpoint) {
    const card = document.createElement('div');
    card.className = 'lora-card';  // Reuse the same class for styling
    card.dataset.sha256 = checkpoint.sha256;
    card.dataset.filepath = checkpoint.file_path;
    card.dataset.name = checkpoint.model_name;
    card.dataset.file_name = checkpoint.file_name;
    card.dataset.folder = checkpoint.folder;
    card.dataset.modified = checkpoint.modified;
    card.dataset.file_size = checkpoint.file_size;
    card.dataset.from_civitai = checkpoint.from_civitai;
    card.dataset.base_model = checkpoint.base_model || 'Unknown';

    // Store metadata if available
    if (checkpoint.civitai) {
        card.dataset.meta = JSON.stringify(checkpoint.civitai || {});
    }
    
    // Store tags if available
    if (checkpoint.tags && Array.isArray(checkpoint.tags)) {
        card.dataset.tags = JSON.stringify(checkpoint.tags);
    }

    if (checkpoint.modelDescription) {
        card.dataset.modelDescription = checkpoint.modelDescription;
    }

    // Store NSFW level if available
    const nsfwLevel = checkpoint.preview_nsfw_level !== undefined ? checkpoint.preview_nsfw_level : 0;
    card.dataset.nsfwLevel = nsfwLevel;
    
    // Determine if the preview should be blurred based on NSFW level and user settings
    const shouldBlur = state.settings.blurMatureContent && nsfwLevel > NSFW_LEVELS.PG13;
    if (shouldBlur) {
        card.classList.add('nsfw-content');
    }

    // Determine preview URL
    const previewUrl = checkpoint.preview_url || '/loras_static/images/no-preview.png';
    const version = state.previewVersions ? state.previewVersions.get(checkpoint.file_path) : null;
    const versionedPreviewUrl = version ? `${previewUrl}?t=${version}` : previewUrl;

    // Determine NSFW warning text based on level
    let nsfwText = "Mature Content";
    if (nsfwLevel >= NSFW_LEVELS.XXX) {
        nsfwText = "XXX-rated Content";
    } else if (nsfwLevel >= NSFW_LEVELS.X) {
        nsfwText = "X-rated Content";
    } else if (nsfwLevel >= NSFW_LEVELS.R) {
        nsfwText = "R-rated Content";
    }

    // Check if autoplayOnHover is enabled for video previews
    const autoplayOnHover = state.global?.settings?.autoplayOnHover || false;
    const isVideo = previewUrl.endsWith('.mp4');
    const videoAttrs = autoplayOnHover ? 'controls muted loop' : 'controls autoplay muted loop';

    card.innerHTML = `
        <div class="card-preview ${shouldBlur ? 'blurred' : ''}">
            ${isVideo ? 
                `<video ${videoAttrs}>
                    <source src="${versionedPreviewUrl}" type="video/mp4">
                </video>` :
                `<img src="${versionedPreviewUrl}" alt="${checkpoint.model_name}">`
            }
            <div class="card-header">
                ${shouldBlur ? 
                  `<button class="toggle-blur-btn" title="Toggle blur">
                      <i class="fas fa-eye"></i>
                  </button>` : ''}
                <span class="base-model-label ${shouldBlur ? 'with-toggle' : ''}" title="${checkpoint.base_model}">
                    ${checkpoint.base_model}
                </span>
                <div class="card-actions">
                    <i class="fas fa-globe" 
                       title="${checkpoint.from_civitai ? 'View on Civitai' : 'Not available from Civitai'}"
                       ${!checkpoint.from_civitai ? 'style="opacity: 0.5; cursor: not-allowed"' : ''}>
                    </i>
                    <i class="fas fa-copy" 
                       title="Copy Checkpoint Name">
                    </i>
                    <i class="fas fa-trash" 
                       title="Delete Model">
                    </i>
                </div>
            </div>
            ${shouldBlur ? `
                <div class="nsfw-overlay">
                    <div class="nsfw-warning">
                        <p>${nsfwText}</p>
                        <button class="show-content-btn">Show</button>
                    </div>
                </div>
            ` : ''}
            <div class="card-footer">
                <div class="model-info">
                    <span class="model-name">${checkpoint.model_name}</span>
                </div>
                <div class="card-actions">
                    <i class="fas fa-image" 
                       title="Replace Preview Image">
                    </i>
                </div>
            </div>
        </div>
    `;

    // Main card click event
    card.addEventListener('click', () => {
        // Show checkpoint details modal
        const checkpointMeta = {
            sha256: card.dataset.sha256,
            file_path: card.dataset.filepath,
            model_name: card.dataset.name,
            file_name: card.dataset.file_name,
            folder: card.dataset.folder,
            modified: card.dataset.modified,
            file_size: parseInt(card.dataset.file_size || '0'),
            from_civitai: card.dataset.from_civitai === 'true',
            base_model: card.dataset.base_model,
            preview_url: versionedPreviewUrl,
            // Parse civitai metadata from the card's dataset
            civitai: (() => {
                try {
                    return JSON.parse(card.dataset.meta || '{}');
                } catch (e) {
                    console.error('Failed to parse civitai metadata:', e);
                    return {}; // Return empty object on error
                }
            })(),
            tags: (() => {
                try {
                    return JSON.parse(card.dataset.tags || '[]');
                } catch (e) {
                    console.error('Failed to parse tags:', e);
                    return []; // Return empty array on error
                }
            })(),
            modelDescription: card.dataset.modelDescription || ''
        };
        showCheckpointModal(checkpointMeta);
    });

    // Toggle blur button functionality
    const toggleBlurBtn = card.querySelector('.toggle-blur-btn');
    if (toggleBlurBtn) {
        toggleBlurBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const preview = card.querySelector('.card-preview');
            const isBlurred = preview.classList.toggle('blurred');
            const icon = toggleBlurBtn.querySelector('i');
            
            // Update the icon based on blur state
            if (isBlurred) {
                icon.className = 'fas fa-eye';
            } else {
                icon.className = 'fas fa-eye-slash';
            }
            
            // Toggle the overlay visibility
            const overlay = card.querySelector('.nsfw-overlay');
            if (overlay) {
                overlay.style.display = isBlurred ? 'flex' : 'none';
            }
        });
    }

    // Show content button functionality
    const showContentBtn = card.querySelector('.show-content-btn');
    if (showContentBtn) {
        showContentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const preview = card.querySelector('.card-preview');
            preview.classList.remove('blurred');
            
            // Update the toggle button icon
            const toggleBtn = card.querySelector('.toggle-blur-btn');
            if (toggleBtn) {
                toggleBtn.querySelector('i').className = 'fas fa-eye-slash';
            }
            
            // Hide the overlay
            const overlay = card.querySelector('.nsfw-overlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        });
    }

    // Copy button click event
    card.querySelector('.fa-copy')?.addEventListener('click', async e => {
        e.stopPropagation();
        const checkpointName = card.dataset.file_name;
        
        try {
            // Modern clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(checkpointName);
            } else {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = checkpointName;
                textarea.style.position = 'absolute';
                textarea.style.left = '-99999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            showToast('Checkpoint name copied', 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Copy failed', 'error');
        }
    });

    // Civitai button click event
    if (checkpoint.from_civitai) {
        card.querySelector('.fa-globe')?.addEventListener('click', e => {
            e.stopPropagation();
            openCivitai(checkpoint.model_name);
        });
    }

    // Delete button click event
    card.querySelector('.fa-trash')?.addEventListener('click', e => {
        e.stopPropagation();
        deleteCheckpoint(checkpoint.file_path);
    });

    // Replace preview button click event
    card.querySelector('.fa-image')?.addEventListener('click', e => {
        e.stopPropagation();
        replaceCheckpointPreview(checkpoint.file_path);
    });

    // Add autoplayOnHover handlers for video elements if needed
    const videoElement = card.querySelector('video');
    if (videoElement && autoplayOnHover) {
        const cardPreview = card.querySelector('.card-preview');
        
        // Remove autoplay attribute and pause initially
        videoElement.removeAttribute('autoplay');
        videoElement.pause();
        
        // Add mouse events to trigger play/pause
        cardPreview.addEventListener('mouseenter', () => {
            videoElement.play();
        });
        
        cardPreview.addEventListener('mouseleave', () => {
            videoElement.pause();
            videoElement.currentTime = 0;
        });
    }

    return card;
}

// These functions will be implemented in checkpointApi.js
function openCivitai(modelName) {
    // Check if the global function exists (registered by PageControls)
    if (window.openCivitai) {
        window.openCivitai(modelName);
    } else {
        // Fallback implementation
        const card = document.querySelector(`.lora-card[data-name="${modelName}"]`);
        if (!card) return;
        
        const metaData = JSON.parse(card.dataset.meta || '{}');
        const civitaiId = metaData.modelId;
        const versionId = metaData.id;
        
        // Build URL
        if (civitaiId) {
            let url = `https://civitai.com/models/${civitaiId}`;
            if (versionId) {
                url += `?modelVersionId=${versionId}`;
            }
            window.open(url, '_blank');
        } else {
            // If no ID, try searching by name
            window.open(`https://civitai.com/models?query=${encodeURIComponent(modelName)}`, '_blank');
        }
    }
}

function deleteCheckpoint(filePath) {
    if (window.deleteCheckpoint) {
        window.deleteCheckpoint(filePath);
    } else {
        // Use the modal delete functionality
        import('../utils/modalUtils.js').then(({ showDeleteModal }) => {
            showDeleteModal(filePath, 'checkpoint');
        });
    }
}

function replaceCheckpointPreview(filePath) {
    if (window.replaceCheckpointPreview) {
        window.replaceCheckpointPreview(filePath);
    } else {
        apiReplaceCheckpointPreview(filePath);
    }
}