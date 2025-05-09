import { showToast, openCivitai, copyToClipboard } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { showLoraModal } from './loraModal/index.js';
import { bulkManager } from '../managers/BulkManager.js';
import { NSFW_LEVELS } from '../utils/constants.js';
import { replacePreview, saveModelMetadata } from '../api/loraApi.js'
import { showDeleteModal } from '../utils/modalUtils.js';

// Set up event delegation for all card interactions
export function setupLoraCardEventDelegation() {
    const loraGrid = document.getElementById('loraGrid');
    if (!loraGrid) {
        console.warn('Lora grid not found, will try to set up event delegation later');
        // Try again when DOM might be ready
        setTimeout(setupLoraCardEventDelegation, 500);
        return;
    }
    
    // Remove existing event listener if any
    const oldListener = loraGrid._cardClickListener;
    if (oldListener) {
        loraGrid.removeEventListener('click', oldListener);
    }
    
    // Create and store the event listener
    loraGrid._cardClickListener = (e) => {
        // Find the card that was clicked
        const card = e.target.closest('.lora-card');
        if (!card) return;
        
        // Handle various click targets
        if (e.target.closest('.toggle-blur-btn') || e.target.closest('.show-content-btn')) {
            e.stopPropagation();
            toggleCardBlur(card);
        } else if (e.target.closest('.fa-star')) {
            e.stopPropagation();
            toggleFavoriteStatus(card);
        } else if (e.target.closest('.fa-globe') && card.dataset.from_civitai === 'true') {
            e.stopPropagation();
            openCivitai(card.dataset.name);
        } else if (e.target.closest('.fa-copy')) {
            e.stopPropagation();
            copyCardLoraText(card);
        } else if (e.target.closest('.fa-trash')) {
            e.stopPropagation();
            showDeleteModal(card.dataset.filepath);
        } else if (e.target.closest('.fa-image')) {
            e.stopPropagation();
            replacePreview(card.dataset.filepath);
        } else if (state.bulkMode) {
            bulkManager.toggleCardSelection(card);
        } else {
            // Main card click - show modal
            const loraMeta = getLoraDataFromCard(card);
            showLoraModal(loraMeta);
        }
    };
    
    console.log('Setting up event delegation for LoRA cards');
    // Add the event listener
    loraGrid.addEventListener('click', loraGrid._cardClickListener);
    
    // Set up hover event delegation for video autoplay if needed
    if (state.global?.settings?.autoplayOnHover) {
        // Remove any existing handlers
        if (loraGrid._mouseEnterListener) {
            loraGrid.removeEventListener('mouseenter', loraGrid._mouseEnterListener, true);
        }
        if (loraGrid._mouseLeaveListener) {
            loraGrid.removeEventListener('mouseleave', loraGrid._mouseLeaveListener, true);
        }
        
        // Create and save the handlers
        loraGrid._mouseEnterListener = (e) => {
            const cardPreview = e.target.closest('.card-preview');
            if (!cardPreview) return;
            
            const video = cardPreview.querySelector('video');
            if (video) video.play().catch(() => {});
        };
        
        loraGrid._mouseLeaveListener = (e) => {
            const cardPreview = e.target.closest('.card-preview');
            if (!cardPreview) return;
            
            const video = cardPreview.querySelector('video');
            if (video) {
                video.pause();
                video.currentTime = 0;
            }
        };
        
        // Add the listeners
        loraGrid.addEventListener('mouseenter', loraGrid._mouseEnterListener, true);
        loraGrid.addEventListener('mouseleave', loraGrid._mouseLeaveListener, true);
    }
}

// Helper function to toggle blur state
function toggleCardBlur(card) {
    const preview = card.querySelector('.card-preview');
    const isBlurred = preview.classList.toggle('blurred');
    const icon = card.querySelector('.toggle-blur-btn i');
    
    if (icon) {
        icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
    
    const overlay = card.querySelector('.nsfw-overlay');
    if (overlay) {
        overlay.style.display = isBlurred ? 'flex' : 'none';
    }
}

// Helper function to toggle favorite status
async function toggleFavoriteStatus(card) {
    const starIcon = card.querySelector('.fa-star');
    if (!starIcon) return;
    
    const isFavorite = starIcon.classList.contains('fas');
    const newFavoriteState = !isFavorite;
    
    try {
        // Save the new favorite state to the server
        await saveModelMetadata(card.dataset.filepath, { 
            favorite: newFavoriteState 
        });

        // Update the UI
        if (newFavoriteState) {
            starIcon.classList.remove('far');
            starIcon.classList.add('fas', 'favorite-active');
            starIcon.title = 'Remove from favorites';
            card.dataset.favorite = 'true';
            showToast('Added to favorites', 'success');
        } else {
            starIcon.classList.remove('fas', 'favorite-active');
            starIcon.classList.add('far');
            starIcon.title = 'Add to favorites';
            card.dataset.favorite = 'false';
            showToast('Removed from favorites', 'success');
        }
    } catch (error) {
        console.error('Failed to update favorite status:', error);
        showToast('Failed to update favorite status', 'error');
    }
}

// Helper function to copy LoRA syntax
async function copyCardLoraText(card) {
    const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
    const strength = usageTips.strength || 1;
    const loraSyntax = `<lora:${card.dataset.file_name}:${strength}>`;
    
    await copyToClipboard(loraSyntax, 'LoRA syntax copied');
}

// Helper function to extract LoRA data from card
function getLoraDataFromCard(card) {
    return {
        sha256: card.dataset.sha256,
        file_path: card.dataset.filepath,
        model_name: card.dataset.name,
        file_name: card.dataset.file_name,
        folder: card.dataset.folder,
        modified: card.dataset.modified,
        file_size: card.dataset.file_size,
        from_civitai: card.dataset.from_civitai === 'true',
        base_model: card.dataset.base_model,
        usage_tips: card.dataset.usage_tips,
        notes: card.dataset.notes,
        favorite: card.dataset.favorite === 'true',
        // Parse civitai metadata from the card's dataset
        civitai: (() => {
            try {
                return JSON.parse(card.dataset.meta || '{}');
            } catch (e) {
                console.error('Failed to parse civitai metadata:', e);
                return {}; 
            }
        })(),
        tags: JSON.parse(card.dataset.tags || '[]'),
        modelDescription: card.dataset.modelDescription || ''
    };
}

export function createLoraCard(lora) {
    const card = document.createElement('div');
    card.className = 'lora-card';
    card.dataset.sha256 = lora.sha256;
    card.dataset.filepath = lora.file_path;
    card.dataset.name = lora.model_name;
    card.dataset.file_name = lora.file_name;
    card.dataset.folder = lora.folder;
    card.dataset.modified = lora.modified;
    card.dataset.file_size = lora.file_size;
    card.dataset.from_civitai = lora.from_civitai;
    card.dataset.base_model = lora.base_model;
    card.dataset.usage_tips = lora.usage_tips;
    card.dataset.notes = lora.notes;
    card.dataset.meta = JSON.stringify(lora.civitai || {});
    card.dataset.favorite = lora.favorite ? 'true' : 'false';
    
    // Store tags and model description
    if (lora.tags && Array.isArray(lora.tags)) {
        card.dataset.tags = JSON.stringify(lora.tags);
    }
    if (lora.modelDescription) {
        card.dataset.modelDescription = lora.modelDescription;
    }

    // Store NSFW level if available
    const nsfwLevel = lora.preview_nsfw_level !== undefined ? lora.preview_nsfw_level : 0;
    card.dataset.nsfwLevel = nsfwLevel;
    
    // Determine if the preview should be blurred based on NSFW level and user settings
    const shouldBlur = state.settings.blurMatureContent && nsfwLevel > NSFW_LEVELS.PG13;
    if (shouldBlur) {
        card.classList.add('nsfw-content');
    }

    // Apply selection state if in bulk mode and this card is in the selected set
    if (state.bulkMode && state.selectedLoras.has(lora.file_path)) {
        card.classList.add('selected');
    }

    // Get the page-specific previewVersions map
    const previewVersions = state.pages.loras.previewVersions || new Map();
    const version = previewVersions.get(lora.file_path);
    const previewUrl = lora.preview_url || '/loras_static/images/no-preview.png';
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
    const autoplayOnHover = state.global.settings.autoplayOnHover || false;
    const isVideo = previewUrl.endsWith('.mp4');
    // Don't automatically play videos until visible
    const videoAttrs = autoplayOnHover ? 'controls muted loop' : 'controls muted loop';

    // Get favorite status from the lora data
    const isFavorite = lora.favorite === true;

    card.innerHTML = `
        <div class="card-preview ${shouldBlur ? 'blurred' : ''}">
            ${isVideo ? 
                `<video ${videoAttrs}>
                    <source src="${versionedPreviewUrl}" type="video/mp4">
                </video>` :
                `<img src="${versionedPreviewUrl}" alt="${lora.model_name}">
            `}
            <div class="card-header">
                ${shouldBlur ? 
                  `<button class="toggle-blur-btn" title="Toggle blur">
                      <i class="fas fa-eye"></i>
                  </button>` : ''}
                <span class="base-model-label ${shouldBlur ? 'with-toggle' : ''}" title="${lora.base_model}">
                    ${lora.base_model}
                </span>
                <div class="card-actions">
                    <i class="${isFavorite ? 'fas fa-star favorite-active' : 'far fa-star'}" 
                       title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                    </i>
                    <i class="fas fa-globe" 
                       title="${lora.from_civitai ? 'View on Civitai' : 'Not available from Civitai'}"
                       ${!lora.from_civitai ? 'style="opacity: 0.5; cursor: not-allowed"' : ''}>
                    </i>
                    <i class="fas fa-copy" 
                       title="Copy LoRA Syntax">
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
                    <span class="model-name">${lora.model_name}</span>
                </div>
                <div class="card-actions">
                    <i class="fas fa-image" 
                       title="Replace Preview Image">
                    </i>
                </div>
            </div>
        </div>
    `;
    
    // Apply bulk mode styling if currently in bulk mode
    if (state.bulkMode) {
        const actions = card.querySelectorAll('.card-actions');
        actions.forEach(actionGroup => {
            actionGroup.style.display = 'none';
        });
    }
    
    return card;
}

// Add a method to update card appearance based on bulk mode
export function updateCardsForBulkMode(isBulkMode) {
    // Update the state
    state.bulkMode = isBulkMode;
    
    document.body.classList.toggle('bulk-mode', isBulkMode);
    
    // Get all lora cards
    const loraCards = document.querySelectorAll('.lora-card');
    
    loraCards.forEach(card => {
        // Get all action containers for this card
        const actions = card.querySelectorAll('.card-actions');
        
        // Handle display property based on mode
        if (isBulkMode) {
            // Hide actions when entering bulk mode
            actions.forEach(actionGroup => {
                actionGroup.style.display = 'none';
            });
        } else {
            // Ensure actions are visible when exiting bulk mode
            actions.forEach(actionGroup => {
                // We need to reset to default display style which is flex
                actionGroup.style.display = 'flex';
            });
        }
    });
    
    // Apply selection state to cards if entering bulk mode
    if (isBulkMode) {
        bulkManager.applySelectionState();
    }
}