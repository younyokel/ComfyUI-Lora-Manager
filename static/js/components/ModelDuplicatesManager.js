// Model Duplicates Manager Component for LoRAs and Checkpoints
import { showToast } from '../utils/uiHelpers.js';
import { state, getCurrentPageState } from '../state/index.js';
import { formatDate } from '../utils/formatters.js';

export class ModelDuplicatesManager {
    constructor(pageManager, modelType = 'loras') {
        this.pageManager = pageManager;
        this.duplicateGroups = [];
        this.inDuplicateMode = false;
        this.selectedForDeletion = new Set();
        this.modelType = modelType; // Use the provided modelType or default to 'loras'
        
        // Bind methods
        this.renderModelCard = this.renderModelCard.bind(this);
        this.renderTooltip = this.renderTooltip.bind(this);
    }
    
    async findDuplicates() {
        try {
            // Determine API endpoint based on model type
            const endpoint = `/api/${this.modelType}/find-duplicates`;
            
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`Failed to find duplicates: ${response.statusText}`);
            }
            
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Unknown error finding duplicates');
            }
            
            this.duplicateGroups = data.duplicates || [];
            
            if (this.duplicateGroups.length === 0) {
                showToast('No duplicate models found', 'info');
                return false;
            }
            
            this.enterDuplicateMode();
            return true;
        } catch (error) {
            console.error('Error finding duplicates:', error);
            showToast('Failed to find duplicates: ' + error.message, 'error');
            return false;
        }
    }
    
    enterDuplicateMode() {
        this.inDuplicateMode = true;
        this.selectedForDeletion.clear();
        
        // Update state
        const pageState = getCurrentPageState();
        pageState.duplicatesMode = true;
        
        // Show duplicates banner
        const banner = document.getElementById('duplicatesBanner');
        const countSpan = document.getElementById('duplicatesCount');
        
        if (banner && countSpan) {
            countSpan.textContent = `Found ${this.duplicateGroups.length} duplicate group${this.duplicateGroups.length !== 1 ? 's' : ''}`;
            banner.style.display = 'block';
        }
        
        // Disable virtual scrolling if active
        if (state.virtualScroller) {
            state.virtualScroller.disable();
        }
        
        // Add duplicate-mode class to the body
        document.body.classList.add('duplicate-mode');
        
        // Render duplicate groups
        this.renderDuplicateGroups();
        
        // Update selected count
        this.updateSelectedCount();
    }
    
    exitDuplicateMode() {
        this.inDuplicateMode = false;
        this.selectedForDeletion.clear();
        
        // Update state
        const pageState = getCurrentPageState();
        pageState.duplicatesMode = false;
        
        // Instead of trying to restore the virtual scroller,
        // simply redirect to reload the page
        // TODO: While this is a workaround rather than a deep fix, it's a pragmatic solution that will immediately resolve the issue for users. We can investigate the underlying cause more thoroughly later when there's time for more extensive debugging.
        window.location.href = `/${this.modelType}`;
    }
    
    renderDuplicateGroups() {
        const modelGrid = document.getElementById(this.modelType === 'loras' ? 'loraGrid' : 'checkpointGrid');
        if (!modelGrid) return;
        
        // Clear existing content
        modelGrid.innerHTML = '';
        
        // Render each duplicate group
        this.duplicateGroups.forEach((group, groupIndex) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'duplicate-group';
            groupDiv.dataset.hash = group.hash;
            
            // Create group header
            const header = document.createElement('div');
            header.className = 'duplicate-group-header';
            header.innerHTML = `
                <span>Duplicate Group #${groupIndex + 1} (${group.models.length} models with same hash: ${group.hash})</span>
                <span>
                    <button class="btn-select-all" onclick="modelDuplicatesManager.toggleSelectAllInGroup('${group.hash}')">
                        Select All
                    </button>
                </span>
            `;
            groupDiv.appendChild(header);
            
            // Create cards container
            const cardsDiv = document.createElement('div');
            cardsDiv.className = 'card-group-container';
            
            // Add scrollable class if there are many models in the group
            if (group.models.length > 6) {
                cardsDiv.classList.add('scrollable');
                
                // Add expand/collapse toggle button
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'group-toggle-btn';
                toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                toggleBtn.title = "Expand/Collapse";
                toggleBtn.onclick = function() {
                    cardsDiv.classList.toggle('scrollable');
                    this.innerHTML = cardsDiv.classList.contains('scrollable') ? 
                        '<i class="fas fa-chevron-down"></i>' : 
                        '<i class="fas fa-chevron-up"></i>';
                };
                groupDiv.appendChild(toggleBtn);
            }
            
            // Add all model cards in this group
            group.models.forEach(model => {
                const card = this.renderModelCard(model, group.hash);
                cardsDiv.appendChild(card);
            });
            
            groupDiv.appendChild(cardsDiv);
            modelGrid.appendChild(groupDiv);
        });
    }
    
    renderModelCard(model, groupHash) {
        // Create basic card structure
        const card = document.createElement('div');
        card.className = 'lora-card duplicate';
        card.dataset.hash = model.sha256;
        card.dataset.filePath = model.file_path;
        
        // Create card content using structure similar to createLoraCard in LoraCard.js
        const previewContainer = document.createElement('div');
        previewContainer.className = 'card-preview';
        
        // Determine if preview is a video
        const isVideo = model.preview_url && model.preview_url.endsWith('.mp4');
        let preview;
        
        if (isVideo) {
            // Create video element for MP4 previews
            preview = document.createElement('video');
            preview.loading = 'lazy';
            preview.controls = true;
            preview.muted = true;
            preview.loop = true;
            
            const source = document.createElement('source');
            source.src = model.preview_url;
            source.type = 'video/mp4';
            preview.appendChild(source);
        } else {
            // Create image element for standard previews
            preview = document.createElement('img');
            preview.loading = 'lazy';
            preview.alt = model.model_name;
            
            if (model.preview_url) {
                preview.src = model.preview_url;
            } else {
                // Use placeholder
                preview.src = '/loras_static/images/no-preview.png';
            }
        }
        
        // Add NSFW blur if needed
        if (model.preview_nsfw_level > 0) {
            preview.classList.add('nsfw');
        }
        
        previewContainer.appendChild(preview);
        
        // Move tooltip listeners to the preview container for consistent behavior
        // regardless of whether the preview is an image or video
        previewContainer.addEventListener('mouseover', () => this.renderTooltip(card, model));
        previewContainer.addEventListener('mouseout', () => {
            const tooltip = document.querySelector('.model-tooltip');
            if (tooltip) tooltip.remove();
        });
        
        // Add card footer with just model name
        const footer = document.createElement('div');
        footer.className = 'card-footer';
        
        const modelInfo = document.createElement('div');
        modelInfo.className = 'model-info';
        
        const modelName = document.createElement('span');
        modelName.className = 'model-name';
        modelName.textContent = model.model_name;
        modelInfo.appendChild(modelName);
        
        footer.appendChild(modelInfo);
        previewContainer.appendChild(footer);
        card.appendChild(previewContainer);
        
        // Add selection checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'selector-checkbox';
        checkbox.dataset.filePath = model.file_path;
        checkbox.dataset.groupHash = groupHash;
        
        // Check if already selected
        if (this.selectedForDeletion.has(model.file_path)) {
            checkbox.checked = true;
            card.classList.add('duplicate-selected');
        }
        
        // Add change event to checkbox
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.toggleCardSelection(model.file_path, card, checkbox);
        });
        
        // Make the entire card clickable for selection
        card.addEventListener('click', (e) => {
            // Don't toggle if clicking on the checkbox directly or card actions
            if (e.target === checkbox || e.target.closest('.card-actions')) {
                return;
            }
            
            // Toggle checkbox state
            checkbox.checked = !checkbox.checked;
            this.toggleCardSelection(model.file_path, card, checkbox);
        });
        
        card.appendChild(checkbox);
        return card;
    }
    
    renderTooltip(card, model) {
        // Remove any existing tooltips
        const existingTooltip = document.querySelector('.model-tooltip');
        if (existingTooltip) existingTooltip.remove();
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'model-tooltip';
        
        // Add model information to tooltip
        tooltip.innerHTML = `
            <div class="tooltip-header">${model.model_name}</div>
            <div class="tooltip-info">
                <div><strong>Version:</strong> ${model.civitai?.name || 'Unknown'}</div>
                <div><strong>Filename:</strong> ${model.file_name}</div>
                <div><strong>Path:</strong> ${model.file_path}</div>
                <div><strong>Base Model:</strong> ${model.base_model || 'Unknown'}</div>
                <div><strong>Modified:</strong> ${formatDate(model.modified)}</div>
            </div>
        `;
        
        // Position tooltip relative to card
        const cardRect = card.getBoundingClientRect();
        tooltip.style.top = `${cardRect.top + window.scrollY - 10}px`;
        tooltip.style.left = `${cardRect.left + window.scrollX + cardRect.width + 10}px`;
        
        // Add tooltip to document
        document.body.appendChild(tooltip);
        
        // Check if tooltip is outside viewport and adjust if needed
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = `${cardRect.left + window.scrollX - tooltipRect.width - 10}px`;
        }
    }
    
    // Helper method to toggle card selection state
    toggleCardSelection(filePath, card, checkbox) {
        if (checkbox.checked) {
            this.selectedForDeletion.add(filePath);
            card.classList.add('duplicate-selected');
        } else {
            this.selectedForDeletion.delete(filePath);
            card.classList.remove('duplicate-selected');
        }
        
        this.updateSelectedCount();
    }
    
    updateSelectedCount() {
        const selectedCountEl = document.getElementById('duplicatesSelectedCount');
        if (selectedCountEl) {
            selectedCountEl.textContent = this.selectedForDeletion.size;
        }
        
        // Update delete button state
        const deleteBtn = document.querySelector('.btn-delete-selected');
        if (deleteBtn) {
            deleteBtn.disabled = this.selectedForDeletion.size === 0;
            deleteBtn.classList.toggle('disabled', this.selectedForDeletion.size === 0);
        }
    }
    
    toggleSelectAllInGroup(hash) {
        const checkboxes = document.querySelectorAll(`.selector-checkbox[data-group-hash="${hash}"]`);
        const allSelected = Array.from(checkboxes).every(checkbox => checkbox.checked);
        
        // If all are selected, deselect all; otherwise select all
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allSelected;
            const filePath = checkbox.dataset.filePath;
            const card = checkbox.closest('.lora-card');
            
            if (!allSelected) {
                this.selectedForDeletion.add(filePath);
                card.classList.add('duplicate-selected');
            } else {
                this.selectedForDeletion.delete(filePath);
                card.classList.remove('duplicate-selected');
            }
        });
        
        // Update the button text
        const button = document.querySelector(`.duplicate-group[data-hash="${hash}"] .btn-select-all`);
        if (button) {
            button.textContent = !allSelected ? "Deselect All" : "Select All";
        }
        
        this.updateSelectedCount();
    }
    
    async deleteSelectedDuplicates() {
        if (this.selectedForDeletion.size === 0) {
            showToast('No models selected for deletion', 'info');
            return;
        }
        
        try {
            // Show the delete confirmation modal instead of a simple confirm
            const modelDuplicateDeleteCount = document.getElementById('modelDuplicateDeleteCount');
            if (modelDuplicateDeleteCount) {
              modelDuplicateDeleteCount.textContent = this.selectedForDeletion.size;
            }
            
            // Use the modal manager to show the confirmation modal
            modalManager.showModal('modelDuplicateDeleteModal');
        } catch (error) {
            console.error('Error preparing delete:', error);
            showToast('Error: ' + error.message, 'error');
        }
    }
    
    // Execute deletion after confirmation
    async confirmDeleteDuplicates() {
        try {           
            // Close the modal
            modalManager.closeModal('modelDuplicateDeleteModal');
            
            // Prepare file paths for deletion
            const filePaths = Array.from(this.selectedForDeletion);
            
            // Call API to bulk delete
            const response = await fetch(`/api/${this.modelType}/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_paths: filePaths })
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete selected models');
            }
            
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Unknown error deleting models');
            }
            
            showToast(`Successfully deleted ${data.total_deleted} models`, 'success');
            
            // Exit duplicate mode if deletions were successful
            if (data.total_deleted > 0) {
                this.exitDuplicateMode();
            }
            
        } catch (error) {
            console.error('Error deleting models:', error);
            showToast('Failed to delete models: ' + error.message, 'error');
        }
    }
}
