import { showToast } from '../utils/uiHelpers.js';
import { BASE_MODELS } from '../utils/constants.js';

/**
 * CheckpointModal - Component for displaying checkpoint details
 * Similar to LoraModal but customized for checkpoint models
 */
export class CheckpointModal {
    constructor() {
        this.modal = document.getElementById('checkpointModal');
        this.modalTitle = document.getElementById('checkpointModalTitle');
        this.modalContent = document.getElementById('checkpointModalContent');
        this.currentCheckpoint = null;
        
        // Initialize close events
        this._initCloseEvents();
    }
    
    _initCloseEvents() {
        if (!this.modal) return;
        
        // Close button
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
    }
    
    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} - Formatted file size
     */
    _formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        if (i === 0) return `${bytes} ${sizes[i]}`;
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }
    
    /**
     * Render compact tags for the checkpoint
     * @param {Array} tags - Array of tags
     * @returns {string} - HTML for tags
     */
    _renderCompactTags(tags) {
        if (!tags || tags.length === 0) return '';
        
        // Display up to 5 tags, with a count if there are more
        const visibleTags = tags.slice(0, 5);
        const remainingCount = Math.max(0, tags.length - 5);
        
        return `
            <div class="model-tags-container">
                <div class="model-tags-compact">
                    ${visibleTags.map(tag => `<span class="model-tag-compact">${tag}</span>`).join('')}
                    ${remainingCount > 0 ? 
                        `<span class="model-tag-more" data-count="${remainingCount}">+${remainingCount}</span>` : 
                        ''}
                </div>
                ${tags.length > 0 ? 
                    `<div class="model-tags-tooltip">
                        <div class="tooltip-content">
                            ${tags.map(tag => `<span class="tooltip-tag">${tag}</span>`).join('')}
                        </div>
                    </div>` : 
                    ''}
            </div>
        `;
    }
    
    /**
     * Set up tag tooltip functionality
     */
    _setupTagTooltip() {
        const tagsContainer = document.querySelector('.model-tags-container');
        const tooltip = document.querySelector('.model-tags-tooltip');
        
        if (tagsContainer && tooltip) {
            tagsContainer.addEventListener('mouseenter', () => {
                tooltip.classList.add('visible');
            });
            
            tagsContainer.addEventListener('mouseleave', () => {
                tooltip.classList.remove('visible');
            });
        }
    }
    
    /**
     * Render showcase content (example images)
     * @param {Array} images - Array of image data
     * @returns {string} - HTML content
     */
    _renderShowcaseContent(images) {
        if (!images?.length) return '<div class="no-examples">No example images available</div>';
        
        return `
            <div class="scroll-indicator" onclick="toggleShowcase(this)">
                <i class="fas fa-chevron-down"></i>
                <span>Scroll or click to show ${images.length} examples</span>
            </div>
            <div class="carousel collapsed">
                <div class="carousel-container">
                    ${images.map(img => {
                        // Calculate appropriate aspect ratio
                        const aspectRatio = (img.height / img.width) * 100;
                        const containerWidth = 800; // modal content max width
                        const minHeightPercent = 40;
                        const maxHeightPercent = (window.innerHeight * 0.6 / containerWidth) * 100;
                        const heightPercent = Math.max(
                            minHeightPercent,
                            Math.min(maxHeightPercent, aspectRatio)
                        );
                        
                        // Extract metadata
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
                        
                        // Check if we have any generation parameters
                        const hasParams = seed || model || steps || sampler || cfgScale || clipSkip;
                        const hasPrompts = prompt || negativePrompt;
                        
                        // Generate metadata panel
                        let metadataPanel = '<div class="image-metadata-panel"><div class="metadata-content">';
                        
                        if (hasParams) {
                            metadataPanel += `
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
                            metadataPanel += `
                                <div class="no-metadata-message">
                                    <i class="fas fa-info-circle"></i>
                                    <span>No generation parameters available</span>
                                </div>
                            `;
                        }
                        
                        // Add prompt info if available
                        if (prompt) {
                            const promptIndex = Math.random().toString(36).substring(2, 15);
                            metadataPanel += `
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
                            const negPromptIndex = Math.random().toString(36).substring(2, 15);
                            metadataPanel += `
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
                        
                        metadataPanel += '</div></div>';
                        
                        return `
                            <div class="media-wrapper" style="padding-bottom: ${heightPercent}%">
                                <img data-src="${img.url}" 
                                    alt="Preview" 
                                    crossorigin="anonymous" 
                                    referrerpolicy="no-referrer"
                                    width="${img.width}"
                                    height="${img.height}"
                                    class="lazy">
                                ${metadataPanel}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    /**
     * Show checkpoint details in the modal
     * @param {Object} checkpoint - Checkpoint data
     */
    showCheckpointDetails(checkpoint) {
        if (!this.modal) {
            console.error('Checkpoint modal element not found');
            return;
        }
        
        this.currentCheckpoint = checkpoint;
        
        const content = `
            <div class="modal-content">
                <button class="close" onclick="modalManager.closeModal('checkpointModal')">&times;</button>
                <header class="modal-header">
                    <div class="model-name-header">
                        <h2 class="model-name-content" contenteditable="true" spellcheck="false">${checkpoint.model_name || 'Checkpoint Details'}</h2>
                        <button class="edit-model-name-btn" title="Edit model name">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </div>
                    ${this._renderCompactTags(checkpoint.tags || [])}
                </header>

                <div class="modal-body">
                    <div class="info-section">
                        <div class="info-grid">
                            <div class="info-item">
                                <label>Version</label>
                                <span>${checkpoint.civitai?.name || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <label>File Name</label>
                                <div class="file-name-wrapper">
                                    <span id="file-name" class="file-name-content">${checkpoint.file_name || 'N/A'}</span>
                                    <button class="edit-file-name-btn" title="Edit file name">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="info-item location-size">
                                <div class="location-wrapper">
                                    <label>Location</label>
                                    <span class="file-path">${checkpoint.folder || 'N/A'}</span>
                                </div>
                            </div>
                            <div class="info-item base-size">
                                <div class="base-wrapper">
                                    <label>Base Model</label>
                                    <div class="base-model-display">
                                        <span class="base-model-content">${checkpoint.base_model || 'Unknown'}</span>
                                        <button class="edit-base-model-btn" title="Edit base model">
                                            <i class="fas fa-pencil-alt"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="size-wrapper">
                                    <label>Size</label>
                                    <span>${this._formatFileSize(checkpoint.file_size)}</span>
                                </div>
                            </div>
                            <div class="info-item notes">
                                <label>Additional Notes</label>
                                <div class="editable-field">
                                    <div class="notes-content" contenteditable="true" spellcheck="false">${checkpoint.notes || 'Add your notes here...'}</div>
                                    <button class="save-btn" onclick="saveCheckpointNotes('${checkpoint.file_path}')">
                                        <i class="fas fa-save"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="info-item full-width">
                                <label>About this version</label>
                                <div class="description-text">${checkpoint.description || 'N/A'}</div>
                            </div>
                        </div>
                    </div>

                    <div class="showcase-section" data-checkpoint-id="${checkpoint.civitai?.modelId || ''}">
                        <div class="showcase-tabs">
                            <button class="tab-btn active" data-tab="showcase">Examples</button>
                            <button class="tab-btn" data-tab="description">Model Description</button>
                        </div>
                        
                        <div class="tab-content">
                            <div id="showcase-tab" class="tab-pane active">
                                ${this._renderShowcaseContent(checkpoint.civitai?.images || [])}
                            </div>
                            
                            <div id="description-tab" class="tab-pane">
                                <div class="model-description-container">
                                    <div class="model-description-loading">
                                        <i class="fas fa-spinner fa-spin"></i> Loading model description...
                                    </div>
                                    <div class="model-description-content">
                                        ${checkpoint.modelDescription || ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <button class="back-to-top" onclick="scrollToTopCheckpoint(this)">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.modal.innerHTML = content;
        this.modal.style.display = 'block';
        
        this._setupEditableFields();
        this._setupShowcaseScroll();
        this._setupTabSwitching();
        this._setupTagTooltip();
        this._setupModelNameEditing();
        this._setupBaseModelEditing();
        this._setupFileNameEditing();
        
        // If we have a model ID but no description, fetch it
        if (checkpoint.civitai?.modelId && !checkpoint.modelDescription) {
            this._loadModelDescription(checkpoint.civitai.modelId, checkpoint.file_path);
        }
    }
    
    /**
     * Close the checkpoint modal
     */
    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.currentCheckpoint = null;
        }
    }
    
    /**
     * Set up editable fields in the modal
     */
    _setupEditableFields() {
        const editableFields = this.modal.querySelectorAll('.editable-field [contenteditable]');
        
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

        // Add keydown event listeners for notes
        const notesContent = this.modal.querySelector('.notes-content');
        if (notesContent) {
            notesContent.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    if (e.shiftKey) {
                        // Allow shift+enter for new line
                        return;
                    }
                    e.preventDefault();
                    const filePath = this.modal.querySelector('.file-path').textContent + 
                        this.modal.querySelector('#file-name').textContent;
                    await this._saveNotes(filePath);
                }
            });
        }
    }
    
    /**
     * Save notes for the checkpoint
     * @param {string} filePath - Path to the checkpoint file
     */
    async _saveNotes(filePath) {
        const content = this.modal.querySelector('.notes-content').textContent;
        try {
            // This would typically call an API endpoint to save the notes
            // For now we'll just show a success message
            console.log('Would save notes:', content, 'for file:', filePath);
            
            showToast('Notes saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save notes', 'error');
        }
    }
    
    /**
     * Set up model name editing functionality
     */
    _setupModelNameEditing() {
        const modelNameContent = this.modal.querySelector('.model-name-content');
        const editBtn = this.modal.querySelector('.edit-model-name-btn');
        
        if (!modelNameContent || !editBtn) return;
        
        // Show edit button on hover
        const modelNameHeader = this.modal.querySelector('.model-name-header');
        modelNameHeader.addEventListener('mouseenter', () => {
            editBtn.classList.add('visible');
        });
        
        modelNameHeader.addEventListener('mouseleave', () => {
            if (!modelNameContent.getAttribute('data-editing')) {
                editBtn.classList.remove('visible');
            }
        });
        
        // Handle edit button click
        editBtn.addEventListener('click', () => {
            modelNameContent.setAttribute('data-editing', 'true');
            modelNameContent.focus();
            
            // Place cursor at the end
            const range = document.createRange();
            const sel = window.getSelection();
            if (modelNameContent.childNodes.length > 0) {
                range.setStart(modelNameContent.childNodes[0], modelNameContent.textContent.length);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            
            editBtn.classList.add('visible');
        });
        
        // Handle focus out
        modelNameContent.addEventListener('blur', function() {
            this.removeAttribute('data-editing');
            editBtn.classList.remove('visible');
            
            if (this.textContent.trim() === '') {
                // Restore original model name if empty
                this.textContent = 'Checkpoint Details';
            }
        });
        
        // Handle enter key
        modelNameContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                modelNameContent.blur();
                // Save model name here (would call an API endpoint)
                showToast('Model name updated', 'success');
            }
        });
        
        // Limit model name length
        modelNameContent.addEventListener('input', function() {
            if (this.textContent.length > 100) {
                this.textContent = this.textContent.substring(0, 100);
                // Place cursor at the end
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(this.childNodes[0], 100);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                
                showToast('Model name is limited to 100 characters', 'warning');
            }
        });
    }
    
    /**
     * Set up base model editing functionality
     */
    _setupBaseModelEditing() {
        const baseModelContent = this.modal.querySelector('.base-model-content');
        const editBtn = this.modal.querySelector('.edit-base-model-btn');
        
        if (!baseModelContent || !editBtn) return;
        
        // Show edit button on hover
        const baseModelDisplay = this.modal.querySelector('.base-model-display');
        baseModelDisplay.addEventListener('mouseenter', () => {
            editBtn.classList.add('visible');
        });
        
        baseModelDisplay.addEventListener('mouseleave', () => {
            if (!baseModelDisplay.classList.contains('editing')) {
                editBtn.classList.remove('visible');
            }
        });
        
        // Handle edit button click
        editBtn.addEventListener('click', () => {
            baseModelDisplay.classList.add('editing');
            
            // Store the original value to check for changes later
            const originalValue = baseModelContent.textContent.trim();
            
            // Create dropdown selector to replace the base model content
            const currentValue = originalValue;
            const dropdown = document.createElement('select');
            dropdown.className = 'base-model-selector';
            
            // Flag to track if a change was made
            let valueChanged = false;
            
            // Add options from BASE_MODELS constants
            const baseModelCategories = {
                'Stable Diffusion 1.x': [BASE_MODELS.SD_1_4, BASE_MODELS.SD_1_5, BASE_MODELS.SD_1_5_LCM, BASE_MODELS.SD_1_5_HYPER],
                'Stable Diffusion 2.x': [BASE_MODELS.SD_2_0, BASE_MODELS.SD_2_1],
                'Stable Diffusion 3.x': [BASE_MODELS.SD_3, BASE_MODELS.SD_3_5, BASE_MODELS.SD_3_5_MEDIUM, BASE_MODELS.SD_3_5_LARGE, BASE_MODELS.SD_3_5_LARGE_TURBO],
                'SDXL': [BASE_MODELS.SDXL, BASE_MODELS.SDXL_LIGHTNING, BASE_MODELS.SDXL_HYPER],
                'Video Models': [BASE_MODELS.SVD, BASE_MODELS.WAN_VIDEO, BASE_MODELS.HUNYUAN_VIDEO],
                'Other Models': [
                    BASE_MODELS.FLUX_1_D, BASE_MODELS.FLUX_1_S, BASE_MODELS.AURAFLOW,
                    BASE_MODELS.PIXART_A, BASE_MODELS.PIXART_E, BASE_MODELS.HUNYUAN_1,
                    BASE_MODELS.LUMINA, BASE_MODELS.KOLORS, BASE_MODELS.NOOBAI,
                    BASE_MODELS.ILLUSTRIOUS, BASE_MODELS.PONY, BASE_MODELS.UNKNOWN
                ]
            };
            
            // Create option groups for better organization
            Object.entries(baseModelCategories).forEach(([category, models]) => {
                const group = document.createElement('optgroup');
                group.label = category;
                
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    option.selected = model === currentValue;
                    group.appendChild(option);
                });
                
                dropdown.appendChild(group);
            });
            
            // Replace content with dropdown
            baseModelContent.style.display = 'none';
            baseModelDisplay.insertBefore(dropdown, editBtn);
            
            // Hide edit button during editing
            editBtn.style.display = 'none';
            
            // Focus the dropdown
            dropdown.focus();
            
            // Handle dropdown change
            dropdown.addEventListener('change', function() {
                const selectedModel = this.value;
                baseModelContent.textContent = selectedModel;
                
                // Mark that a change was made if the value differs from original
                if (selectedModel !== originalValue) {
                    valueChanged = true;
                } else {
                    valueChanged = false;
                }
            });
            
            // Function to save changes and exit edit mode
            const saveAndExit = function() {
                // Check if dropdown still exists and remove it
                if (dropdown && dropdown.parentNode === baseModelDisplay) {
                    baseModelDisplay.removeChild(dropdown);
                }
                
                // Show the content and edit button
                baseModelContent.style.display = '';
                editBtn.style.display = '';
                
                // Remove editing class
                baseModelDisplay.classList.remove('editing');
                
                // Only save if the value has actually changed
                if (valueChanged || baseModelContent.textContent.trim() !== originalValue) {
                    // Get file path for saving
                    const filePath = document.querySelector('#checkpointModal .modal-content')
                        .querySelector('.file-path').textContent + 
                        document.querySelector('#checkpointModal .modal-content')
                        .querySelector('#file-name').textContent + '.safetensors';
                    
                    // Save the changes (would call API to save model base change)
                    showToast('Base model updated successfully', 'success');
                }
                
                // Remove this event listener
                document.removeEventListener('click', outsideClickHandler);
            };
            
            // Handle outside clicks to save and exit
            const outsideClickHandler = function(e) {
                // If click is outside the dropdown and base model display
                if (!baseModelDisplay.contains(e.target)) {
                    saveAndExit();
                }
            };
            
            // Add delayed event listener for outside clicks
            setTimeout(() => {
                document.addEventListener('click', outsideClickHandler);
            }, 0);
            
            // Also handle dropdown blur event
            dropdown.addEventListener('blur', function(e) {
                // Only save if the related target is not the edit button or inside the baseModelDisplay
                if (!baseModelDisplay.contains(e.relatedTarget)) {
                    saveAndExit();
                }
            });
        });
    }
    
    /**
     * Set up file name editing functionality
     */
    _setupFileNameEditing() {
        const fileNameContent = this.modal.querySelector('.file-name-content');
        const editBtn = this.modal.querySelector('.edit-file-name-btn');
        
        if (!fileNameContent || !editBtn) return;
        
        // Show edit button on hover
        const fileNameWrapper = this.modal.querySelector('.file-name-wrapper');
        fileNameWrapper.addEventListener('mouseenter', () => {
            editBtn.classList.add('visible');
        });
        
        fileNameWrapper.addEventListener('mouseleave', () => {
            if (!fileNameWrapper.classList.contains('editing')) {
                editBtn.classList.remove('visible');
            }
        });
        
        // Handle edit button click
        editBtn.addEventListener('click', () => {
            fileNameWrapper.classList.add('editing');
            fileNameContent.setAttribute('contenteditable', 'true');
            fileNameContent.focus();
            
            // Store original value
            fileNameContent.dataset.originalValue = fileNameContent.textContent.trim();
            
            // Place cursor at the end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(fileNameContent);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            
            editBtn.classList.add('visible');
        });
        
        // Handle keyboard events
        fileNameContent.addEventListener('keydown', function(e) {
            if (!this.getAttribute('contenteditable')) return;
            
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // Restore original value
                this.textContent = this.dataset.originalValue;
                exitEditMode();
            }
        });
        
        // Handle input validation
        fileNameContent.addEventListener('input', function() {
            if (!this.getAttribute('contenteditable')) return;
            
            // Replace invalid characters for filenames
            const invalidChars = /[\\/:*?"<>|]/g;
            if (invalidChars.test(this.textContent)) {
                const cursorPos = window.getSelection().getRangeAt(0).startOffset;
                this.textContent = this.textContent.replace(invalidChars, '');
                
                // Restore cursor position
                const range = document.createRange();
                const sel = window.getSelection();
                const newPos = Math.min(cursorPos, this.textContent.length);
                
                if (this.firstChild) {
                    range.setStart(this.firstChild, newPos);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                
                showToast('Invalid characters removed from filename', 'warning');
            }
        });
        
        // Handle focus out - save changes
        fileNameContent.addEventListener('blur', function() {
            if (!this.getAttribute('contenteditable')) return;
            
            const newFileName = this.textContent.trim();
            const originalValue = this.dataset.originalValue;
            
            // Validation
            if (!newFileName) {
                this.textContent = originalValue;
                showToast('File name cannot be empty', 'error');
                exitEditMode();
                return;
            }
            
            if (newFileName !== originalValue) {
                // Would call API to rename file
                showToast(`File would be renamed to: ${newFileName}`, 'success');
            }
            
            exitEditMode();
        });
        
        function exitEditMode() {
            fileNameContent.removeAttribute('contenteditable');
            fileNameWrapper.classList.remove('editing');
            editBtn.classList.remove('visible');
        }
    }
    
    /**
     * Set up showcase scroll functionality
     */
    _setupShowcaseScroll() {
        // Initialize scroll listeners for showcase section
        const showcaseSection = this.modal.querySelector('.showcase-section');
        if (!showcaseSection) return;
        
        // Set up back-to-top button
        const backToTopBtn = showcaseSection.querySelector('.back-to-top');
        const modalContent = this.modal.querySelector('.modal-content');
        
        if (backToTopBtn && modalContent) {
            modalContent.addEventListener('scroll', () => {
                if (modalContent.scrollTop > 300) {
                    backToTopBtn.classList.add('visible');
                } else {
                    backToTopBtn.classList.remove('visible');
                }
            });
        }
        
        // Set up scroll to toggle showcase
        document.addEventListener('wheel', (event) => {
            if (this.modal.style.display !== 'block') return;
            
            const showcase = this.modal.querySelector('.showcase-section');
            if (!showcase) return;
            
            const carousel = showcase.querySelector('.carousel');
            const scrollIndicator = showcase.querySelector('.scroll-indicator');
            
            if (carousel?.classList.contains('collapsed') && event.deltaY > 0) {
                const isNearBottom = modalContent.scrollHeight - modalContent.scrollTop - modalContent.clientHeight < 100;
                
                if (isNearBottom) {
                    this._toggleShowcase(scrollIndicator);
                    event.preventDefault();
                }
            }
        }, { passive: false });
    }
    
    /**
     * Toggle showcase expansion
     * @param {HTMLElement} element - The scroll indicator element
     */
    _toggleShowcase(element) {
        const carousel = element.nextElementSibling;
        const isCollapsed = carousel.classList.contains('collapsed');
        const indicator = element.querySelector('span');
        const icon = element.querySelector('i');
        
        carousel.classList.toggle('collapsed');
        
        if (isCollapsed) {
            const count = carousel.querySelectorAll('.media-wrapper').length;
            indicator.textContent = `Scroll or click to hide examples`;
            icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
            this._initLazyLoading(carousel);
            this._initMetadataPanelHandlers(carousel);
        } else {
            const count = carousel.querySelectorAll('.media-wrapper').length;
            indicator.textContent = `Scroll or click to show ${count} examples`;
            icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        }
    }
    
    /**
     * Initialize lazy loading for images
     * @param {HTMLElement} container - Container with lazy-load images
     */
    _initLazyLoading(container) {
        const lazyImages = container.querySelectorAll('img.lazy');
        
        const lazyLoad = (image) => {
            image.src = image.dataset.src;
            image.classList.remove('lazy');
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    lazyLoad(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        });

        lazyImages.forEach(image => observer.observe(image));
    }
    
    /**
     * Initialize metadata panel handlers
     * @param {HTMLElement} container - Container with metadata panels
     */
    _initMetadataPanelHandlers(container) {
        const mediaWrappers = container.querySelectorAll('.media-wrapper');
        
        mediaWrappers.forEach(wrapper => {
            const metadataPanel = wrapper.querySelector('.image-metadata-panel');
            if (!metadataPanel) return;
            
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
                        await navigator.clipboard.writeText(promptElement.textContent);
                        showToast('Prompt copied to clipboard', 'success');
                    } catch (err) {
                        console.error('Copy failed:', err);
                        showToast('Copy failed', 'error');
                    }
                });
            });
            
            // Prevent panel scroll from causing modal scroll
            metadataPanel.addEventListener('wheel', (e) => {
                e.stopPropagation();
            });
        });
    }
    
    /**
     * Set up tab switching functionality
     */
    _setupTabSwitching() {
        const tabButtons = this.modal.querySelectorAll('.showcase-tabs .tab-btn');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all tabs
                this.modal.querySelectorAll('.showcase-tabs .tab-btn').forEach(btn => 
                    btn.classList.remove('active')
                );
                this.modal.querySelectorAll('.tab-content .tab-pane').forEach(tab => 
                    tab.classList.remove('active')
                );
                
                // Add active class to clicked tab
                button.classList.add('active');
                const tabId = `${button.dataset.tab}-tab`;
                this.modal.querySelector(`#${tabId}`).classList.add('active');
                
                // If switching to description tab, handle content
                if (button.dataset.tab === 'description') {
                    const descriptionContent = this.modal.querySelector('.model-description-content');
                    if (descriptionContent) {
                        const hasContent = descriptionContent.innerHTML.trim() !== '';
                        this.modal.querySelector('.model-description-loading')?.classList.add('hidden');
                        
                        if (!hasContent) {
                            descriptionContent.innerHTML = '<div class="no-description">No model description available</div>';
                            descriptionContent.classList.remove('hidden');
                        }
                    }
                }
            });
        });
    }
    
    /**
     * Load model description from API
     * @param {string} modelId - Model ID
     * @param {string} filePath - File path
     */
    async _loadModelDescription(modelId, filePath) {
        try {
            const descriptionContainer = this.modal.querySelector('.model-description-content');
            const loadingElement = this.modal.querySelector('.model-description-loading');
            
            if (!descriptionContainer || !loadingElement) return;
            
            // Show loading indicator
            loadingElement.classList.remove('hidden');
            descriptionContainer.classList.add('hidden');
            
            // In production, this would fetch from the API
            // For now, just simulate loading
            setTimeout(() => {
                descriptionContainer.innerHTML = '<p>This is a placeholder for the checkpoint model description.</p>';
                
                // Show the description and hide loading indicator
                descriptionContainer.classList.remove('hidden');
                loadingElement.classList.add('hidden');
            }, 500);
        } catch (error) {
            console.error('Error loading model description:', error);
            const loadingElement = this.modal.querySelector('.model-description-loading');
            if (loadingElement) {
                loadingElement.innerHTML = `<div class="error-message">Failed to load model description. ${error.message}</div>`;
            }
            
            // Show empty state message
            const descriptionContainer = this.modal.querySelector('.model-description-content');
            if (descriptionContainer) {
                descriptionContainer.innerHTML = '<div class="no-description">No model description available</div>';
                descriptionContainer.classList.remove('hidden');
            }
        }
    }
    
    /**
     * Scroll to top of modal content
     * @param {HTMLElement} button - The back to top button
     */
    scrollToTop(button) {
        const modalContent = button.closest('.modal-content');
        if (modalContent) {
            modalContent.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    }
}

// Create and export global instance
export const checkpointModal = new CheckpointModal();

// Add global functions for use in HTML
window.toggleShowcase = function(element) {
    checkpointModal._toggleShowcase(element);
};

window.scrollToTopCheckpoint = function(button) {
    checkpointModal.scrollToTop(button);
};

window.saveCheckpointNotes = function(filePath) {
    checkpointModal._saveNotes(filePath);
};