// Recipe Modal Component
import { showToast } from '../utils/uiHelpers.js';

class RecipeModal {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupCopyButtons();
        // Set up tooltip positioning handlers after DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            this.setupTooltipPositioning();
        });
    }
    
    // Add tooltip positioning handler to ensure correct positioning of fixed tooltips
    setupTooltipPositioning() {
        document.addEventListener('mouseover', (event) => {
            // Check if we're hovering over a local-badge
            if (event.target.closest('.local-badge')) {
                const badge = event.target.closest('.local-badge');
                const tooltip = badge.querySelector('.local-path');
                
                if (tooltip) {
                    // Get badge position
                    const badgeRect = badge.getBoundingClientRect();
                    
                    // Position the tooltip
                    tooltip.style.top = (badgeRect.bottom + 4) + 'px';
                    tooltip.style.left = (badgeRect.right - tooltip.offsetWidth) + 'px';
                }
            }
        }, true);
    }
    
    showRecipeDetails(recipe) {
        // Set modal title
        const modalTitle = document.getElementById('recipeModalTitle');
        if (modalTitle) {
            modalTitle.textContent = recipe.title || 'Recipe Details';
        }
        
        // Store the recipe ID for copy syntax API call
        this.recipeId = recipe.id;
        
        // Set recipe tags if they exist
        const tagsCompactElement = document.getElementById('recipeTagsCompact');
        const tagsTooltipContent = document.getElementById('recipeTagsTooltipContent');
        
        if (tagsCompactElement && tagsTooltipContent && recipe.tags && recipe.tags.length > 0) {
            // Clear previous tags
            tagsCompactElement.innerHTML = '';
            tagsTooltipContent.innerHTML = '';
            
            // Limit displayed tags to 5, show a "+X more" button if needed
            const maxVisibleTags = 5;
            const visibleTags = recipe.tags.slice(0, maxVisibleTags);
            const remainingTags = recipe.tags.length > maxVisibleTags ? recipe.tags.slice(maxVisibleTags) : [];
            
            // Add visible tags
            visibleTags.forEach(tag => {
                const tagElement = document.createElement('div');
                tagElement.className = 'recipe-tag-compact';
                tagElement.textContent = tag;
                tagsCompactElement.appendChild(tagElement);
            });
            
            // Add "more" button if needed
            if (remainingTags.length > 0) {
                const moreButton = document.createElement('div');
                moreButton.className = 'recipe-tag-more';
                moreButton.textContent = `+${remainingTags.length} more`;
                tagsCompactElement.appendChild(moreButton);
                
                // Add tooltip functionality
                moreButton.addEventListener('mouseenter', () => {
                    document.getElementById('recipeTagsTooltip').classList.add('visible');
                });
                
                moreButton.addEventListener('mouseleave', () => {
                    setTimeout(() => {
                        if (!document.getElementById('recipeTagsTooltip').matches(':hover')) {
                            document.getElementById('recipeTagsTooltip').classList.remove('visible');
                        }
                    }, 300);
                });
                
                document.getElementById('recipeTagsTooltip').addEventListener('mouseleave', () => {
                    document.getElementById('recipeTagsTooltip').classList.remove('visible');
                });
                
                // Add all tags to tooltip
                recipe.tags.forEach(tag => {
                    const tooltipTag = document.createElement('div');
                    tooltipTag.className = 'tooltip-tag';
                    tooltipTag.textContent = tag;
                    tagsTooltipContent.appendChild(tooltipTag);
                });
            }
        } else if (tagsCompactElement) {
            // No tags to display
            tagsCompactElement.innerHTML = '';
        }
        
        // Set recipe image
        const modalImage = document.getElementById('recipeModalImage');
        if (modalImage) {
            // Ensure file_url exists, fallback to file_path if needed
            const imageUrl = recipe.file_url || 
                            (recipe.file_path ? `/loras_static/root1/preview/${recipe.file_path.split('/').pop()}` : 
                            '/loras_static/images/no-preview.png');
            
            // Check if the file is a video (mp4)
            const isVideo = imageUrl.toLowerCase().endsWith('.mp4');
            
            // Replace the image element with appropriate media element
            const mediaContainer = modalImage.parentElement;
            mediaContainer.innerHTML = '';
            
            if (isVideo) {
                const videoElement = document.createElement('video');
                videoElement.id = 'recipeModalVideo';
                videoElement.src = imageUrl;
                videoElement.controls = true;
                videoElement.autoplay = false;
                videoElement.loop = true;
                videoElement.muted = true;
                videoElement.className = 'recipe-preview-media';
                videoElement.alt = recipe.title || 'Recipe Preview';
                mediaContainer.appendChild(videoElement);
            } else {
                const imgElement = document.createElement('img');
                imgElement.id = 'recipeModalImage';
                imgElement.src = imageUrl;
                imgElement.className = 'recipe-preview-media';
                imgElement.alt = recipe.title || 'Recipe Preview';
                mediaContainer.appendChild(imgElement);
            }
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
                
                // Create local status badge with a more stable structure
                const localStatus = existsLocally ? 
                    `<div class="local-badge">
                        <i class="fas fa-check"></i> In Library
                        <div class="local-path">${localPath}</div>
                     </div>` : 
                    `<div class="missing-badge">
                        <i class="fas fa-exclamation-triangle"></i> Not in Library
                     </div>`;

                // Check if preview is a video
                const isPreviewVideo = lora.preview_url && lora.preview_url.toLowerCase().endsWith('.mp4');
                const previewMedia = isPreviewVideo ?
                    `<video class="thumbnail-video" autoplay loop muted playsinline>
                        <source src="${lora.preview_url}" type="video/mp4">
                     </video>` :
                    `<img src="${lora.preview_url || '/loras_static/images/no-preview.png'}" alt="LoRA preview">`;

                return `
                    <div class="recipe-lora-item ${existsLocally ? 'exists-locally' : 'missing-locally'}">
                        <div class="recipe-lora-thumbnail">
                            ${previewMedia}
                        </div>
                        <div class="recipe-lora-content">
                            <div class="recipe-lora-header">
                                <h4>${lora.modelName}</h4>
                                <div class="badge-container">${localStatus}</div>
                            </div>
                            <div class="recipe-lora-info">
                                ${lora.modelVersionName ? `<div class="recipe-lora-version">${lora.modelVersionName}</div>` : ''}
                                <div class="recipe-lora-weight">Weight: ${lora.strength || 1.0}</div>
                                ${lora.baseModel ? `<div class="base-model">${lora.baseModel}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Generate recipe syntax for copy button (this is now a placeholder, actual syntax will be fetched from the API)
            this.recipeLorasSyntax = '';
            
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
                // Use backend API to get recipe syntax
                this.fetchAndCopyRecipeSyntax();
            });
        }
    }
    
    // Fetch recipe syntax from backend and copy to clipboard
    async fetchAndCopyRecipeSyntax() {
        if (!this.recipeId) {
            showToast('No recipe ID available', 'error');
            return;
        }
        
        try {
            // Fetch recipe syntax from backend
            const response = await fetch(`/api/recipe/${this.recipeId}/syntax`);
            
            if (!response.ok) {
                throw new Error(`Failed to get recipe syntax: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.syntax) {
                // Copy to clipboard
                await navigator.clipboard.writeText(data.syntax);
                showToast('Recipe syntax copied to clipboard', 'success');
            } else {
                throw new Error(data.error || 'No syntax returned from server');
            }
        } catch (error) {
            console.error('Error fetching recipe syntax:', error);
            showToast(`Error copying recipe syntax: ${error.message}`, 'error');
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