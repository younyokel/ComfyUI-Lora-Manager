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
                       ${lora.from_civitai ? 
                           `onclick="event.stopPropagation(); openCivitai('${lora.model_name}')"` : 
                           'style="opacity: 0.5; cursor: not-allowed"'}>
                    </i>
                    <i class="fas fa-copy" 
                       title="Copy Model Name"
                       onclick="event.stopPropagation(); navigator.clipboard.writeText('${lora.file_name}').then(() => showToast('Model name copied', 'success')).catch(() => showToast('Copy failed', 'error'))">
                    </i>
                    <i class="fas fa-trash" 
                       title="Delete Model"
                       onclick="event.stopPropagation(); deleteModel('${lora.file_path}')">
                    </i>
                </div>
            </div>
            <div class="card-footer">
                <div class="model-info">
                    <span class="model-name">${lora.model_name}</span>
                </div>
                <div class="card-actions">
                    <i class="fas fa-image" 
                       title="Replace Preview Image"
                       onclick="event.stopPropagation(); replacePreview('${lora.file_path}')">
                    </i>
                </div>
            </div>
        </div>
    `;

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

    return card;
}

export function showLoraModal(lora) {
    const escapedWords = lora.trainedWords?.length ? 
        lora.trainedWords.map(word => word.replace(/'/g, '\\\'')) : [];

    const categories = {};
    escapedWords.forEach(word => {
        const category = word.includes(':') ? word.split(':')[0] : 'General';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(word);
    });
        
    const imageMarkup = lora.images.map(img => {
        if (img.type === 'video') {
            return `<video controls autoplay muted loop crossorigin="anonymous" referrerpolicy="no-referrer">
                     <source src="${img.url}" type="video/mp4">
                     Your browser does not support the video tag.
                   </video>`;
        } else {
            return `<img src="${img.url}" alt="Preview" 
                        crossorigin="anonymous" 
                        referrerpolicy="no-referrer" 
                        loading="lazy">`;
        }
    }).join('');
 
    const triggerWordsMarkup = escapedWords.length ? `
        <div class="trigger-words-container">
            <div class="trigger-words-title">Trigger Words</div>
            <div class="trigger-words-tags">
                ${escapedWords.map(word => `
                    <div class="trigger-word-tag" onclick="copyTriggerWord('${word}')">
                        <span class="trigger-word-content">${word}</span>
                        <span class="trigger-word-copy">
                            <svg width="14" height="14" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '<div class="trigger-words-container">No trigger words</div>';
    
    const content = `
        <div class="modal-content">
            <h2>${lora.model.name}</h2>
            <div class="carousel">
                ${imageMarkup}
            </div>
            <div class="description">About this version: ${lora.description || 'N/A'}</div>
            ${triggerWordsMarkup}
            <div class="model-link">
                <a href="https://civitai.com/models/${lora.modelId}?modelVersionId=${lora.id}" 
                   target="_blank">more details on CivitAI</a>
            </div>
            <button class="close" onclick="modalManager.closeModal('loraModal')">&times;</button>
        </div>
    `;
    
    modalManager.showModal('loraModal', content);

    document.querySelectorAll('.trigger-category').forEach(category => {
        category.addEventListener('click', function() {
            const categoryName = this.dataset.category;
            document.querySelectorAll('.trigger-category').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            const wordsList = document.querySelector('.trigger-words-list');
            wordsList.innerHTML = categories[categoryName].map(word => `
                <div class="trigger-word-tag" onclick="copyTriggerWord('${word}')">
                    <span class="trigger-word-content">${word}</span>
                    <span class="trigger-word-copy">
                        <svg width="14" height="14" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                    </span>
                </div>
            `).join('');
        });
    });
}

export function initializeLoraCards() {
    document.querySelectorAll('.lora-card').forEach(card => {
        card.addEventListener('click', () => {
            const meta = JSON.parse(card.dataset.meta || '{}');
            if (Object.keys(meta).length) {
                showLoraModal(meta);
            } else {
                showToast(card.dataset.from_civitai === 'True'
                    ? 'Click "Fetch" to retrieve metadata'
                    : 'No CivitAI information available', 'info');
            }
        });

        card.querySelector('.fa-copy')?.addEventListener('click', e => {
            e.stopPropagation();
            navigator.clipboard.writeText(card.dataset.file_name)
                .then(() => showToast('Model name copied', 'success'))
                .catch(() => showToast('Copy failed', 'error'));
        });
    });
}