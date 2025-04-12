/**
 * ModelMetadata.js
 * Handles checkpoint model metadata editing functionality
 */
import { showToast } from '../../utils/uiHelpers.js';
import { BASE_MODELS } from '../../utils/constants.js';
import { updateCheckpointCard } from '../../utils/cardUpdater.js';

/**
 * Save model metadata to the server
 * @param {string} filePath - Path to the model file
 * @param {Object} data - Metadata to save
 * @returns {Promise} - Promise that resolves with the server response
 */
export async function saveModelMetadata(filePath, data) {
    const response = await fetch('/api/checkpoints/save-metadata', {
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
    
    return response.json();
}

/**
 * Set up model name editing functionality
 * @param {string} filePath - The full file path of the model.
 */
export function setupModelNameEditing(filePath) {
    const modelNameContent = document.querySelector('.model-name-content');
    const editBtn = document.querySelector('.edit-model-name-btn');
    
    if (!modelNameContent || !editBtn) return;
    
    // Show edit button on hover
    const modelNameHeader = document.querySelector('.model-name-header');
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
            // Use the passed filePath to find the card
            const checkpointCard = document.querySelector(`.checkpoint-card[data-filepath="${filePath}"]`);
            if (checkpointCard) {
                this.textContent = checkpointCard.dataset.model_name;
            }
        }
    });
    
    // Handle enter key
    modelNameContent.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Use the passed filePath
            saveModelName(filePath);
            this.blur();
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
 * Save model name
 * @param {string} filePath - File path
 */
async function saveModelName(filePath) {
    const modelNameElement = document.querySelector('.model-name-content');
    const newModelName = modelNameElement.textContent.trim();
    
    // Validate model name
    if (!newModelName) {
        showToast('Model name cannot be empty', 'error');
        return;
    }
    
    // Check if model name is too long
    if (newModelName.length > 100) {
        showToast('Model name is too long (maximum 100 characters)', 'error');
        // Truncate the displayed text
        modelNameElement.textContent = newModelName.substring(0, 100);
        return;
    }
    
    try {
        await saveModelMetadata(filePath, { model_name: newModelName });
        
        // Update the card with the new model name
        updateCheckpointCard(filePath, { name: newModelName });
        
        showToast('Model name updated successfully', 'success');
        
        // No need to reload the entire page
        // setTimeout(() => {
        //     window.location.reload();
        // }, 1500);
    } catch (error) {
        showToast('Failed to update model name', 'error');
    }
}

/**
 * Set up base model editing functionality
 * @param {string} filePath - The full file path of the model.
 */
export function setupBaseModelEditing(filePath) {
    const baseModelContent = document.querySelector('.base-model-content');
    const editBtn = document.querySelector('.edit-base-model-btn');
    
    if (!baseModelContent || !editBtn) return;
    
    // Show edit button on hover
    const baseModelDisplay = document.querySelector('.base-model-display');
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
                // Use the passed filePath for saving
                saveBaseModel(filePath, originalValue);
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
 * Save base model
 * @param {string} filePath - File path
 * @param {string} originalValue - Original value (for comparison)
 */
async function saveBaseModel(filePath, originalValue) {
    const baseModelElement = document.querySelector('.base-model-content');
    const newBaseModel = baseModelElement.textContent.trim();
    
    // Only save if the value has actually changed
    if (newBaseModel === originalValue) {
        return; // No change, no need to save
    }
    
    try {
        await saveModelMetadata(filePath, { base_model: newBaseModel });
        
        // Update the card with the new base model
        updateCheckpointCard(filePath, { base_model: newBaseModel });
        
        showToast('Base model updated successfully', 'success');
    } catch (error) {
        showToast('Failed to update base model', 'error');
    }
}

/**
 * Set up file name editing functionality
 * @param {string} filePath - The full file path of the model.
 */
export function setupFileNameEditing(filePath) {
    const fileNameContent = document.querySelector('.file-name-content');
    const editBtn = document.querySelector('.edit-file-name-btn');
    
    if (!fileNameContent || !editBtn) return;
    
    // Show edit button on hover
    const fileNameWrapper = document.querySelector('.file-name-wrapper');
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
        
        // Store original value for comparison later
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
    
    // Handle keyboard events in edit mode
    fileNameContent.addEventListener('keydown', function(e) {
        if (!this.getAttribute('contenteditable')) return;
        
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur(); // Trigger save on Enter
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
    fileNameContent.addEventListener('blur', async function() {
        if (!this.getAttribute('contenteditable')) return;
        
        const newFileName = this.textContent.trim();
        const originalValue = this.dataset.originalValue;
        
        // Basic validation
        if (!newFileName) {
            // Restore original value if empty
            this.textContent = originalValue;
            showToast('File name cannot be empty', 'error');
            exitEditMode();
            return;
        }
        
        if (newFileName === originalValue) {
            // No changes, just exit edit mode
            exitEditMode();
            return;
        }
        
        try {
            // Use the passed filePath (which includes the original filename)
            // Call API to rename the file
            const response = await fetch('/api/rename_checkpoint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: filePath, // Use the full original path
                    new_file_name: newFileName
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showToast('File name updated successfully', 'success');
                
                // Get the new file path from the result
                const pathParts = filePath.split(/[\\/]/);
                pathParts.pop(); // Remove old filename
                const newFilePath = [...pathParts, newFileName].join('/');
                
                // Update the checkpoint card with new file path
                updateCheckpointCard(filePath, { 
                    filepath: newFilePath,
                    file_name: newFileName 
                });
                
                // Update the file name display in the modal
                document.querySelector('#file-name').textContent = newFileName;
                
                // Update the modal's data-filepath attribute
                const modalContent = document.querySelector('#checkpointModal .modal-content');
                if (modalContent) {
                    modalContent.dataset.filepath = newFilePath;
                }
                
                // Reload the page after a short delay to reflect changes
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error renaming file:', error);
            this.textContent = originalValue; // Restore original file name
            showToast(`Failed to rename file: ${error.message}`, 'error');
        } finally {
            exitEditMode();
        }
    });
    
    function exitEditMode() {
        fileNameContent.removeAttribute('contenteditable');
        fileNameWrapper.classList.remove('editing');
        editBtn.classList.remove('visible');
    }
}