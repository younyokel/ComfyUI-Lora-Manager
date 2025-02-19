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
    card.dataset.base_model = lora.base_model;
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
        const loraMeta = {
            sha256: card.dataset.sha256,
            file_path: card.dataset.filepath.replace(/[^/]+$/, ''), // Extract directory path
            model_name: card.dataset.name,
            file_name: card.dataset.file_name,
            folder: card.dataset.folder,
            modified: card.dataset.modified,
            from_civitai: card.dataset.from_civitai === 'true',
            base_model: card.dataset.base_model,
            civitai: JSON.parse(card.dataset.meta || '{}')
        };
        showLoraModal(loraMeta);
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
            <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
            <header class="modal-header">
                <h2>${lora.model_name}</h2>
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
                            <span>${lora.civitai.name || 'N/A'}</span>
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
                                <div class="usage-tips-content" contenteditable="true" spellcheck="false">${lora.usage_tips || 'Save usage tips here..'}</div>
                                <button class="save-btn" onclick="saveUsageTips('${lora.file_path}')">
                                    <i class="fas fa-save"></i>
                                </button>
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

                ${renderShowcaseImages(lora.civitai.images)}
            </div>
        </div>
    `;
    
    modalManager.showModal('loraModal', content);
    setupEditableFields();
    setupShowcaseScroll(); // Add this line
}

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
                this.textContent = this.classList.contains('usage-tips-content') 
                    ? 'Save usage tips here..' 
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
    if (!images?.length) return '';
    
    return `
        <div class="showcase-section">
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
            <button class="back-to-top" onclick="scrollToTop(this)">
                <i class="fas fa-arrow-up"></i>
            </button>
        </div>
    `;
}

// Add this to the window object for global access
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
};

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
    });

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