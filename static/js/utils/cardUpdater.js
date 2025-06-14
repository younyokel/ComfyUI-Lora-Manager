/**
 * Utility functions to update checkpoint cards after modal edits
 */

/**
 * Update the Lora card after metadata edits in the modal
 * @param {string} filePath - Path to the Lora file
 * @param {Object} updates - Object containing the updates (model_name, base_model, notes, usage_tips, etc)
 */
export function updateModelCard(filePath, updates) {
    // Find the card with matching filepath
    const modelCard = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
    if (!modelCard) return;

    // Update card dataset and visual elements based on the updates object
    Object.entries(updates).forEach(([key, value]) => {
        // Update dataset
        modelCard.dataset[key] = value;

        // Update visual elements based on the property
        switch(key) {
            case 'model_name':
                // Update the model name in the card title
                const titleElement = modelCard.querySelector('.card-title');
                if (titleElement) titleElement.textContent = value;
                
                // Also update the model name in the footer if it exists
                const modelNameElement = modelCard.querySelector('.model-name');
                if (modelNameElement) modelNameElement.textContent = value;
                break;
                
            case 'base_model':
                // Update the base model label in the card header if it exists
                const baseModelLabel = modelCard.querySelector('.base-model-label');
                if (baseModelLabel) {
                    baseModelLabel.textContent = value;
                    baseModelLabel.title = value;
                }
                break;
        }
    });
    
    return modelCard; // Return the updated card element for chaining
}

/**
 * Update the recipe card after metadata edits in the modal
 * @param {string} recipeId - ID of the recipe to update
 * @param {Object} updates - Object containing the updates (title, tags, source_path)
 */
export function updateRecipeCard(recipeId, updates) {
    // Find the card with matching recipe ID
    const recipeCard = document.querySelector(`.lora-card[data-id="${recipeId}"]`);
    if (!recipeCard) return;

    // Get the recipe card component instance
    const recipeCardInstance = recipeCard._recipeCardInstance;
    
    // Update card dataset and visual elements based on the updates object
    Object.entries(updates).forEach(([key, value]) => {
        // Update dataset
        recipeCard.dataset[key] = value;

        // Update visual elements based on the property
        switch(key) {
            case 'title':
                // Update the title in the recipe object
                if (recipeCardInstance && recipeCardInstance.recipe) {
                    recipeCardInstance.recipe.title = value;
                }
                
                // Update the title shown in the card
                const modelNameElement = recipeCard.querySelector('.model-name');
                if (modelNameElement) modelNameElement.textContent = value;
                break;
                
            case 'tags':
                // Update tags in the recipe object (not displayed on card UI)
                if (recipeCardInstance && recipeCardInstance.recipe) {
                    recipeCardInstance.recipe.tags = value;
                }
                
                // Store in dataset as JSON string
                try {
                    if (typeof value === 'string') {
                        recipeCard.dataset.tags = value;
                    } else {
                        recipeCard.dataset.tags = JSON.stringify(value);
                    }
                } catch (e) {
                    console.error('Failed to update recipe tags:', e);
                }
                break;
                
            case 'source_path':
                // Update source_path in the recipe object (not displayed on card UI)
                if (recipeCardInstance && recipeCardInstance.recipe) {
                    recipeCardInstance.recipe.source_path = value;
                }
                break;
        }
    });
    
    return recipeCard; // Return the updated card element for chaining
}