import { BaseContextMenu } from './BaseContextMenu.js';
import { ModelContextMenuMixin } from './ModelContextMenuMixin.js';
import { refreshSingleLoraMetadata, saveModelMetadata, replacePreview, resetAndReload } from '../../api/loraApi.js';
import { copyToClipboard, sendLoraToWorkflow } from '../../utils/uiHelpers.js';
import { showExcludeModal, showDeleteModal } from '../../utils/modalUtils.js';

export class LoraContextMenu extends BaseContextMenu {
    constructor() {
        super('loraContextMenu', '.lora-card');
        this.nsfwSelector = document.getElementById('nsfwLevelSelector');
        this.modelType = 'lora';
        this.resetAndReload = resetAndReload;
        
        // Initialize NSFW Level Selector events
        if (this.nsfwSelector) {
            this.initNSFWSelector();
        }
    }

    // Use the saveModelMetadata implementation from loraApi
    async saveModelMetadata(filePath, data) {
        return saveModelMetadata(filePath, data);
    }

    handleMenuAction(action, menuItem) {
        // First try to handle with common actions
        if (ModelContextMenuMixin.handleCommonMenuActions.call(this, action)) {
            return;
        }

        // Otherwise handle lora-specific actions
        switch(action) {
            case 'detail':
                // Trigger the main card click which shows the modal
                this.currentCard.click();
                break;
            case 'copyname':
                // Generate and copy LoRA syntax
                this.copyLoraSyntax();
                break;
            case 'sendappend':
                // Send LoRA to workflow (append mode)
                this.sendLoraToWorkflow(false);
                break;
            case 'sendreplace':
                // Send LoRA to workflow (replace mode)
                this.sendLoraToWorkflow(true);
                break;
            case 'replace-preview':
                // Add a new action for replacing preview images
                replacePreview(this.currentCard.dataset.filepath);
                break;
            case 'delete':
                // Call showDeleteModal directly instead of clicking the trash button
                showDeleteModal(this.currentCard.dataset.filepath);
                break;
            case 'move':
                moveManager.showMoveModal(this.currentCard.dataset.filepath);
                break;
            case 'refresh-metadata':
                refreshSingleLoraMetadata(this.currentCard.dataset.filepath);
                break;
            case 'exclude':
                showExcludeModal(this.currentCard.dataset.filepath);
                break;
        }
    }

    // Specific LoRA methods
    copyLoraSyntax() {
        const card = this.currentCard;
        const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
        const strength = usageTips.strength || 1;
        const loraSyntax = `<lora:${card.dataset.file_name}:${strength}>`;
        
        copyToClipboard(loraSyntax, 'LoRA syntax copied to clipboard');
    }

    sendLoraToWorkflow(replaceMode) {
        const card = this.currentCard;
        const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
        const strength = usageTips.strength || 1;
        const loraSyntax = `<lora:${card.dataset.file_name}:${strength}>`;
        
        sendLoraToWorkflow(loraSyntax, replaceMode, 'lora');
    }
}

// Mix in shared methods
Object.assign(LoraContextMenu.prototype, ModelContextMenuMixin);