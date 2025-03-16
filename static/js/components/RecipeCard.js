// Recipe Card Component
import { showToast } from '../utils/uiHelpers.js';

class RecipeCard {
    constructor(recipe, clickHandler) {
        this.recipe = recipe;
        this.clickHandler = clickHandler;
        this.element = this.createCardElement();
    }
    
    createCardElement() {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.filePath = this.recipe.file_path;
        card.dataset.title = this.recipe.title;
        card.dataset.created = this.recipe.created_date;
        card.dataset.id = this.recipe.id || '';
        
        // Get base model
        const baseModel = this.recipe.base_model || '';
        
        // Ensure loras array exists
        const loras = this.recipe.loras || [];
        const lorasCount = loras.length;
        
        // Check if all LoRAs are available in the library
        const missingLorasCount = loras.filter(lora => !lora.inLibrary).length;
        const allLorasAvailable = missingLorasCount === 0 && lorasCount > 0;
        
        // Ensure file_url exists, fallback to file_path if needed
        const imageUrl = this.recipe.file_url || 
                         (this.recipe.file_path ? `/loras_static/root1/preview/${this.recipe.file_path.split('/').pop()}` : 
                         '/loras_static/images/no-preview.png');

        card.innerHTML = `
            <div class="recipe-indicator" title="Recipe">R</div>
            <div class="card-preview">
                <img src="${imageUrl}" alt="${this.recipe.title}">
                <div class="card-header">
                    <div class="base-model-wrapper">
                        ${baseModel ? `<span class="base-model-label" title="${baseModel}">${baseModel}</span>` : ''}
                    </div>
                    <div class="card-actions">
                        <i class="fas fa-share-alt" title="Share Recipe"></i>
                        <i class="fas fa-copy" title="Copy Recipe Syntax"></i>
                        <i class="fas fa-trash" title="Delete Recipe"></i>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="model-info">
                        <span class="model-name">${this.recipe.title}</span>
                    </div>
                    <div class="lora-count ${allLorasAvailable ? 'ready' : (lorasCount > 0 ? 'missing' : '')}" 
                         title="${this.getLoraStatusTitle(lorasCount, missingLorasCount)}">
                        <i class="fas fa-layer-group"></i> ${lorasCount}
                    </div>
                </div>
            </div>
        `;
        
        this.attachEventListeners(card);
        return card;
    }
    
    getLoraStatusTitle(totalCount, missingCount) {
        if (totalCount === 0) return "No LoRAs in this recipe";
        if (missingCount === 0) return "All LoRAs available - Ready to use";
        return `${missingCount} of ${totalCount} LoRAs missing`;
    }
    
    attachEventListeners(card) {
        // Recipe card click event
        card.addEventListener('click', () => {
            this.clickHandler(this.recipe);
        });
        
        // Share button click event - prevent propagation to card
        card.querySelector('.fa-share-alt')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // TODO: Implement share functionality
            showToast('Share functionality will be implemented later', 'info');
        });
        
        // Copy button click event - prevent propagation to card
        card.querySelector('.fa-copy')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyRecipeSyntax();
        });
        
        // Delete button click event - prevent propagation to card
        card.querySelector('.fa-trash')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteConfirmation();
        });
    }
    
    copyRecipeSyntax() {
        try {
            // Generate recipe syntax in the format <lora:file_name:strength> separated by spaces
            const loras = this.recipe.loras || [];
            if (loras.length === 0) {
                showToast('No LoRAs in this recipe to copy', 'warning');
                return;
            }
            
            const syntax = loras.map(lora => {
                // Use file_name if available, otherwise use empty placeholder
                const fileName = lora.file_name || '[missing-lora]';
                const strength = lora.strength || 1.0;
                return `<lora:${fileName}:${strength}>`;
            }).join(' ');
            
            // Copy to clipboard
            navigator.clipboard.writeText(syntax)
                .then(() => {
                    showToast('Recipe syntax copied to clipboard', 'success');
                })
                .catch(err => {
                    console.error('Failed to copy: ', err);
                    showToast('Failed to copy recipe syntax', 'error');
                });
        } catch (error) {
            console.error('Error copying recipe syntax:', error);
            showToast('Error copying recipe syntax', 'error');
        }
    }
    
    showDeleteConfirmation() {
        try {
            // Get recipe ID
            const recipeId = this.recipe.id;
            if (!recipeId) {
                showToast('Cannot delete recipe: Missing recipe ID', 'error');
                return;
            }
            
            // Set up delete modal content
            const deleteModal = document.getElementById('deleteModal');
            const deleteMessage = deleteModal.querySelector('.delete-message');
            const deleteModelInfo = deleteModal.querySelector('.delete-model-info');
            
            // Update modal content
            deleteMessage.textContent = 'Are you sure you want to delete this recipe?';
            deleteModelInfo.innerHTML = `
                <div class="delete-preview">
                    <img src="${this.recipe.file_url || '/loras_static/images/no-preview.png'}" alt="${this.recipe.title}">
                </div>
                <div class="delete-info">
                    <h3>${this.recipe.title}</h3>
                    <p>This action cannot be undone.</p>
                </div>
            `;
            
            // Store recipe ID in the modal for the delete confirmation handler
            deleteModal.dataset.recipeId = recipeId;
            
            // Update the confirm delete button to use recipe delete handler
            const deleteBtn = deleteModal.querySelector('.delete-btn');
            deleteBtn.onclick = () => this.confirmDeleteRecipe();
            
            // Show the modal
            deleteModal.style.display = 'flex';
        } catch (error) {
            console.error('Error showing delete confirmation:', error);
            showToast('Error showing delete confirmation', 'error');
        }
    }

    confirmDeleteRecipe() {
        const deleteModal = document.getElementById('deleteModal');
        const recipeId = deleteModal.dataset.recipeId;
        
        if (!recipeId) {
            showToast('Cannot delete recipe: Missing recipe ID', 'error');
            closeDeleteModal();
            return;
        }
        
        // Show loading state
        const deleteBtn = deleteModal.querySelector('.delete-btn');
        const originalText = deleteBtn.textContent;
        deleteBtn.textContent = 'Deleting...';
        deleteBtn.disabled = true;
        
        // Call API to delete the recipe
        fetch(`/api/recipe/${recipeId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete recipe');
            }
            return response.json();
        })
        .then(data => {
            showToast('Recipe deleted successfully', 'success');
            
            // Refresh the recipe list if we're on the recipes page
            if (window.recipeManager && typeof window.recipeManager.loadRecipes === 'function') {
                window.recipeManager.loadRecipes();
            }
            
            closeDeleteModal();
        })
        .catch(error => {
            console.error('Error deleting recipe:', error);
            showToast('Error deleting recipe: ' + error.message, 'error');
            
            // Reset button state
            deleteBtn.textContent = originalText;
            deleteBtn.disabled = false;
        });
    }

    closeDeleteModal() {
        const deleteModal = document.getElementById('deleteModal');
        deleteModal.style.display = 'none';
        
        // Reset the delete button handler
        const deleteBtn = deleteModal.querySelector('.delete-btn');
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = false;
        deleteBtn.onclick = null;
    }
}

export { RecipeCard }; 