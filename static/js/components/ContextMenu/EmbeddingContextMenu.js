import { BaseContextMenu } from './BaseContextMenu.js';
import { ModelContextMenuMixin } from './ModelContextMenuMixin.js';
import { getModelApiClient, resetAndReload } from '../../api/baseModelApi.js';
import { showToast } from '../../utils/uiHelpers.js';
import { showDeleteModal, showExcludeModal } from '../../utils/modalUtils.js';

export class EmbeddingContextMenu extends BaseContextMenu {
    constructor() {
        super('embeddingContextMenu', '.embedding-card');
        this.nsfwSelector = document.getElementById('nsfwLevelSelector');
        this.modelType = 'embedding';
        this.resetAndReload = resetAndReload;
        
        // Initialize NSFW Level Selector events
        if (this.nsfwSelector) {
            this.initNSFWSelector();
        }
    }
    
    // Implementation needed by the mixin
    async saveModelMetadata(filePath, data) {
        return getModelApiClient().saveModelMetadata(filePath, data);
    }
    
    handleMenuAction(action) {
        // First try to handle with common actions
        if (ModelContextMenuMixin.handleCommonMenuActions.call(this, action)) {
            return;
        }

        const apiClient = getModelApiClient();

        // Otherwise handle embedding-specific actions
        switch(action) {
            case 'details':
                // Show embedding details
                this.currentCard.click();
                break;
            case 'replace-preview':
                // Add new action for replacing preview images
                apiClient.replaceModelPreview(this.currentCard.dataset.filepath);
                break;
            case 'delete':
                showDeleteModal(this.currentCard.dataset.filepath);
                break;
            case 'copyname':
                // Copy embedding name
                if (this.currentCard.querySelector('.fa-copy')) {
                    this.currentCard.querySelector('.fa-copy').click();
                }
                break;
            case 'refresh-metadata':
                // Refresh metadata from CivitAI
                apiClient.refreshSingleModelMetadata(this.currentCard.dataset.filepath);
                break;
            case 'move':
                // Move to folder (placeholder)
                showToast('Move to folder feature coming soon', 'info');
                break;
            case 'exclude':
                showExcludeModal(this.currentCard.dataset.filepath);
                break;
        }
    }
}

// Mix in shared methods
Object.assign(EmbeddingContextMenu.prototype, ModelContextMenuMixin);
