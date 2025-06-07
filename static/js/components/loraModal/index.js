/**
 * LoraModal - 主入口点
 * 
 * 将原始的LoraModal.js拆分成多个功能模块后的主入口文件
 */
import { showToast, copyToClipboard, getExampleImageFiles } from '../../utils/uiHelpers.js';
import { modalManager } from '../../managers/ModalManager.js';
import { renderShowcaseContent, toggleShowcase, setupShowcaseScroll, scrollToTop } from './ShowcaseView.js';
import { setupTabSwitching, loadModelDescription } from './ModelDescription.js';
import { renderTriggerWords, setupTriggerWordsEditMode } from './TriggerWords.js';
import { parsePresets, renderPresetTags } from './PresetTags.js';
import { loadRecipesForLora } from './RecipeTab.js'; // Add import for recipe tab
import { 
    setupModelNameEditing, 
    setupBaseModelEditing, 
    setupFileNameEditing
} from './ModelMetadata.js';
import { saveModelMetadata } from '../../api/loraApi.js';
import { renderCompactTags, setupTagTooltip, formatFileSize } from './utils.js';
import { updateLoraCard } from '../../utils/cardUpdater.js';

/**
 * 显示LoRA模型弹窗
 * @param {Object} lora - LoRA模型数据
 */
export function showLoraModal(lora) {
    const escapedWords = lora.civitai?.trainedWords?.length ? 
        lora.civitai.trainedWords.map(word => word.replace(/'/g, '\\\'')) : [];

    const content = `
        <div class="modal-content">
            <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
            <header class="modal-header">
                <div class="model-name-header">
                    <h2 class="model-name-content">${lora.model_name}</h2>
                    <button class="edit-model-name-btn" title="Edit model name">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
                
                ${lora.civitai?.creator ? `
                <div class="creator-info">
                    ${lora.civitai.creator.image ? 
                      `<div class="creator-avatar">
                         <img src="${lora.civitai.creator.image}" alt="${lora.civitai.creator.username}" onerror="this.onerror=null; this.src='static/icons/user-placeholder.png';">
                       </div>` : 
                      `<div class="creator-avatar creator-placeholder">
                         <i class="fas fa-user"></i>
                       </div>`
                    }
                    <span class="creator-username">${lora.civitai.creator.username}</span>
                </div>` : ''}
                
                ${renderCompactTags(lora.tags || [])}
            </header>

            <div class="modal-body">
                <div class="info-section">
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Version</label>
                            <span>${lora.civitai.name || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>File Name</label>
                            <div class="file-name-wrapper">
                                <span id="file-name" class="file-name-content">${lora.file_name || 'N/A'}</span>
                                <button class="edit-file-name-btn" title="Edit file name">
                                    <i class="fas fa-pencil-alt"></i>
                                </button>
                            </div>
                        </div>
                        <div class="info-item location-size">
                            <div class="location-wrapper">
                                <label>Location</label>
                                <span class="file-path">${lora.file_path.replace(/[^/]+$/, '') || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="info-item base-size">
                            <div class="base-wrapper">
                                <label>Base Model</label>
                                <div class="base-model-display">
                                    <span class="base-model-content">${lora.base_model || 'N/A'}</span>
                                    <button class="edit-base-model-btn" title="Edit base model">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="size-wrapper">
                                <label>Size</label>
                                <span>${formatFileSize(lora.file_size)}</span>
                            </div>
                        </div>
                        <div class="info-item usage-tips">
                            <label>Usage Tips</label>
                            <div class="editable-field">
                                <div class="preset-controls">
                                    <select id="preset-selector">
                                        <option value="">Add preset parameter...</option>
                                        <option value="strength_min">Strength Min</option>
                                        <option value="strength_max">Strength Max</option>
                                        <option value="strength">Strength</option>
                                        <option value="clip_skip">Clip Skip</option>
                                    </select>
                                    <input type="number" id="preset-value" step="0.01" placeholder="Value" style="display:none;">
                                    <button class="add-preset-btn">Add</button>
                                </div>
                                <div class="preset-tags">
                                    ${renderPresetTags(parsePresets(lora.usage_tips))}
                                </div>
                            </div>
                        </div>
                        ${renderTriggerWords(escapedWords, lora.file_path)}
                        <div class="info-item notes">
                            <label>Additional Notes</label>
                            <div class="editable-field">
                                <div class="notes-content" contenteditable="true" spellcheck="false">${lora.notes || 'Add your notes here...'}</div>
                                <button class="save-btn" onclick="saveNotes('${lora.file_path}')">
                                    <i class="fas fa-save"></i>
                                </button>
                            </div>
                        </div>
                        <div class="info-item full-width">
                            <label>About this version</label>
                            <div class="description-text">${lora.civitai?.description || 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <div class="showcase-section" data-lora-id="${lora.civitai?.modelId || ''}">
                    <div class="showcase-tabs">
                        <button class="tab-btn active" data-tab="showcase">Examples</button>
                        <button class="tab-btn" data-tab="description">Model Description</button>
                        <button class="tab-btn" data-tab="recipes">Recipes</button>
                    </div>
                    
                    <div class="tab-content">
                        <div id="showcase-tab" class="tab-pane active">
                            <div class="example-images-loading">
                                <i class="fas fa-spinner fa-spin"></i> Loading example images...
                            </div>
                        </div>
                        
                        <div id="description-tab" class="tab-pane">
                            <div class="model-description-container">
                                <div class="model-description-loading">
                                    <i class="fas fa-spinner fa-spin"></i> Loading model description...
                                </div>
                                <div class="model-description-content">
                                    ${lora.modelDescription || ''}
                                </div>
                            </div>
                        </div>
                        
                        <div id="recipes-tab" class="tab-pane">
                            <div class="recipes-loading">
                                <i class="fas fa-spinner fa-spin"></i> Loading recipes...
                            </div>
                        </div>
                    </div>
                    
                    <button class="back-to-top" onclick="scrollToTop(this)">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    modalManager.showModal('loraModal', content);
    setupEditableFields(lora.file_path);
    setupShowcaseScroll();
    setupTabSwitching();
    setupTagTooltip();
    setupTriggerWordsEditMode();
    setupModelNameEditing(lora.file_path);
    setupBaseModelEditing(lora.file_path);
    setupFileNameEditing(lora.file_path);
    
    // If we have a model ID but no description, fetch it
    if (lora.civitai?.modelId && !lora.modelDescription) {
        loadModelDescription(lora.civitai.modelId, lora.file_path);
    }
    
    // Load recipes for this Lora
    loadRecipesForLora(lora.model_name, lora.sha256);
    
    // Load example images asynchronously
    loadExampleImages(lora.civitai?.images, lora.sha256);
}

/**
 * Load example images asynchronously
 * @param {Array} images - Array of image objects
 * @param {string} modelHash - Model hash for fetching local files
 */
async function loadExampleImages(images, modelHash) {
    try {
        const showcaseTab = document.getElementById('showcase-tab');
        if (!showcaseTab) return;
        
        // First fetch local example files
        let localFiles = [];
        if (modelHash) {
            try {
                localFiles = await getExampleImageFiles(modelHash);
            } catch (error) {
                console.error("Failed to get example files:", error);
            }
        } 
        
        // Then render with both remote images and local files
        showcaseTab.innerHTML = renderShowcaseContent(images, localFiles);
        
        // Re-initialize the showcase event listeners
        const carousel = showcaseTab.querySelector('.carousel');
        if (carousel) {
            // Only initialize if we actually have examples and they're expanded
            if (!carousel.classList.contains('collapsed')) {
                initLazyLoading(carousel);
                initNsfwBlurHandlers(carousel);
                initMetadataPanelHandlers(carousel);
            }
        }
    } catch (error) {
        console.error('Error loading example images:', error);
        const showcaseTab = document.getElementById('showcase-tab');
        if (showcaseTab) {
            showcaseTab.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    Error loading example images
                </div>
            `;
        }
    }
}

// Copy file name function
window.copyFileName = async function(fileName) {
    try {
        await copyToClipboard(fileName, 'File name copied');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    }
};

// Add save note function
window.saveNotes = async function(filePath) {
    const content = document.querySelector('.notes-content').textContent;
    try {
        await saveModelMetadata(filePath, { notes: content });

        // Update the corresponding lora card's dataset
        updateLoraCard(filePath, { notes: content });

        showToast('Notes saved successfully', 'success');
    } catch (error) {
        showToast('Failed to save notes', 'error');
    }
};

function setupEditableFields(filePath) {
    const editableFields = document.querySelectorAll('.editable-field [contenteditable]');
    
    editableFields.forEach(field => {
        field.addEventListener('focus', function() {
            if (this.textContent === 'Add your notes here...') {
                this.textContent = '';
            }
        });

        field.addEventListener('blur', function() {
            if (this.textContent.trim() === '') {
                if (this.classList.contains('notes-content')) {
                    this.textContent = 'Add your notes here...';
                }
            }
        });
    });

    const presetSelector = document.getElementById('preset-selector');
    const presetValue = document.getElementById('preset-value');
    const addPresetBtn = document.querySelector('.add-preset-btn');
    const presetTags = document.querySelector('.preset-tags');

    presetSelector.addEventListener('change', function() {
        const selected = this.value;
        if (selected) {
            presetValue.style.display = 'inline-block';
            presetValue.min = selected.includes('strength') ? -10 : 0;
            presetValue.max = selected.includes('strength') ? 10 : 10;
            presetValue.step = 0.5;
            if (selected === 'clip_skip') {
                presetValue.type = 'number';
                presetValue.step = 1;
            }
            // Add auto-focus
            setTimeout(() => presetValue.focus(), 0);
        } else {
            presetValue.style.display = 'none';
        }
    });

    addPresetBtn.addEventListener('click', async function() {
        const key = presetSelector.value;
        const value = presetValue.value;
        
        if (!key || !value) return;

        const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
        const currentPresets = parsePresets(loraCard.dataset.usage_tips);
        
        currentPresets[key] = parseFloat(value);
        const newPresetsJson = JSON.stringify(currentPresets);

        await saveModelMetadata(filePath, { 
            usage_tips: newPresetsJson
        });

        // Update the card with the new usage tips
        updateLoraCard(filePath, { usage_tips: newPresetsJson });
        
        presetTags.innerHTML = renderPresetTags(currentPresets);
        
        presetSelector.value = '';
        presetValue.value = '';
        presetValue.style.display = 'none';
    });

    // Add keydown event listeners for notes
    const notesContent = document.querySelector('.notes-content');
    if (notesContent) {
        notesContent.addEventListener('keydown', async function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Allow shift+enter for new line
                    return;
                }
                e.preventDefault();
                await saveNotes(filePath);
            }
        });
    }

    // Add keydown event for preset value
    presetValue.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addPresetBtn.click();
        }
    });
}

// Export functions for global access
export { toggleShowcase, scrollToTop };