import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { modalManager } from '../managers/ModalManager.js';
import { NSFW_LEVELS } from '../utils/constants.js';

export function showLoraModal(lora) {
    const escapedWords = lora.civitai?.trainedWords?.length ? 
        lora.civitai.trainedWords.map(word => word.replace(/'/g, '\\\'')) : [];

    const content = `
        <div class="modal-content">
            <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
            <header class="modal-header">
                <div class="model-name-header">
                    <h2 class="model-name-content" contenteditable="true" spellcheck="false">${lora.model_name}</h2>
                    <button class="edit-model-name-btn" title="Edit model name">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
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
    setupTagTooltip();
    setupTriggerWordsEditMode();
    setupModelNameEditing();
    
    // If we have a model ID but no description, fetch it
    if (lora.civitai?.modelId && !lora.modelDescription) {
        loadModelDescription(lora.civitai.modelId, lora.file_path);
    }
}

// Function to render showcase content
function renderShowcaseContent(images) {
    if (!images?.length) return '<div class="no-examples">No example images available</div>';
    
    // Filter images based on SFW setting
    const showOnlySFW = state.settings.show_only_sfw;
    let filteredImages = images;
    let hiddenCount = 0;
    
    if (showOnlySFW) {
        filteredImages = images.filter(img => {
            const nsfwLevel = img.nsfwLevel !== undefined ? img.nsfwLevel : 0;
            const isSfw = nsfwLevel < NSFW_LEVELS.R;
            if (!isSfw) hiddenCount++;
            return isSfw;
        });
    }
    
    // Show message if no images are available after filtering
    if (filteredImages.length === 0) {
        return `
            <div class="no-examples">
                <p>All example images are filtered due to NSFW content settings</p>
                <p class="nsfw-filter-info">Your settings are currently set to show only safe-for-work content</p>
                <p>You can change this in Settings <i class="fas fa-cog"></i></p>
            </div>
        `;
    }
    
    // Show hidden content notification if applicable
    const hiddenNotification = hiddenCount > 0 ? 
        `<div class="nsfw-filter-notification">
            <i class="fas fa-eye-slash"></i> ${hiddenCount} ${hiddenCount === 1 ? 'image' : 'images'} hidden due to SFW-only setting
        </div>` : '';
    
    return `
        <div class="scroll-indicator" onclick="toggleShowcase(this)">
            <i class="fas fa-chevron-down"></i>
            <span>Scroll or click to show ${filteredImages.length} examples</span>
        </div>
        <div class="carousel collapsed">
            ${hiddenNotification}
            <div class="carousel-container">
                ${filteredImages.map(img => {
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
                    
                    // Check if image should be blurred
                    const nsfwLevel = img.nsfwLevel !== undefined ? img.nsfwLevel : 0;
                    const shouldBlur = state.settings.blurMatureContent && nsfwLevel > NSFW_LEVELS.PG13;
                    
                    // Determine NSFW warning text based on level
                    let nsfwText = "Mature Content";
                    if (nsfwLevel >= NSFW_LEVELS.XXX) {
                        nsfwText = "XXX-rated Content";
                    } else if (nsfwLevel >= NSFW_LEVELS.X) {
                        nsfwText = "X-rated Content";
                    } else if (nsfwLevel >= NSFW_LEVELS.R) {
                        nsfwText = "R-rated Content";
                    }
                    
                    if (img.type === 'video') {
                        return `
                            <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
                                ${shouldBlur ? `
                                    <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                ` : ''}
                                <video controls autoplay muted loop crossorigin="anonymous" 
                                       referrerpolicy="no-referrer" data-src="${img.url}"
                                       class="lazy ${shouldBlur ? 'blurred' : ''}">
                                    <source data-src="${img.url}" type="video/mp4">
                                    Your browser does not support video playback
                                </video>
                                ${shouldBlur ? `
                                    <div class="nsfw-overlay">
                                        <div class="nsfw-warning">
                                            <p>${nsfwText}</p>
                                            <button class="show-content-btn">Show</button>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }
                    return `
                        <div class="media-wrapper ${shouldBlur ? 'nsfw-media-wrapper' : ''}" style="padding-bottom: ${heightPercent}%">
                            ${shouldBlur ? `
                                <button class="toggle-blur-btn showcase-toggle-btn" title="Toggle blur">
                                    <i class="fas fa-eye"></i>
                                </button>
                            ` : ''}
                            <img data-src="${img.url}" 
                                alt="Preview" 
                                crossorigin="anonymous" 
                                referrerpolicy="no-referrer"
                                width="${img.width}"
                                height="${img.height}"
                                class="lazy ${shouldBlur ? 'blurred' : ''}"> 
                            ${shouldBlur ? `
                                <div class="nsfw-overlay">
                                    <div class="nsfw-warning">
                                        <p>${nsfwText}</p>
                                        <button class="show-content-btn">Show</button>
                                    </div>
                                </div>
                            ` : ''}
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
                if (descriptionContent) {
                    const hasContent = descriptionContent.innerHTML.trim() !== '';
                    document.querySelector('.model-description-loading')?.classList.add('hidden');
                    
                    // If no content, show a message
                    if (!hasContent) {
                        descriptionContent.innerHTML = '<div class="no-description">No model description available</div>';
                        descriptionContent.classList.remove('hidden');
                    }
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
        
        // Show empty state message in the description container
        const descriptionContainer = document.querySelector('.model-description-content');
        if (descriptionContainer) {
            descriptionContainer.innerHTML = '<div class="no-description">No model description available</div>';
            descriptionContainer.classList.remove('hidden');
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
            presetValue.min = selected.includes('strength') ? 0 : 1;
            presetValue.max = selected.includes('strength') ? 1 : 12;
            presetValue.step = selected.includes('strength') ? 0.5 : 1;
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

function renderTriggerWords(words, filePath) {
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
        
        // Initialize NSFW content blur toggle handlers
        initNsfwBlurHandlers(carousel);
    } else {
        const count = carousel.querySelectorAll('.media-wrapper').length;
        indicator.textContent = `Scroll or click to show ${count} examples`;
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

// New function to initialize blur toggle handlers for showcase images/videos
function initNsfwBlurHandlers(container) {
    // Handle toggle blur buttons
    const toggleButtons = container.querySelectorAll('.toggle-blur-btn');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = btn.closest('.media-wrapper');
            const media = wrapper.querySelector('img, video');
            const isBlurred = media.classList.toggle('blurred');
            const icon = btn.querySelector('i');
            
            // Update the icon based on blur state
            if (isBlurred) {
                icon.className = 'fas fa-eye';
            } else {
                icon.className = 'fas fa-eye-slash';
            }
            
            // Toggle the overlay visibility
            const overlay = wrapper.querySelector('.nsfw-overlay');
            if (overlay) {
                overlay.style.display = isBlurred ? 'flex' : 'none';
            }
        });
    });
    
    // Handle "Show" buttons in overlays
    const showButtons = container.querySelectorAll('.show-content-btn');
    showButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = btn.closest('.media-wrapper');
            const media = wrapper.querySelector('img, video');
            media.classList.remove('blurred');
            
            // Update the toggle button icon
            const toggleBtn = wrapper.querySelector('.toggle-blur-btn');
            if (toggleBtn) {
                toggleBtn.querySelector('i').className = 'fas fa-eye-slash';
            }
            
            // Hide the overlay
            const overlay = wrapper.querySelector('.nsfw-overlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        });
    });
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
    if (!usageTips) return {};
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

// New function to render compact tags with tooltip
function renderCompactTags(tags) {
    if (!tags || tags.length === 0) return '';
    
    // Display up to 5 tags, with a tooltip indicator if there are more
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

// Setup tooltip functionality
function setupTagTooltip() {
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

// Set up trigger words edit mode
function setupTriggerWordsEditMode() {
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

// Function to add a new trigger word
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
    if (currentTags.length >= 10) {
        showToast('Maximum 10 trigger words allowed', 'error');
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

// Function to save updated trigger words
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
                
                // For debugging, log the updated data to verify it's correct
                console.log("Updated civitai data:", civitaiData);
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

// Add copy trigger word function
window.copyTriggerWord = async function(word) {
    try {
        await navigator.clipboard.writeText(word);
        showToast('Trigger word copied', 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    }
};

// New function to handle model name editing
function setupModelNameEditing() {
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
            const filePath = document.querySelector('.modal-content')
                .querySelector('.file-path').textContent + 
                document.querySelector('.modal-content')
                .querySelector('#file-name').textContent + '.safetensors';
            const loraCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
            if (loraCard) {
                this.textContent = loraCard.dataset.model_name;
            }
        }
    });
    
    // Handle enter key
    modelNameContent.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const filePath = document.querySelector('.modal-content')
                .querySelector('.file-path').textContent + 
                document.querySelector('.modal-content')
                .querySelector('#file-name').textContent + '.safetensors';
            saveModelName(filePath);
            this.blur();
        }
    });
    
    // Limit model name length
    modelNameContent.addEventListener('input', function() {
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
}