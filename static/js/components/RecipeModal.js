// Recipe Modal Component
import { showToast } from '../utils/uiHelpers.js';

class RecipeModal {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupCopyButtons();
    }
    
    showRecipeDetails(recipe) {
        console.log(recipe);
        // Set modal title
        const modalTitle = document.getElementById('recipeModalTitle');
        if (modalTitle) {
            modalTitle.textContent = recipe.title || 'Recipe Details';
        }
        
        // Set recipe image
        const modalImage = document.getElementById('recipeModalImage');
        if (modalImage) {
            // Ensure file_url exists, fallback to file_path if needed
            const imageUrl = recipe.file_url || 
                            (recipe.file_path ? `/loras_static/root1/preview/${recipe.file_path.split('/').pop()}` : 
                            '/loras_static/images/no-preview.png');
            modalImage.src = imageUrl;
            modalImage.alt = recipe.title || 'Recipe Preview';
        }
        
        // Set generation parameters
        const promptElement = document.getElementById('recipePrompt');
        const negativePromptElement = document.getElementById('recipeNegativePrompt');
        const otherParamsElement = document.getElementById('recipeOtherParams');
        
        if (recipe.gen_params) {
            // Set prompt
            if (promptElement && recipe.gen_params.prompt) {
                promptElement.textContent = recipe.gen_params.prompt;
            } else if (promptElement) {
                promptElement.textContent = 'No prompt information available';
            }
            
            // Set negative prompt
            if (negativePromptElement && recipe.gen_params.negative_prompt) {
                negativePromptElement.textContent = recipe.gen_params.negative_prompt;
            } else if (negativePromptElement) {
                negativePromptElement.textContent = 'No negative prompt information available';
            }
            
            // Set other parameters
            if (otherParamsElement) {
                // Clear previous params
                otherParamsElement.innerHTML = '';
                
                // Add all other parameters except prompt and negative_prompt
                const excludedParams = ['prompt', 'negative_prompt'];
                
                for (const [key, value] of Object.entries(recipe.gen_params)) {
                    if (!excludedParams.includes(key) && value !== undefined && value !== null) {
                        const paramTag = document.createElement('div');
                        paramTag.className = 'param-tag';
                        paramTag.innerHTML = `
                            <span class="param-name">${key}:</span>
                            <span class="param-value">${value}</span>
                        `;
                        otherParamsElement.appendChild(paramTag);
                    }
                }
                
                // If no other params, show a message
                if (otherParamsElement.children.length === 0) {
                    otherParamsElement.innerHTML = '<div class="no-params">No additional parameters available</div>';
                }
            }
        } else {
            // No generation parameters available
            if (promptElement) promptElement.textContent = 'No prompt information available';
            if (negativePromptElement) negativePromptElement.textContent = 'No negative prompt information available';
            if (otherParamsElement) otherParamsElement.innerHTML = '<div class="no-params">No parameters available</div>';
        }
        
        // Set LoRAs list and count
        const lorasListElement = document.getElementById('recipeLorasList');
        const lorasCountElement = document.getElementById('recipeLorasCount');
        
        // 检查所有 LoRAs 是否都在库中
        let allLorasAvailable = true;
        let missingLorasCount = 0;
        
        if (recipe.loras && recipe.loras.length > 0) {
            recipe.loras.forEach(lora => {
                if (!lora.inLibrary) {
                    allLorasAvailable = false;
                    missingLorasCount++;
                }
            });
        }
        
        // 设置 LoRAs 计数和状态
        if (lorasCountElement && recipe.loras) {
            const totalCount = recipe.loras.length;
            
            // 创建状态指示器
            let statusHTML = '';
            if (totalCount > 0) {
                if (allLorasAvailable) {
                    statusHTML = `<div class="recipe-status ready"><i class="fas fa-check-circle"></i> Ready to use</div>`;
                } else {
                    statusHTML = `<div class="recipe-status missing"><i class="fas fa-exclamation-triangle"></i> ${missingLorasCount} missing</div>`;
                }
            }
            
            lorasCountElement.innerHTML = `<i class="fas fa-layer-group"></i> ${totalCount} LoRAs ${statusHTML}`;
        }
        
        if (lorasListElement && recipe.loras && recipe.loras.length > 0) {
            lorasListElement.innerHTML = recipe.loras.map(lora => {
                const existsLocally = lora.inLibrary;
                const localPath = lora.localPath || '';
                
                // Create local status badge
                const localStatus = existsLocally ? 
                    `<div class="local-badge">
                        <i class="fas fa-check"></i> In Library
                        <div class="local-path">${localPath}</div>
                     </div>` : 
                    `<div class="missing-badge">
                        <i class="fas fa-exclamation-triangle"></i> Not in Library
                     </div>`;

                return `
                    <div class="recipe-lora-item ${existsLocally ? 'exists-locally' : 'missing-locally'}">
                        <div class="recipe-lora-thumbnail">
                            <img src="${lora.preview_url || '/loras_static/images/no-preview.png'}" alt="LoRA preview">
                        </div>
                        <div class="recipe-lora-content">
                            <div class="recipe-lora-header">
                                <h4>${lora.modelName}</h4>
                                ${localStatus}
                            </div>
                            ${lora.modelVersionName ? `<div class="recipe-lora-version">${lora.modelVersionName}</div>` : ''}
                            <div class="recipe-lora-info">
                                ${lora.baseModel ? `<div class="base-model">${lora.baseModel}</div>` : ''}
                                <div class="recipe-lora-weight">Weight: ${lora.strength || 1.0}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Generate recipe syntax for copy button
            this.recipeLorasSyntax = recipe.loras.map(lora => 
                `<lora:${lora.file_name}:${lora.strength || 1.0}>`
            ).join(' ');
            
        } else if (lorasListElement) {
            lorasListElement.innerHTML = '<div class="no-loras">No LoRAs associated with this recipe</div>';
            this.recipeLorasSyntax = '';
        }
        
        // Show the modal
        modalManager.showModal('recipeModal');
    }
    
    // Setup copy buttons for prompts and recipe syntax
    setupCopyButtons() {
        const copyPromptBtn = document.getElementById('copyPromptBtn');
        const copyNegativePromptBtn = document.getElementById('copyNegativePromptBtn');
        const copyRecipeSyntaxBtn = document.getElementById('copyRecipeSyntaxBtn');
        
        if (copyPromptBtn) {
            copyPromptBtn.addEventListener('click', () => {
                const promptText = document.getElementById('recipePrompt').textContent;
                this.copyToClipboard(promptText, 'Prompt copied to clipboard');
            });
        }
        
        if (copyNegativePromptBtn) {
            copyNegativePromptBtn.addEventListener('click', () => {
                const negativePromptText = document.getElementById('recipeNegativePrompt').textContent;
                this.copyToClipboard(negativePromptText, 'Negative prompt copied to clipboard');
            });
        }
        
        if (copyRecipeSyntaxBtn) {
            copyRecipeSyntaxBtn.addEventListener('click', () => {
                this.copyToClipboard(this.recipeLorasSyntax, 'Recipe syntax copied to clipboard');
            });
        }
    }
    
    // Helper method to copy text to clipboard
    copyToClipboard(text, successMessage) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(successMessage, 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('Failed to copy text', 'error');
        });
    }
}

export { RecipeModal }; 