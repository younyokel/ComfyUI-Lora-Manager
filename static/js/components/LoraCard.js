import { showToast, openCivitai, copyToClipboard } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { showLoraModal } from './loraModal/index.js';
import { bulkManager } from '../managers/BulkManager.js';
import { NSFW_LEVELS } from '../utils/constants.js';
import { replacePreview, saveModelMetadata } from '../api/loraApi.js'
import { showDeleteModal } from '../utils/modalUtils.js';

// Global event delegation setup function
export function setupLoraCardEventDelegation() {
    const loraGrid = document.getElementById('loraGrid');
    if (!loraGrid) return;
    
    // Remove any existing listeners (in case this runs multiple times)
    if (loraGrid._hasEventDelegation) return;
    
    // Handle clicks on any element within the grid
    loraGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.lora-card');
        if (!card) return;
        
        // Handle different elements within the card
        if (e.target.closest('.fa-star')) {
            handleFavoriteClick(e, card);
        } else if (e.target.closest('.fa-globe')) {
            handleCivitaiClick(e, card);
        } else if (e.target.closest('.fa-copy')) {
            handleCopyClick(e, card);
        } else if (e.target.closest('.fa-trash')) {
            handleDeleteClick(e, card);
        } else if (e.target.closest('.fa-image')) {
            handleReplacePreviewClick(e, card);
        } else if (e.target.closest('.toggle-blur-btn')) {
            handleToggleBlurClick(e, card);
        } else if (e.target.closest('.show-content-btn')) {
            handleShowContentClick(e, card);
        } else if (state.bulkMode) {
            // Handle bulk selection mode
            bulkManager.toggleCardSelection(card);
        } else {
            // Default card click - show modal
            handleCardClick(card);
        }
    });
    
    // Handle video autoplay on hover if enabled
    if (state.global?.settings?.autoplayOnHover) {
        loraGrid.addEventListener('mouseenter', (e) => {
            const card = e.target.closest('.lora-card');
            if (!card) return;
            
            const video = card.querySelector('video');
            if (video) video.play();
        }, true);
        
        loraGrid.addEventListener('mouseleave', (e) => {
            const card = e.target.closest('.lora-card');
            if (!card) return;
            
            const video = card.querySelector('video');
            if (video) {
                video.pause();
                video.currentTime = 0;
            }
        }, true);
    }
    
    loraGrid._hasEventDelegation = true;
}

// Helper functions for card interaction handling
function handleCardClick(card) {
    try {
        const loraMeta = {
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
            civitai: JSON.parse(card.dataset.meta || '{}'),
            tags: JSON.parse(card.dataset.tags || '[]'),
            modelDescription: card.dataset.modelDescription || ''
        };
        showLoraModal(loraMeta);
    } catch (e) {
        console.error('Error showing lora modal:', e);
    }
}

function handleFavoriteClick(e, card) {
    e.stopPropagation();
    const starIcon = e.target.closest('.fa-star');
    const isFavorite = starIcon.classList.contains('fas');
    const newFavoriteState = !isFavorite;
    
    saveModelMetadata(card.dataset.filepath, { 
        favorite: newFavoriteState 
    }).then(() => {
        // Update UI based on new state
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
    }).catch(error => {
        console.error('Failed to update favorite status:', error);
        showToast('Failed to update favorite status', 'error');
    });
}

function handleCivitaiClick(e, card) {
    e.stopPropagation();
    if (card.dataset.from_civitai === 'true') {
        openCivitai(card.dataset.name);
    }
}

function handleCopyClick(e, card) {
    e.stopPropagation();
    const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
    const strength = usageTips.strength || 1;
    const loraSyntax = `<lora:${card.dataset.file_name}:${strength}>`;
    
    copyToClipboard(loraSyntax, 'LoRA syntax copied');
}

function handleDeleteClick(e, card) {
    e.stopPropagation();
    showDeleteModal(card.dataset.filepath);
}

function handleReplacePreviewClick(e, card) {
    e.stopPropagation();
    replacePreview(card.dataset.filepath);
}

function handleToggleBlurClick(e, card) {
    e.stopPropagation();
    toggleBlur(card);
}

function handleShowContentClick(e, card) {
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
}

// Helper function to toggle blur
function toggleBlur(card) {
    const preview = card.querySelector('.card-preview');
    const isBlurred = preview.classList.toggle('blurred');
    const icon = card.querySelector('.toggle-blur-btn i');
    
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
    const shouldBlur = state.settings?.blurMatureContent && nsfwLevel > NSFW_LEVELS.PG13;
    if (shouldBlur) {
        card.classList.add('nsfw-content');
    }

    // Apply selection state if in bulk mode
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

    // Check if autoplayOnHover is enabled
    const autoplayOnHover = state.global?.settings?.autoplayOnHover || false;
    const isVideo = previewUrl.endsWith('.mp4');
    const videoAttrs = autoplayOnHover ? 'controls muted loop' : 'controls autoplay muted loop';

    // Get favorite status
    const isFavorite = lora.favorite === true;

    card.innerHTML = `
        <div class="card-preview ${shouldBlur ? 'blurred' : ''}">
            ${isVideo ? 
                `<video ${videoAttrs}>
                    <source src="${versionedPreviewUrl}" type="video/mp4">
                </video>` :
                `<img data-src="${versionedPreviewUrl}" alt="${lora.model_name}">`
            }
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

    // Apply bulk mode styling if needed
    if (state.bulkMode) {
        const actions = card.querySelectorAll('.card-actions');
        actions.forEach(actionGroup => {
            actionGroup.style.display = 'none';
        });
    }
    
    return card;
}

// Update cards for bulk mode (keep this existing function)
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