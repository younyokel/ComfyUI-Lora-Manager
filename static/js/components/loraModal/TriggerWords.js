/**
 * TriggerWords.js
 * Module that handles trigger word functionality for LoRA models
 */
import { showToast, copyToClipboard } from '../../utils/uiHelpers.js';
import { saveModelMetadata } from '../../api/loraApi.js';

/**
 * Fetch trained words for a model
 * @param {string} filePath - Path to the model file
 * @returns {Promise<Array>} - Array of [word, frequency] pairs
 */
async function fetchTrainedWords(filePath) {
    try {
        const response = await fetch(`/api/trained-words?file_path=${encodeURIComponent(filePath)}`);
        const data = await response.json();
        
        if (data.success && data.trained_words) {
            return data.trained_words; // Returns array of [word, frequency] pairs
        } else {
            throw new Error(data.error || 'Failed to fetch trained words');
        }
    } catch (error) {
        console.error('Error fetching trained words:', error);
        showToast('Could not load trained words', 'error');
        return [];
    }
}

/**
 * Create suggestion dropdown with trained words as tags
 * @param {Array} trainedWords - Array of [word, frequency] pairs
 * @param {Array} existingWords - Already added trigger words
 * @returns {HTMLElement} - Dropdown element
 */
function createSuggestionDropdown(trainedWords, existingWords = []) {
    const dropdown = document.createElement('div');
    dropdown.className = 'trained-words-dropdown';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'trained-words-header';
    
    if (!trainedWords || trainedWords.length === 0) {
        header.innerHTML = '<span>No suggestions available</span>';
        dropdown.appendChild(header);
        dropdown.innerHTML += '<div class="no-trained-words">No trained words found in this model. You can manually enter trigger words.</div>';
        return dropdown;
    }
    
    // Sort by frequency (highest first)
    trainedWords.sort((a, b) => b[1] - a[1]);
    
    header.innerHTML = `
        <span>Suggestions from training data</span>
        <small>${trainedWords.length} words found</small>
    `;
    dropdown.appendChild(header);
    
    // Create tag container
    const container = document.createElement('div');
    container.className = 'trained-words-container';
    
    // Add each trained word as a tag
    trainedWords.forEach(([word, frequency]) => {
        const isAdded = existingWords.includes(word);
        
        const item = document.createElement('div');
        item.className = `trained-word-item ${isAdded ? 'already-added' : ''}`;
        item.title = word; // Show full word on hover if truncated
        item.innerHTML = `
            <span class="trained-word-text">${word}</span>
            <div class="trained-word-meta">
                <span class="trained-word-freq">${frequency}</span>
                ${isAdded ? '<span class="added-indicator"><i class="fas fa-check"></i></span>' : ''}
            </div>
        `;
        
        if (!isAdded) {
            item.addEventListener('click', () => {
                // Automatically add this word
                addNewTriggerWord(word);
                
                // Also populate the input field for potential editing
                const input = document.querySelector('.new-trigger-word-input');
                if (input) input.value = word;
                
                // Focus on the input
                if (input) input.focus();
                
                // Update dropdown without removing it
                updateTrainedWordsDropdown();
            });
        }
        
        container.appendChild(item);
    });
    
    dropdown.appendChild(container);
    return dropdown;
}

/**
 * Render trigger words
 * @param {Array} words - Array of trigger words
 * @param {string} filePath - File path
 * @returns {string} HTML content
 */
export function renderTriggerWords(words, filePath) {
    if (!words.length) return `
        <div class="info-item full-width trigger-words">
            <div class="trigger-words-header">
                <label>Trigger Words</label>
                <button class="edit-trigger-words-btn" data-file-path="${filePath}" title="Edit trigger words">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
            <div class="trigger-words-content">
                <span class="no-trigger-words">No trigger word needed</span>
                <div class="trigger-words-tags" style="display:none;"></div>
            </div>
            <div class="add-trigger-word-form" style="display:none;">
                <input type="text" class="new-trigger-word-input" placeholder="Type to add or click suggestions below">
            </div>
            <div class="trigger-words-edit-controls" style="display:none;">
                <button class="save-trigger-words-btn" title="Save changes">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
        </div>
    `;
    
    return `
        <div class="info-item full-width trigger-words">
            <div class="trigger-words-header">
                <label>Trigger Words</label>
                <button class="edit-trigger-words-btn" data-file-path="${filePath}" title="Edit trigger words">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
            <div class="trigger-words-content">
                <div class="trigger-words-tags">
                    ${words.map(word => `
                        <div class="trigger-word-tag" data-word="${word}" onclick="copyTriggerWord('${word}')">
                            <span class="trigger-word-content">${word}</span>
                            <span class="trigger-word-copy">
                                <i class="fas fa-copy"></i>
                            </span>
                            <button class="delete-trigger-word-btn" style="display:none;" onclick="event.stopPropagation();">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="add-trigger-word-form" style="display:none;">
                <input type="text" class="new-trigger-word-input" placeholder="Type to add or click suggestions below">
            </div>
            <div class="trigger-words-edit-controls" style="display:none;">
                <button class="save-trigger-words-btn" title="Save changes">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
        </div>
    `;
}

/**
 * Set up trigger words edit mode
 */
export function setupTriggerWordsEditMode() {
    // Store trained words data
    let trainedWordsList = [];
    let isTrainedWordsLoaded = false;
    // Store original trigger words for restoring on cancel
    let originalTriggerWords = [];
    
    const editBtn = document.querySelector('.edit-trigger-words-btn');
    if (!editBtn) return;
    
    editBtn.addEventListener('click', async function() {
        const triggerWordsSection = this.closest('.trigger-words');
        const isEditMode = triggerWordsSection.classList.toggle('edit-mode');
        const filePath = this.dataset.filePath;
        
        // Toggle edit mode UI elements
        const triggerWordTags = triggerWordsSection.querySelectorAll('.trigger-word-tag');
        const editControls = triggerWordsSection.querySelector('.trigger-words-edit-controls');
        const addForm = triggerWordsSection.querySelector('.add-trigger-word-form');
        const noTriggerWords = triggerWordsSection.querySelector('.no-trigger-words');
        const tagsContainer = triggerWordsSection.querySelector('.trigger-words-tags');
        
        if (isEditMode) {
            this.innerHTML = '<i class="fas fa-times"></i>'; // Change to cancel icon
            this.title = "Cancel editing";
            
            // Store original trigger words for potential restoration
            originalTriggerWords = Array.from(triggerWordTags).map(tag => tag.dataset.word);
            
            // Show edit controls and input form
            editControls.style.display = 'flex';
            addForm.style.display = 'flex';
            
            // If we have no trigger words yet, hide the "No trigger word needed" text
            // and show the empty tags container
            if (noTriggerWords) {
                noTriggerWords.style.display = 'none';
                if (tagsContainer) tagsContainer.style.display = 'flex';
            }
            
            // Disable click-to-copy and show delete buttons
            triggerWordTags.forEach(tag => {
                tag.onclick = null;
                tag.querySelector('.trigger-word-copy').style.display = 'none';
                tag.querySelector('.delete-trigger-word-btn').style.display = 'block';
            });
            
            // Load trained words and display dropdown when entering edit mode
            // Add loading indicator
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'trained-words-loading';
            loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading suggestions...';
            addForm.appendChild(loadingIndicator);
            
            // Get currently added trigger words
            const currentTags = triggerWordsSection.querySelectorAll('.trigger-word-tag');
            const existingWords = Array.from(currentTags).map(tag => tag.dataset.word);
            
            // Asynchronously load trained words if not already loaded
            if (!isTrainedWordsLoaded) {
                trainedWordsList = await fetchTrainedWords(filePath);
                isTrainedWordsLoaded = true;
            }
            
            // Remove loading indicator
            loadingIndicator.remove();
            
            // Create and display suggestion dropdown
            const dropdown = createSuggestionDropdown(trainedWordsList, existingWords);
            addForm.appendChild(dropdown);
            
            // Focus the input
            addForm.querySelector('input').focus();
            
        } else {
            this.innerHTML = '<i class="fas fa-pencil-alt"></i>'; // Change back to edit icon
            this.title = "Edit trigger words";
            
            // Hide edit controls and input form
            editControls.style.display = 'none';
            addForm.style.display = 'none';
            
            // BUGFIX: Restore original trigger words when canceling edit
            restoreOriginalTriggerWords(triggerWordsSection, originalTriggerWords);
            
            // If we have no trigger words, show the "No trigger word needed" text
            // and hide the empty tags container
            const currentTags = triggerWordsSection.querySelectorAll('.trigger-word-tag');
            if (noTriggerWords && currentTags.length === 0) {
                noTriggerWords.style.display = '';
                if (tagsContainer) tagsContainer.style.display = 'none';
            }
            
            // Remove dropdown if present
            const dropdown = document.querySelector('.trained-words-dropdown');
            if (dropdown) dropdown.remove();
        }
    });
    
    // Set up input for adding trigger words
    const triggerWordInput = document.querySelector('.new-trigger-word-input');
    
    if (triggerWordInput) {
        // Add keydown event to input
        triggerWordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewTriggerWord(this.value);
                this.value = ''; // Clear input after adding
            }
        });
    }
    
    // Set up save button
    const saveBtn = document.querySelector('.save-trigger-words-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTriggerWords);
    }
    
    // Set up delete buttons
    document.querySelectorAll('.delete-trigger-word-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const tag = this.closest('.trigger-word-tag');
            tag.remove();
            
            // Update status of items in the trained words dropdown
            updateTrainedWordsDropdown();
        });
    });
}

/**
 * Restore original trigger words when canceling edit
 * @param {HTMLElement} section - The trigger words section
 * @param {Array} originalWords - Original trigger words
 */
function restoreOriginalTriggerWords(section, originalWords) {
    const tagsContainer = section.querySelector('.trigger-words-tags');
    const noTriggerWords = section.querySelector('.no-trigger-words');
    
    if (!tagsContainer) return;
    
    // Clear current tags
    tagsContainer.innerHTML = '';
    
    if (originalWords.length === 0) {
        if (noTriggerWords) noTriggerWords.style.display = '';
        tagsContainer.style.display = 'none';
        return;
    }
    
    // Hide "no trigger words" message
    if (noTriggerWords) noTriggerWords.style.display = 'none';
    tagsContainer.style.display = 'flex';
    
    // Recreate original tags
    originalWords.forEach(word => {
        const tag = document.createElement('div');
        tag.className = 'trigger-word-tag';
        tag.dataset.word = word;
        tag.onclick = () => copyTriggerWord(word);
        tag.innerHTML = `
            <span class="trigger-word-content">${word}</span>
            <span class="trigger-word-copy">
                <i class="fas fa-copy"></i>
            </span>
            <button class="delete-trigger-word-btn" style="display:none;" onclick="event.stopPropagation();">
                <i class="fas fa-times"></i>
            </button>
        `;
        tagsContainer.appendChild(tag);
    });
}

/**
 * Add a new trigger word
 * @param {string} word - Trigger word to add
 */
function addNewTriggerWord(word) {
    word = word.trim();
    if (!word) return;
    
    const triggerWordsSection = document.querySelector('.trigger-words');
    let tagsContainer = document.querySelector('.trigger-words-tags');
    
    // Ensure tags container exists and is visible
    if (tagsContainer) {
        tagsContainer.style.display = 'flex';
    } else {
        // Create tags container if it doesn't exist
        const contentDiv = triggerWordsSection.querySelector('.trigger-words-content');
        if (contentDiv) {
            tagsContainer = document.createElement('div');
            tagsContainer.className = 'trigger-words-tags';
            contentDiv.appendChild(tagsContainer);
        }
    }
    
    if (!tagsContainer) return;
    
    // Hide "no trigger words" message if it exists
    const noTriggerWordsMsg = triggerWordsSection.querySelector('.no-trigger-words');
    if (noTriggerWordsMsg) {
        noTriggerWordsMsg.style.display = 'none';
    }
    
    // Validation: Check length
    if (word.split(/\s+/).length > 30) {
        showToast('Trigger word should not exceed 30 words', 'error');
        return;
    }
    
    // Validation: Check total number
    const currentTags = tagsContainer.querySelectorAll('.trigger-word-tag');
    if (currentTags.length >= 30) {
        showToast('Maximum 30 trigger words allowed', 'error');
        return;
    }
    
    // Validation: Check for duplicates
    const existingWords = Array.from(currentTags).map(tag => tag.dataset.word);
    if (existingWords.includes(word)) {
        showToast('This trigger word already exists', 'error');
        return;
    }
    
    // Create new tag
    const newTag = document.createElement('div');
    newTag.className = 'trigger-word-tag';
    newTag.dataset.word = word;
    newTag.innerHTML = `
        <span class="trigger-word-content">${word}</span>
        <span class="trigger-word-copy" style="display:none;">
            <i class="fas fa-copy"></i>
        </span>
        <button class="delete-trigger-word-btn" onclick="event.stopPropagation();">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add event listener to delete button
    const deleteBtn = newTag.querySelector('.delete-trigger-word-btn');
    deleteBtn.addEventListener('click', function() {
        newTag.remove();
        // Update dropdown after removing
        updateTrainedWordsDropdown();
    });
    
    tagsContainer.appendChild(newTag);
    
    // Update status of items in the trained words dropdown
    updateTrainedWordsDropdown();
}

/**
 * Update status of items in the trained words dropdown
 */
function updateTrainedWordsDropdown() {
    const dropdown = document.querySelector('.trained-words-dropdown');
    if (!dropdown) return;
    
    // Get all current trigger words
    const currentTags = document.querySelectorAll('.trigger-word-tag');
    const existingWords = Array.from(currentTags).map(tag => tag.dataset.word);
    
    // Update status of each item in dropdown
    dropdown.querySelectorAll('.trained-word-item').forEach(item => {
        const wordText = item.querySelector('.trained-word-text').textContent;
        const isAdded = existingWords.includes(wordText);
        
        if (isAdded) {
            item.classList.add('already-added');
            
            // Add indicator if it doesn't exist
            let indicator = item.querySelector('.added-indicator');
            if (!indicator) {
                const meta = item.querySelector('.trained-word-meta');
                indicator = document.createElement('span');
                indicator.className = 'added-indicator';
                indicator.innerHTML = '<i class="fas fa-check"></i>';
                meta.appendChild(indicator);
            }
            
            // Remove click event
            item.onclick = null;
        } else {
            // Re-enable items that are no longer in the list
            item.classList.remove('already-added');
            
            // Remove indicator if it exists
            const indicator = item.querySelector('.added-indicator');
            if (indicator) indicator.remove();
            
            // Restore click event if not already set
            if (!item.onclick) {
                item.onclick = () => {
                    const word = item.querySelector('.trained-word-text').textContent;
                    addNewTriggerWord(word);
                    
                    // Also populate the input field
                    const input = document.querySelector('.new-trigger-word-input');
                    if (input) input.value = word;
                    
                    // Focus the input
                    if (input) input.focus();
                };
            }
        }
    });
}

/**
 * Save trigger words
 */
async function saveTriggerWords() {
    const filePath = document.querySelector('.edit-trigger-words-btn').dataset.filePath;
    const triggerWordTags = document.querySelectorAll('.trigger-word-tag');
    const words = Array.from(triggerWordTags).map(tag => tag.dataset.word);
    
    try {
        // Special format for updating nested civitai.trainedWords
        await saveModelMetadata(filePath, {
            civitai: { trainedWords: words }
        });
        
        // Update UI
        const editBtn = document.querySelector('.edit-trigger-words-btn');
        editBtn.click(); // Exit edit mode
        
        // Update the LoRA card's dataset
        const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
        if (loraCard) {
            try {
                // Create a proper structure for civitai data
                let civitaiData = {};
                
                // Parse existing data if available
                if (loraCard.dataset.meta) {
                    civitaiData = JSON.parse(loraCard.dataset.meta);
                }
                
                // Update trainedWords property
                civitaiData.trainedWords = words;
                
                // Update the meta dataset attribute with the full civitai data
                loraCard.dataset.meta = JSON.stringify(civitaiData);
            } catch (e) {
                console.error('Error updating civitai data:', e);
            }
        }
        
        // If we saved an empty array and there's a no-trigger-words element, show it
        const noTriggerWords = document.querySelector('.no-trigger-words');
        const tagsContainer = document.querySelector('.trigger-words-tags');
        if (words.length === 0 && noTriggerWords) {
            noTriggerWords.style.display = '';
            if (tagsContainer) tagsContainer.style.display = 'none';
        }
        
        showToast('Trigger words updated successfully', 'success');
    } catch (error) {
        console.error('Error saving trigger words:', error);
        showToast('Failed to update trigger words', 'error');
    }
}

/**
 * Copy a trigger word to clipboard
 * @param {string} word - Word to copy
 */
window.copyTriggerWord = async function(word) {
    try {
        await copyToClipboard(word, 'Trigger word copied');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    }
};