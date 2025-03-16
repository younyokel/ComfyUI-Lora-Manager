// Recipe Card Component
import { showToast } from '../utils/uiHelpers.js';
import { modalManager } from '../managers/ModalManager.js';

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
            this.shareRecipe();
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
            
            // Create delete modal content
            const deleteModalContent = `
                <div class="modal-content delete-modal-content">
                    <h2>Delete Recipe</h2>
                    <p class="delete-message">Are you sure you want to delete this recipe?</p>
                    <div class="delete-model-info">
                        <div class="delete-preview">
                            <img src="${this.recipe.file_url || '/loras_static/images/no-preview.png'}" alt="${this.recipe.title}">
                        </div>
                        <div class="delete-info">
                            <h3>${this.recipe.title}</h3>
                            <p>This action cannot be undone.</p>
                        </div>
                    </div>
                    <p class="delete-note">Note: Deleting this recipe will not affect the LoRA files used in it.</p>
                    <div class="modal-actions">
                        <button class="cancel-btn" onclick="closeDeleteModal()">Cancel</button>
                        <button class="delete-btn" onclick="confirmDelete()">Delete</button>
                    </div>
                </div>
            `;
            
            // Show the modal with custom content and setup callbacks
            modalManager.showModal('deleteModal', deleteModalContent, () => {
                // This is the onClose callback
                const deleteModal = document.getElementById('deleteModal');
                const deleteBtn = deleteModal.querySelector('.delete-btn');
                deleteBtn.textContent = 'Delete';
                deleteBtn.disabled = false;
            });
            
            // Set up the delete and cancel buttons with proper event handlers
            const deleteModal = document.getElementById('deleteModal');
            const cancelBtn = deleteModal.querySelector('.cancel-btn');
            const deleteBtn = deleteModal.querySelector('.delete-btn');
            
            // Store recipe ID in the modal for the delete confirmation handler
            deleteModal.dataset.recipeId = recipeId;
            
            // Update button event handlers
            cancelBtn.onclick = () => modalManager.closeModal('deleteModal');
            deleteBtn.onclick = () => this.confirmDeleteRecipe();
            
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
            modalManager.closeModal('deleteModal');
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
            
            modalManager.closeModal('deleteModal');
        })
        .catch(error => {
            console.error('Error deleting recipe:', error);
            showToast('Error deleting recipe: ' + error.message, 'error');
            
            // Reset button state
            deleteBtn.textContent = originalText;
            deleteBtn.disabled = false;
        });
    }

    shareRecipe() {
        try {
            // Get the image URL
            const imageUrl = this.recipe.file_url || 
                            (this.recipe.file_path ? `/loras_static/root1/preview/${this.recipe.file_path.split('/').pop()}` : 
                            '/loras_static/images/no-preview.png');
            
            // Create a temporary anchor element
            const downloadLink = document.createElement('a');
            downloadLink.href = imageUrl;
            
            // Set the download attribute with the recipe title as filename
            const fileExtension = imageUrl.split('.').pop();
            const safeFileName = this.recipe.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            downloadLink.download = `recipe_${safeFileName}.${fileExtension}`;
            
            // Append to body, click and remove
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            showToast('Recipe image download started', 'success');
        } catch (error) {
            console.error('Error sharing recipe:', error);
            showToast('Error downloading recipe image', 'error');
        }
    }
}

export { RecipeCard }; 