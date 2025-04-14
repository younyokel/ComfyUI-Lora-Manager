import { BaseContextMenu } from './BaseContextMenu.js';
import { showToast } from '../../utils/uiHelpers.js';

export class RecipeContextMenu extends BaseContextMenu {
    constructor() {
        super('recipeContextMenu', '.lora-card');
    }
    
    handleMenuAction(action) {
        switch(action) {
            case 'details':
                // Show recipe details
                this.currentCard.click();
                break;
            case 'copy':
                // Copy recipe to clipboard
                if (window.recipeManager) {
                    window.recipeManager.copyRecipe(this.currentCard.dataset.id);
                }
                break;
            case 'share':
                // Share recipe
                if (window.recipeManager) {
                    window.recipeManager.shareRecipe(this.currentCard.dataset.id);
                }
                break;
            case 'delete':
                // Delete recipe
                if (this.currentCard.querySelector('.fa-trash')) {
                    this.currentCard.querySelector('.fa-trash').click();
                }
                break;
            case 'edit':
                // Edit recipe
                if (window.recipeManager && window.recipeManager.editRecipe) {
                    window.recipeManager.editRecipe(this.currentCard.dataset.id);
                }
                break;
        }
    }
}