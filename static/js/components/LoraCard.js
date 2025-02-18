import { showToast } from '../utils/uiHelpers.js';
import { modalManager } from '../managers/ModalManager.js';
import { state } from '../state/index.js';

export function createLoraCard(lora) {
    const card = document.createElement('div');
    card.className = 'lora-card';
    card.dataset.sha256 = lora.sha256;
    card.dataset.filepath = lora.file_path;
    card.dataset.name = lora.model_name;
    card.dataset.file_name = lora.file_name;
    card.dataset.folder = lora.folder;
    card.dataset.modified = lora.modified;
    card.dataset.from_civitai = lora.from_civitai;
    card.dataset.meta = JSON.stringify(lora.civitai || {});

    const version = state.previewVersions.get(lora.file_path);
    const previewUrl = lora.preview_url || '/loras_static/images/no-preview.png';
    const versionedPreviewUrl = version ? `${previewUrl}?t=${version}` : previewUrl;

    card.innerHTML = `
        <div class="card-preview">
            ${previewUrl.endsWith('.mp4') ? 
                `<video controls autoplay muted loop>
                    <source src="${versionedPreviewUrl}" type="video/mp4">
                </video>` :
                `<img src="${versionedPreviewUrl}" alt="${lora.model_name}">`
            }
            <div class="card-header">
                <span class="base-model-label" title="${lora.base_model}">
                    ${lora.base_model}
                </span>
                <div class="card-actions">
                    <i class="fas fa-globe" 
                       title="${lora.from_civitai ? 'View on Civitai' : 'Not available from Civitai'}"
                       ${!lora.from_civitai ? 'style="opacity: 0.5; cursor: not-allowed"' : ''}>
                    </i>
                    <i class="fas fa-copy" 
                       title="Copy Model Name">
                    </i>
                    <i class="fas fa-trash" 
                       title="Delete Model">
                    </i>
                </div>
            </div>
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

    // Main card click event
    card.addEventListener('click', () => {
        const meta = JSON.parse(card.dataset.meta || '{}');
        if (Object.keys(meta).length) {
            showLoraModal(meta);
        } else {
            showToast(
                card.dataset.from_civitai === 'true' ?
                'Click "Fetch" to retrieve metadata' :
                'No CivitAI information available',
                'info'
            );
        }
    });

    // Copy button click event
    card.querySelector('.fa-copy')?.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(card.dataset.file_name)
            .then(() => showToast('Model name copied', 'success'))
            .catch(() => showToast('Copy failed', 'error'));
    });

    // Civitai button click event
    if (lora.from_civitai) {
        card.querySelector('.fa-globe')?.addEventListener('click', e => {
            e.stopPropagation();
            openCivitai(lora.model_name);
        });
    }

    // Delete button click event
    card.querySelector('.fa-trash')?.addEventListener('click', e => {
        e.stopPropagation();
        deleteModel(lora.file_path);
    });

    // Replace preview button click event
    card.querySelector('.fa-image')?.addEventListener('click', e => {
        e.stopPropagation();
        replacePreview(lora.file_path);
    });

    return card;
}

export function showLoraModal(lora) {
    const escapedWords = lora.trainedWords?.length ? 
        lora.trainedWords.map(word => word.replace(/'/g, '\\\'')) : [];

    const content = `
        <div class="modal-content">
            <header class="modal-header">
                <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
                <h2>${lora.model.name}</h2>
                <div class="modal-actions">
                    ${lora.from_civitai ? 
                        `<button class="fetch-btn" title="Refresh metadata from Civitai">
                            <i class="fas fa-sync-alt"></i>
                        </button>` : 
                        `<button class="fetch-btn" title="Fetch from Civitai">
                            <i class="fas fa-cloud-download-alt"></i>
                        </button>`
                    }
                </div>
            </header>

            <div class="modal-body">
                <div class="info-section">
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Version</label>
                            <span>${lora.name || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>File Name</label>
                            <span>${lora.file_name || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>Location</label>
                            <span class="file-path">${lora.file_path || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>Base Model</label>
                            <span>${lora.base_model || 'N/A'}</span>
                        </div>
                        <div class="info-item usage-tips">
                            <label>Usage Tips</label>
                            <div class="editable-field">
                                <div class="usage-tips-content" contenteditable="true" spellcheck="false">${lora.usage_tips || 'Strength: 0.8'}</div>
                                <button class="save-btn" onclick="saveUsageTips('${lora.file_path}')">
                                    <i class="fas fa-save"></i>
                                </button>
                            </div>
                        </div>
                        <div class="info-item notes">
                            <label>Additional Notes</label>
                            <div class="editable-field">
                                <div class="notes-content" contenteditable="true" spellcheck="false">${lora.notes || 'Add your notes here...'}</div>
                                <button class="save-btn" onclick="saveNotes('${lora.file_path}')">
                                    <i class="fas fa-save"></i>
                                </button>
                            </div>
                        </div>
                        ${renderTriggerWords(escapedWords)}
                        <div class="info-item full-width">
                            <label>About this version</label>
                            <div class="description-text">${lora.description || 'N/A'}</div>
                        </div>
                    </div>

                </div>

                <div class="showcase-section">
                    <div class="scroll-indicator">
                        <i class="fas fa-chevron-down"></i>
                        Scroll for more examples
                    </div>
                    <div class="carousel">
                        ${renderShowcaseImages(lora.images)}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modalManager.showModal('loraModal', content);
    setupEditableFields();
}

function setupEditableFields() {
    const editableFields = document.querySelectorAll('.editable-field [contenteditable]');
    
    editableFields.forEach(field => {
        field.addEventListener('focus', function() {
            if (this.textContent === 'Add your notes here...' || 
                this.textContent === 'Strength: 0.8') {
                this.textContent = '';
            }
        });

        field.addEventListener('blur', function() {
            if (this.textContent.trim() === '') {
                this.textContent = this.classList.contains('usage-tips-content') 
                    ? 'Strength: 0.8' 
                    : 'Add your notes here...';
            }
        });
    });
}

// Add these functions to handle saving the editable fields
window.saveUsageTips = async function(filePath) {
    const content = document.querySelector('.usage-tips-content').textContent;
    try {
        await saveModelMetadata(filePath, { usage_tips: content });
        showToast('Usage tips saved successfully', 'success');
    } catch (error) {
        showToast('Failed to save usage tips', 'error');
    }
};

window.saveNotes = async function(filePath) {
    const content = document.querySelector('.notes-content').textContent;
    try {
        await saveModelMetadata(filePath, { notes: content });
        showToast('Notes saved successfully', 'success');
    } catch (error) {
        showToast('Failed to save notes', 'error');
    }
};

async function saveModelMetadata(filePath, data) {
    const response = await fetch('/loras/api/save-metadata', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            file_path: filePath,
            ...data
        })
    });

    if (!response.ok) {
        throw new Error('Failed to save metadata');
    }
}

function renderTriggerWords(words) {
    if (!words.length) return '';
    
    return `
        <div class="info-item full-width trigger-words">
            <label>Trigger Words</label>
            <div class="trigger-words-tags">
                ${words.map(word => `
                    <div class="trigger-word-tag" onclick="copyTriggerWord('${word}')">
                        <span class="trigger-word-content">${word}</span>
                        <span class="trigger-word-copy">
                            <i class="fas fa-copy"></i>
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderShowcaseImages(images) {
    if (!images?.length) return '';
    
    return images.map(img => {
        if (img.type === 'video') {
            return `
                <video controls autoplay muted loop crossorigin="anonymous" referrerpolicy="no-referrer">
                    <source src="${img.url}" type="video/mp4">
                    Your browser does not support video playback
                </video>
            `;
        }
        return `
            <img src="${img.url}" 
                 alt="Preview" 
                 crossorigin="anonymous" 
                 referrerpolicy="no-referrer" 
                 loading="lazy">
        `;
    }).join('');
}