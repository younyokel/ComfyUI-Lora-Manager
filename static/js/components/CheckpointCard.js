import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { CheckpointModal } from './CheckpointModal.js';

// Create an instance of the modal
const checkpointModal = new CheckpointModal();

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

    // Determine preview URL
    const previewUrl = checkpoint.preview_url || '/loras_static/images/no-preview.png';
    const version = state.previewVersions ? state.previewVersions.get(checkpoint.file_path) : null;
    const versionedPreviewUrl = version ? `${previewUrl}?t=${version}` : previewUrl;

    card.innerHTML = `
        <div class="card-preview">
            <img src="${versionedPreviewUrl}" alt="${checkpoint.model_name}">
            <div class="card-header">
                <span class="base-model-label" title="${checkpoint.base_model || 'Unknown'}">
                    ${checkpoint.base_model || 'Unknown'}
                </span>
                <div class="card-actions">
                    <i class="fas fa-globe" 
                       title="${checkpoint.from_civitai ? 'View on Civitai' : 'Not available from Civitai'}"
                       ${!checkpoint.from_civitai ? 'style="opacity: 0.5; cursor: not-allowed"' : ''}>
                    </i>
                    <i class="fas fa-trash" 
                       title="Delete Model">
                    </i>
                </div>
            </div>
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
            })()
        };
        checkpointModal.showCheckpointDetails(checkpointMeta);
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

    return card;
}

// These functions will be implemented in checkpointApi.js
function openCivitai(modelName) {
    if (window.openCivitai) {
        window.openCivitai(modelName);
    } else {
        console.log('Opening Civitai for:', modelName);
    }
}

function deleteCheckpoint(filePath) {
    if (window.deleteCheckpoint) {
        window.deleteCheckpoint(filePath);
    } else {
        console.log('Delete checkpoint:', filePath);
    }
}

function replaceCheckpointPreview(filePath) {
    if (window.replaceCheckpointPreview) {
        window.replaceCheckpointPreview(filePath);
    } else {
        console.log('Replace checkpoint preview:', filePath);
    }
}