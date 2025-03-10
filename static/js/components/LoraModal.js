import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';

export function showLoraModal(lora) {
    const escapedWords = lora.civitai?.trainedWords?.length ? 
        lora.civitai.trainedWords.map(word => word.replace(/'/g, '\\\'')) : [];

    const content = `
        <div class="modal-content">
            <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
            <header class="modal-header">
                <div class="editable-field model-name-field">
                    <h2 class="model-name-content" contenteditable="true" spellcheck="false">${lora.model_name}</h2>
                    <button class="save-btn" onclick="saveModelName('${lora.file_path}')">
                        <i class="fas fa-save"></i>
                    </button>
                </div>
                ${renderTags(lora.tags || [])}
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
                            <div class="file-name-wrapper" onclick="copyFileName('${lora.file_name}')">
                                <span id="file-name">${lora.file_name || 'N/A'}</span>
                                <i class="fas fa-copy" title="Copy file name"></i>
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
                                <span>${lora.base_model || 'N/A'}</span>
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
                        ${renderTriggerWords(escapedWords)}
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
                            <div class="description-text">${lora.description || 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <div class="showcase-section" data-lora-id="${lora.civitai?.modelId || ''}">
                    <div class="showcase-tabs">
                        <button class="tab-btn active" data-tab="showcase">Examples</button>
                        <button class="tab-btn" data-tab="description">Model Description</button>
                    </div>
                    
                    <div class="tab-content">
                        <div id="showcase-tab" class="tab-pane active">
                            ${renderShowcaseContent(lora.civitai?.images)}
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
                    </div>
                    
                    <button class="back-to-top" onclick="scrollToTop(this)">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    modalManager.showModal('loraModal', content);
    setupEditableFields();
    setupShowcaseScroll();
    setupTabSwitching();
    
    // If we have a model ID but no description, fetch it
    if (lora.civitai?.modelId && !lora.modelDescription) {
        loadModelDescription(lora.civitai.modelId, lora.file_path);
    }
}

// Function to render showcase content
function renderShowcaseContent(images) {
    if (!images?.length) return '<div class="no-examples">No example images available</div>';
    
    return `
        <div class="scroll-indicator" onclick="toggleShowcase(this)">
            <i class="fas fa-chevron-down"></i>
            <span>Scroll or click to show ${images.length} examples</span>
        </div>
        <div class="carousel collapsed">
            <div class="carousel-container">
                ${images.map(img => {
                    // 计算适当的展示高度：
                    // 1. 保持原始宽高比
                    // 2. 限制最大高度为视窗高度的60%
                    // 3. 确保最小高度为容器宽度的40%
                    const aspectRatio = (img.height / img.width) * 100;
                    const containerWidth = 800; // modal content的最大宽度
                    const minHeightPercent = 40; // 最小高度为容器宽度的40%
                    const maxHeightPercent = (window.innerHeight * 0.6 / containerWidth) * 100;
                    const heightPercent = Math.max(
                        minHeightPercent,
                        Math.min(maxHeightPercent, aspectRatio)
                    );
                    
                    if (img.type === 'video') {
                        return `
                            <div class="media-wrapper" style="padding-bottom: ${heightPercent}%">
                                <video controls autoplay muted loop crossorigin="anonymous" 
                                       referrerpolicy="no-referrer" data-src="${img.url}"
                                       class="lazy">
                                    <source data-src="${img.url}" type="video/mp4">
                                    Your browser does not support video playback
                                </video>
                            </div>
                        `;
                    }
                    return `
                        <div class="media-wrapper" style="padding-bottom: ${heightPercent}%">
                            <img data-src="${img.url}" 
                                 alt="Preview" 
                                 crossorigin="anonymous" 
                                 referrerpolicy="no-referrer"
                                 width="${img.width}"
                                 height="${img.height}"
                                 class="lazy"> 
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// New function to handle tab switching
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.showcase-tabs .tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs
            document.querySelectorAll('.showcase-tabs .tab-btn').forEach(btn => 
                btn.classList.remove('active')
            );
            document.querySelectorAll('.tab-content .tab-pane').forEach(tab => 
                tab.classList.remove('active')
            );
            
            // Add active class to clicked tab
            button.classList.add('active');
            const tabId = `${button.dataset.tab}-tab`;
            document.getElementById(tabId).classList.add('active');
            
            // If switching to description tab, make sure content is properly sized
            if (button.dataset.tab === 'description') {
                const descriptionContent = document.querySelector('.model-description-content');
                if (descriptionContent && descriptionContent.innerHTML.trim() !== '') {
                    document.querySelector('.model-description-loading')?.classList.add('hidden');
                }
            }
        });
    });
}

// New function to load model description
async function loadModelDescription(modelId, filePath) {
    try {
        const descriptionContainer = document.querySelector('.model-description-content');
        const loadingElement = document.querySelector('.model-description-loading');
        
        if (!descriptionContainer || !loadingElement) return;
        
        // Show loading indicator
        loadingElement.classList.remove('hidden');
        descriptionContainer.classList.add('hidden');
        
        // Try to get model description from API
        const response = await fetch(`/api/lora-model-description?model_id=${modelId}&file_path=${encodeURIComponent(filePath)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch model description: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.description) {
            // Update the description content
            descriptionContainer.innerHTML = data.description;
            
            // Process any links in the description to open in new tab
            const links = descriptionContainer.querySelectorAll('a');
            links.forEach(link => {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            });
            
            // Show the description and hide loading indicator
            descriptionContainer.classList.remove('hidden');
            loadingElement.classList.add('hidden');
        } else {
            throw new Error(data.error || 'No description available');
        }
    } catch (error) {
        console.error('Error loading model description:', error);
        const loadingElement = document.querySelector('.model-description-loading');
        if (loadingElement) {
            loadingElement.innerHTML = `<div class="error-message">Failed to load model description. ${error.message}</div>`;
        }
    }
}

// 添加复制文件名的函数
window.copyFileName = async function(fileName) {
    try {
        await navigator.clipboard.writeText(fileName);
        showToast('File name copied', 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    }
};

// Add function to save model name
window.saveModelName = async function(filePath) {
    const modelNameElement = document.querySelector('.model-name-content');
    const newModelName = modelNameElement.textContent.trim();
    
    // Validate model name
    if (!newModelName) {
        showToast('Model name cannot be empty', 'error');
        return;
    }
    
    // Check if model name is too long (limit to 100 characters)
    if (newModelName.length > 100) {
        showToast('Model name is too long (maximum 100 characters)', 'error');
        // Truncate the displayed text
        modelNameElement.textContent = newModelName.substring(0, 100);
        return;
    }
    
    try {
        await saveModelMetadata(filePath, { model_name: newModelName });
        
        // Update the corresponding lora card's dataset and display
        const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
        if (loraCard) {
            loraCard.dataset.model_name = newModelName;
            const titleElement = loraCard.querySelector('.card-title');
            if (titleElement) {
                titleElement.textContent = newModelName;
            }
        }
        
        showToast('Model name updated successfully', 'success');
        
        // Reload the page to reflect the sorted order
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    } catch (error) {
        showToast('Failed to update model name', 'error');
    }
};

function setupEditableFields() {
    const editableFields = document.querySelectorAll('.editable-field [contenteditable]');
    
    editableFields.forEach(field => {
        field.addEventListener('focus', function() {
            if (this.textContent === 'Add your notes here...' || 
                this.textContent === 'Save usage tips here..') {
                this.textContent = '';
            }
        });

        field.addEventListener('blur', function() {
            if (this.textContent.trim() === '') {
                if (this.classList.contains('model-name-content')) {
                    // Restore original model name if empty
                    const filePath = document.querySelector('.modal-content')
                        .querySelector('.file-path').textContent + 
                        document.querySelector('.modal-content')
                        .querySelector('#file-name').textContent + '.safetensors';
                    const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
                    if (loraCard) {
                        this.textContent = loraCard.dataset.model_name;
                    }
                } else if (this.classList.contains('usage-tips-content')) {
                    this.textContent = 'Save usage tips here..';
                } else {
                    this.textContent = 'Add your notes here...';
                }
            }
        });
        
        // Add input validation for model name
        if (field.classList.contains('model-name-content')) {
            field.addEventListener('input', function() {
                // Limit model name length
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
            
            field.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const filePath = document.querySelector('.modal-content')
                        .querySelector('.file-path').textContent + 
                        document.querySelector('.modal-content')
                        .querySelector('#file-name').textContent + '.safetensors';
                    saveModelName(filePath);
                }
            });
        }
    });

    const presetSelector = document.getElementById('preset-selector');
    const presetValue = document.getElementById('preset-value');
    const addPresetBtn = document.querySelector('.add-preset-btn');
    const presetTags = document.querySelector('.preset-tags');

    presetSelector.addEventListener('change', function() {
        const selected = this.value;
        if (selected) {
            presetValue.style.display = 'inline-block';
            presetValue.min = selected.includes('strength') ? 0 : 1;
            presetValue.max = selected.includes('strength') ? 1 : 12;
            presetValue.step = selected.includes('strength') ? 0.01 : 1;
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

        const filePath = document.querySelector('.modal-content')
            .querySelector('.file-path').textContent + 
            document.querySelector('.modal-content')
            .querySelector('#file-name').textContent + '.safetensors';

        const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
        const currentPresets = parsePresets(loraCard.dataset.usage_tips);
        
        currentPresets[key] = parseFloat(value);
        const newPresetsJson = JSON.stringify(currentPresets);

        await saveModelMetadata(filePath, { 
            usage_tips: newPresetsJson
        });

        loraCard.dataset.usage_tips = newPresetsJson;
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
                const filePath = document.querySelector('.modal-content')
                    .querySelector('.file-path').textContent + 
                    document.querySelector('.modal-content')
                    .querySelector('#file-name').textContent + '.safetensors';
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

window.saveNotes = async function(filePath) {
    const content = document.querySelector('.notes-content').textContent;
    try {
        await saveModelMetadata(filePath, { notes: content });

        // Update the corresponding lora card's dataset
        const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
        if (loraCard) {
            loraCard.dataset.notes = content;
        }

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
    if (!words.length) return `
        <div class="info-item full-width trigger-words">
            <label>Trigger Words</label>
            <span>No trigger word needed</span>
        </div>
    `;
    
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
    return renderShowcaseContent(images);
}

export function toggleShowcase(element) {
    const carousel = element.nextElementSibling;
    const isCollapsed = carousel.classList.contains('collapsed');
    const indicator = element.querySelector('span');
    const icon = element.querySelector('i');
    
    carousel.classList.toggle('collapsed');
    
    if (isCollapsed) {
        const count = carousel.querySelectorAll('.media-wrapper').length;
        indicator.textContent = `Scroll or click to hide examples`;
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        initLazyLoading(carousel);
    } else {
        const count = carousel.querySelectorAll('.media-wrapper').length;
        indicator.textContent = `Scroll or click to show ${count} examples`;
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

// Add lazy loading initialization
function initLazyLoading(container) {
    const lazyElements = container.querySelectorAll('.lazy');
    
    const lazyLoad = (element) => {
        if (element.tagName.toLowerCase() === 'video') {
            element.src = element.dataset.src;
            element.querySelector('source').src = element.dataset.src;
            element.load();
        } else {
            element.src = element.dataset.src;
        }
        element.classList.remove('lazy');
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                lazyLoad(entry.target);
                observer.unobserve(entry.target);
            }
        });
    });

    lazyElements.forEach(element => observer.observe(element));
}

export function setupShowcaseScroll() {
    // Change from modal-content to window/document level
    document.addEventListener('wheel', (event) => {
        const modalContent = document.querySelector('.modal-content');
        if (!modalContent) return;

        const showcase = modalContent.querySelector('.showcase-section');
        if (!showcase) return;
        
        const carousel = showcase.querySelector('.carousel');
        const scrollIndicator = showcase.querySelector('.scroll-indicator');
        
        if (carousel?.classList.contains('collapsed') && event.deltaY > 0) {
            const isNearBottom = modalContent.scrollHeight - modalContent.scrollTop - modalContent.clientHeight < 100;
            
            if (isNearBottom) {
                toggleShowcase(scrollIndicator);
                event.preventDefault();
            }
        }
    }, { passive: false }); // Add passive: false option here

    // Keep the existing scroll tracking code
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        modalContent.addEventListener('scroll', () => {
            const backToTopBtn = modalContent.querySelector('.back-to-top');
            if (backToTopBtn) {
                if (modalContent.scrollTop > 300) {
                    backToTopBtn.classList.add('visible');
                } else {
                    backToTopBtn.classList.remove('visible');
                }
            }
        });
    }
}

export function scrollToTop(button) {
    const modalContent = button.closest('.modal-content');
    if (modalContent) {
        modalContent.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

function parsePresets(usageTips) {
    if (!usageTips || usageTips === 'Save usage tips here..') return {};
    try {
        return JSON.parse(usageTips);
    } catch {
        return {};
    }
}

function renderPresetTags(presets) {
    return Object.entries(presets).map(([key, value]) => `
        <div class="preset-tag" data-key="${key}">
            <span>${formatPresetKey(key)}: ${value}</span>
            <i class="fas fa-times" onclick="removePreset('${key}')"></i>
        </div>
    `).join('');
}

function formatPresetKey(key) {
    return key.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

window.removePreset = async function(key) {
    const filePath = document.querySelector('.modal-content')
            .querySelector('.file-path').textContent + 
            document.querySelector('.modal-content')
            .querySelector('#file-name').textContent + '.safetensors';
    const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
    const currentPresets = parsePresets(loraCard.dataset.usage_tips);
    
    delete currentPresets[key];
    const newPresetsJson = JSON.stringify(currentPresets);

    await saveModelMetadata(filePath, { 
        usage_tips: newPresetsJson 
    });
    
    loraCard.dataset.usage_tips = newPresetsJson;
    document.querySelector('.preset-tags').innerHTML = renderPresetTags(currentPresets);
};

// 添加文件大小格式化函数
function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Function to render model tags
function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    
    return `
        <div class="model-tags">
            ${tags.map(tag => `
                <span class="model-tag" onclick="copyTag('${tag.replace(/'/g, "\\'")}')">
                    ${tag}
                    <i class="fas fa-copy"></i>
                </span>
            `).join('')}
        </div>
    `;
}

// Add tag copy functionality
window.copyTag = async function(tag) {
    try {
        await navigator.clipboard.writeText(tag);
        showToast('Tag copied to clipboard', 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    }
};