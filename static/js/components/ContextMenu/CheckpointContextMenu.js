import { BaseContextMenu } from './BaseContextMenu.js';
import { ModelContextMenuMixin } from './ModelContextMenuMixin.js';
import { refreshSingleCheckpointMetadata, saveModelMetadata, replaceCheckpointPreview, resetAndReload } from '../../api/checkpointApi.js';
import { showToast } from '../../utils/uiHelpers.js';
import { showExcludeModal } from '../../utils/modalUtils.js';

export class CheckpointContextMenu extends BaseContextMenu {
    constructor() {
        super('checkpointContextMenu', '.lora-card');
        this.nsfwSelector = document.getElementById('nsfwLevelSelector');
        this.modelType = 'checkpoint';
        this.resetAndReload = resetAndReload;
        
        // Initialize NSFW Level Selector events
        if (this.nsfwSelector) {
            this.initNSFWSelector();
        }
    }
    
    // Implementation needed by the mixin
    async saveModelMetadata(filePath, data) {
        return saveModelMetadata(filePath, data);
    }
    
    handleMenuAction(action) {
        // First try to handle with common actions
        if (ModelContextMenuMixin.handleCommonMenuActions.call(this, action)) {
            return;
        }

        // Otherwise handle checkpoint-specific actions
        switch(action) {
            case 'details':
                // Show checkpoint details
                this.currentCard.click();
                break;
            case 'replace-preview':
                // Add new action for replacing preview images
                replaceCheckpointPreview(this.currentCard.dataset.filepath);
                break;
            case 'delete':
                // Delete checkpoint
                if (this.currentCard.querySelector('.fa-trash')) {
                    this.currentCard.querySelector('.fa-trash').click();
                }
                break;
            case 'copyname':
                // Copy checkpoint name
                if (this.currentCard.querySelector('.fa-copy')) {
                    this.currentCard.querySelector('.fa-copy').click();
                }
                break;
            case 'refresh-metadata':
                // Refresh metadata from CivitAI
                refreshSingleCheckpointMetadata(this.currentCard.dataset.filepath);
                break;
            case 'move':
                // Move to folder (placeholder)
                showToast('Move to folder feature coming soon', 'info');
                break;
            case 'exclude':
                showExcludeModal(this.currentCard.dataset.filepath, 'checkpoint');
                break;
        }
    }
}

// Mix in shared methods
Object.assign(CheckpointContextMenu.prototype, ModelContextMenuMixin);