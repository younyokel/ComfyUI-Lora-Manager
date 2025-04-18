/**
 * TriggerWords.js
 * 处理LoRA模型触发词相关的功能模块
 */
import { showToast } from '../../utils/uiHelpers.js';
import { saveModelMetadata } from './ModelMetadata.js';

/**
 * 渲染触发词
 * @param {Array} words - 触发词数组
 * @param {string} filePath - 文件路径
 * @returns {string} HTML内容
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
            <div class="trigger-words-edit-controls" style="display:none;">
                <button class="add-trigger-word-btn" title="Add a trigger word">
                    <i class="fas fa-plus"></i> Add
                </button>
                <button class="save-trigger-words-btn" title="Save changes">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
            <div class="add-trigger-word-form" style="display:none;">
                <input type="text" class="new-trigger-word-input" placeholder="Enter trigger word">
                <button class="confirm-add-trigger-word-btn">Add</button>
                <button class="cancel-add-trigger-word-btn">Cancel</button>
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
            <div class="trigger-words-edit-controls" style="display:none;">
                <button class="add-trigger-word-btn" title="Add a trigger word">
                    <i class="fas fa-plus"></i> Add
                </button>
                <button class="save-trigger-words-btn" title="Save changes">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
            <div class="add-trigger-word-form" style="display:none;">
                <input type="text" class="new-trigger-word-input" placeholder="Enter trigger word">
                <button class="confirm-add-trigger-word-btn">Add</button>
                <button class="cancel-add-trigger-word-btn">Cancel</button>
            </div>
        </div>
    `;
}

/**
 * 设置触发词编辑模式
 */
export function setupTriggerWordsEditMode() {
    const editBtn = document.querySelector('.edit-trigger-words-btn');
    if (!editBtn) return;
    
    editBtn.addEventListener('click', function() {
        const triggerWordsSection = this.closest('.trigger-words');
        const isEditMode = triggerWordsSection.classList.toggle('edit-mode');
        
        // Toggle edit mode UI elements
        const triggerWordTags = triggerWordsSection.querySelectorAll('.trigger-word-tag');
        const editControls = triggerWordsSection.querySelector('.trigger-words-edit-controls');
        const noTriggerWords = triggerWordsSection.querySelector('.no-trigger-words');
        const tagsContainer = triggerWordsSection.querySelector('.trigger-words-tags');
        
        if (isEditMode) {
            this.innerHTML = '<i class="fas fa-times"></i>'; // Change to cancel icon
            this.title = "Cancel editing";
            editControls.style.display = 'flex';
            
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
        } else {
            this.innerHTML = '<i class="fas fa-pencil-alt"></i>'; // Change back to edit icon
            this.title = "Edit trigger words";
            editControls.style.display = 'none';
            
            // If we have no trigger words, show the "No trigger word needed" text
            // and hide the empty tags container
            const currentTags = triggerWordsSection.querySelectorAll('.trigger-word-tag');
            if (noTriggerWords && currentTags.length === 0) {
                noTriggerWords.style.display = '';
                if (tagsContainer) tagsContainer.style.display = 'none';
            }
            
            // Restore original state
            triggerWordTags.forEach(tag => {
                const word = tag.dataset.word;
                tag.onclick = () => copyTriggerWord(word);
                tag.querySelector('.trigger-word-copy').style.display = 'flex';
                tag.querySelector('.delete-trigger-word-btn').style.display = 'none';
            });
            
            // Hide add form if open
            triggerWordsSection.querySelector('.add-trigger-word-form').style.display = 'none';
        }
    });
    
    // Set up add trigger word button
    const addBtn = document.querySelector('.add-trigger-word-btn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            const triggerWordsSection = this.closest('.trigger-words');
            const addForm = triggerWordsSection.querySelector('.add-trigger-word-form');
            addForm.style.display = 'flex';
            addForm.querySelector('input').focus();
        });
    }
    
    // Set up confirm and cancel add buttons
    const confirmAddBtn = document.querySelector('.confirm-add-trigger-word-btn');
    const cancelAddBtn = document.querySelector('.cancel-add-trigger-word-btn');
    const triggerWordInput = document.querySelector('.new-trigger-word-input');
    
    if (confirmAddBtn && triggerWordInput) {
        confirmAddBtn.addEventListener('click', function() {
            addNewTriggerWord(triggerWordInput.value);
        });
        
        // Add keydown event to input
        triggerWordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewTriggerWord(this.value);
            }
        });
    }
    
    if (cancelAddBtn) {
        cancelAddBtn.addEventListener('click', function() {
            const addForm = this.closest('.add-trigger-word-form');
            addForm.style.display = 'none';
            addForm.querySelector('input').value = '';
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
        });
    });
}

/**
 * 添加新触发词
 * @param {string} word - 要添加的触发词
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
    });
    
    tagsContainer.appendChild(newTag);
    
    // Clear and hide the input form
    const triggerWordInput = document.querySelector('.new-trigger-word-input');
    triggerWordInput.value = '';
    document.querySelector('.add-trigger-word-form').style.display = 'none';
}

/**
 * 保存触发词
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
 * 复制触发词到剪贴板
 * @param {string} word - 要复制的触发词
 */
window.copyTriggerWord = async function(word) {
    try {
        await navigator.clipboard.writeText(word);
        showToast('Trigger word copied', 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    }
};