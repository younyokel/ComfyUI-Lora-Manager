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
        
        // Set up document click handler to close edit fields
        document.addEventListener('click', (event) => {
            // Handle title edit
            const titleEditor = document.getElementById('recipeTitleEditor');
            if (titleEditor && titleEditor.classList.contains('active') && 
                !titleEditor.contains(event.target) && 
                !event.target.closest('.edit-icon')) {
                this.saveTitleEdit();
            }
            
            // Handle tags edit
            const tagsEditor = document.getElementById('recipeTagsEditor');
            if (tagsEditor && tagsEditor.classList.contains('active') && 
                !tagsEditor.contains(event.target) && 
                !event.target.closest('.edit-icon')) {
                this.saveTagsEdit();
            }
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
        // Store the full recipe for editing
        this.currentRecipe = JSON.parse(JSON.stringify(recipe)); // 深拷贝以避免对原始对象的修改
        
        // Set modal title with edit icon
        const modalTitle = document.getElementById('recipeModalTitle');
        if (modalTitle) {
            modalTitle.innerHTML = `
                <div class="editable-content">
                    <span class="content-text">${recipe.title || 'Recipe Details'}</span>
                    <button class="edit-icon" title="Edit recipe name"><i class="fas fa-pencil-alt"></i></button>
                </div>
                <div id="recipeTitleEditor" class="content-editor">
                    <input type="text" class="title-input" value="${recipe.title || ''}">
                </div>
            `;
            
            // Add event listener for title editing
            const editIcon = modalTitle.querySelector('.edit-icon');
            editIcon.addEventListener('click', () => this.showTitleEditor());
            
            // Add key event listener for Enter key
            const titleInput = modalTitle.querySelector('.title-input');
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.saveTitleEdit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelTitleEdit();
                }
            });
        }
        
        // Store the recipe ID for copy syntax API call
        this.recipeId = recipe.id;
        
        // Set recipe tags if they exist
        const tagsCompactElement = document.getElementById('recipeTagsCompact');
        const tagsTooltipContent = document.getElementById('recipeTagsTooltipContent');
        
        if (tagsCompactElement) {
            // Add tags container with edit functionality
            tagsCompactElement.innerHTML = `
                <div class="editable-content tags-content">
                    <div class="tags-display"></div>
                    <button class="edit-icon" title="Edit tags"><i class="fas fa-pencil-alt"></i></button>
                </div>
                <div id="recipeTagsEditor" class="content-editor tags-editor">
                    <input type="text" class="tags-input" placeholder="Enter tags separated by commas">
                </div>
            `;
            
            const tagsDisplay = tagsCompactElement.querySelector('.tags-display');
            
            if (recipe.tags && recipe.tags.length > 0) {
                // Limit displayed tags to 5, show a "+X more" button if needed
                const maxVisibleTags = 5;
                const visibleTags = recipe.tags.slice(0, maxVisibleTags);
                const remainingTags = recipe.tags.length > maxVisibleTags ? recipe.tags.slice(maxVisibleTags) : [];
                
                // Add visible tags
                visibleTags.forEach(tag => {
                    const tagElement = document.createElement('div');
                    tagElement.className = 'recipe-tag-compact';
                    tagElement.textContent = tag;
                    tagsDisplay.appendChild(tagElement);
                });
                
                // Add "more" button if needed
                if (remainingTags.length > 0) {
                    const moreButton = document.createElement('div');
                    moreButton.className = 'recipe-tag-more';
                    moreButton.textContent = `+${remainingTags.length} more`;
                    tagsDisplay.appendChild(moreButton);
                    
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
                    if (tagsTooltipContent) {
                        tagsTooltipContent.innerHTML = '';
                        recipe.tags.forEach(tag => {
                            const tooltipTag = document.createElement('div');
                            tooltipTag.className = 'tooltip-tag';
                            tooltipTag.textContent = tag;
                            tagsTooltipContent.appendChild(tooltipTag);
                        });
                    }
                }
            } else {
                tagsDisplay.innerHTML = '<div class="no-tags">No tags</div>';
            }
            
            // Add event listeners for tags editing
            const editTagsIcon = tagsCompactElement.querySelector('.edit-icon');
            const tagsInput = tagsCompactElement.querySelector('.tags-input');
            
            // Set current tags in the input
            if (recipe.tags && recipe.tags.length > 0) {
                tagsInput.value = recipe.tags.join(', ');
            }
            
            editTagsIcon.addEventListener('click', () => this.showTagsEditor());
            
            // Add key event listener for Enter key
            tagsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.saveTagsEdit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelTagsEdit();
                }
            });
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
        
        // Check all LoRAs status
        let allLorasAvailable = true;
        let missingLorasCount = 0;
        let deletedLorasCount = 0;
        
        if (recipe.loras && recipe.loras.length > 0) {
            recipe.loras.forEach(lora => {
                if (lora.isDeleted) {
                    deletedLorasCount++;
                } else if (!lora.inLibrary) {
                    allLorasAvailable = false;
                    missingLorasCount++;
                }
            });
        }
        
        // Set LoRAs count and status
        if (lorasCountElement && recipe.loras) {
            const totalCount = recipe.loras.length;
            
            // Create status indicator based on LoRA states
            let statusHTML = '';
            if (totalCount > 0) {
                if (allLorasAvailable && deletedLorasCount === 0) {
                    // All LoRAs are available
                    statusHTML = `<div class="recipe-status ready"><i class="fas fa-check-circle"></i> Ready to use</div>`;
                } else if (missingLorasCount > 0) {
                    // Some LoRAs are missing (prioritize showing missing over deleted)
                    statusHTML = `<div class="recipe-status missing"><i class="fas fa-exclamation-triangle"></i> ${missingLorasCount} missing</div>`;
                } else if (deletedLorasCount > 0 && missingLorasCount === 0) {
                    // Some LoRAs are deleted but none are missing
                    statusHTML = `<div class="recipe-status partial"><i class="fas fa-info-circle"></i> ${deletedLorasCount} deleted</div>`;
                }
            }
            
            lorasCountElement.innerHTML = `<i class="fas fa-layer-group"></i> ${totalCount} LoRAs ${statusHTML}`;
        }
        
        if (lorasListElement && recipe.loras && recipe.loras.length > 0) {
            lorasListElement.innerHTML = recipe.loras.map(lora => {
                const existsLocally = lora.inLibrary;
                const isDeleted = lora.isDeleted;
                const localPath = lora.localPath || '';
                
                // Create status badge based on LoRA state
                let localStatus;
                if (existsLocally) {
                    localStatus = `
                        <div class="local-badge">
                            <i class="fas fa-check"></i> In Library
                            <div class="local-path">${localPath}</div>
                        </div>`;
                } else if (isDeleted) {
                    localStatus = `
                        <div class="deleted-badge">
                            <i class="fas fa-trash-alt"></i> Deleted
                        </div>`;
                } else {
                    localStatus = `
                        <div class="missing-badge">
                            <i class="fas fa-exclamation-triangle"></i> Not in Library
                        </div>`;
                }

                // Check if preview is a video
                const isPreviewVideo = lora.preview_url && lora.preview_url.toLowerCase().endsWith('.mp4');
                const previewMedia = isPreviewVideo ?
                    `<video class="thumbnail-video" autoplay loop muted playsinline>
                        <source src="${lora.preview_url}" type="video/mp4">
                     </video>` :
                    `<img src="${lora.preview_url || '/loras_static/images/no-preview.png'}" alt="LoRA preview">`;

                // Determine CSS class based on LoRA state
                let loraItemClass = 'recipe-lora-item';
                if (existsLocally) {
                    loraItemClass += ' exists-locally';
                } else if (isDeleted) {
                    loraItemClass += ' is-deleted';
                } else {
                    loraItemClass += ' missing-locally';
                }

                return `
                    <div class="${loraItemClass}">
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
    
    // Title editing methods
    showTitleEditor() {
        const titleContainer = document.getElementById('recipeModalTitle');
        if (titleContainer) {
            titleContainer.querySelector('.editable-content').classList.add('hide');
            const editor = titleContainer.querySelector('#recipeTitleEditor');
            editor.classList.add('active');
            const input = editor.querySelector('input');
            input.focus();
            input.select();
        }
    }
    
    saveTitleEdit() {
        const titleContainer = document.getElementById('recipeModalTitle');
        if (titleContainer) {
            const editor = titleContainer.querySelector('#recipeTitleEditor');
            const input = editor.querySelector('input');
            const newTitle = input.value.trim();
            
            // Check if title changed
            if (newTitle && newTitle !== this.currentRecipe.title) {
                // Update title in the UI
                titleContainer.querySelector('.content-text').textContent = newTitle;
                
                // Update the recipe on the server
                this.updateRecipeMetadata({ title: newTitle });
            }
            
            // Hide editor
            editor.classList.remove('active');
            titleContainer.querySelector('.editable-content').classList.remove('hide');
        }
    }
    
    cancelTitleEdit() {
        const titleContainer = document.getElementById('recipeModalTitle');
        if (titleContainer) {
            // Reset input value
            const editor = titleContainer.querySelector('#recipeTitleEditor');
            const input = editor.querySelector('input');
            input.value = this.currentRecipe.title || '';
            
            // Hide editor
            editor.classList.remove('active');
            titleContainer.querySelector('.editable-content').classList.remove('hide');
        }
    }
    
    // Tags editing methods
    showTagsEditor() {
        const tagsContainer = document.getElementById('recipeTagsCompact');
        if (tagsContainer) {
            tagsContainer.querySelector('.editable-content').classList.add('hide');
            const editor = tagsContainer.querySelector('#recipeTagsEditor');
            editor.classList.add('active');
            const input = editor.querySelector('input');
            input.focus();
        }
    }
    
    saveTagsEdit() {
        const tagsContainer = document.getElementById('recipeTagsCompact');
        if (tagsContainer) {
            const editor = tagsContainer.querySelector('#recipeTagsEditor');
            const input = editor.querySelector('input');
            const tagsText = input.value.trim();
            
            // Parse tags
            let newTags = [];
            if (tagsText) {
                newTags = tagsText.split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
            }
            
            // Check if tags changed
            const oldTags = this.currentRecipe.tags || [];
            const tagsChanged = 
                newTags.length !== oldTags.length || 
                newTags.some((tag, index) => tag !== oldTags[index]);
            
            if (tagsChanged) {
                // Update the recipe on the server
                this.updateRecipeMetadata({ tags: newTags });
                
                // Update tags in the UI
                const tagsDisplay = tagsContainer.querySelector('.tags-display');
                tagsDisplay.innerHTML = '';
                
                if (newTags.length > 0) {
                    // Limit displayed tags to 5, show a "+X more" button if needed
                    const maxVisibleTags = 5;
                    const visibleTags = newTags.slice(0, maxVisibleTags);
                    const remainingTags = newTags.length > maxVisibleTags ? newTags.slice(maxVisibleTags) : [];
                    
                    // Add visible tags
                    visibleTags.forEach(tag => {
                        const tagElement = document.createElement('div');
                        tagElement.className = 'recipe-tag-compact';
                        tagElement.textContent = tag;
                        tagsDisplay.appendChild(tagElement);
                    });
                    
                    // Add "more" button if needed
                    if (remainingTags.length > 0) {
                        const moreButton = document.createElement('div');
                        moreButton.className = 'recipe-tag-more';
                        moreButton.textContent = `+${remainingTags.length} more`;
                        tagsDisplay.appendChild(moreButton);
                        
                        // Update tooltip content
                        const tooltipContent = document.getElementById('recipeTagsTooltipContent');
                        if (tooltipContent) {
                            tooltipContent.innerHTML = '';
                            newTags.forEach(tag => {
                                const tooltipTag = document.createElement('div');
                                tooltipTag.className = 'tooltip-tag';
                                tooltipTag.textContent = tag;
                                tooltipContent.appendChild(tooltipTag);
                            });
                        }
                        
                        // Re-add tooltip functionality
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
                    }
                } else {
                    tagsDisplay.innerHTML = '<div class="no-tags">No tags</div>';
                }
                
                // Update the current recipe object
                this.currentRecipe.tags = newTags;
            }
            
            // Hide editor
            editor.classList.remove('active');
            tagsContainer.querySelector('.editable-content').classList.remove('hide');
        }
    }
    
    cancelTagsEdit() {
        const tagsContainer = document.getElementById('recipeTagsCompact');
        if (tagsContainer) {
            // Reset input value
            const editor = tagsContainer.querySelector('#recipeTagsEditor');
            const input = editor.querySelector('input');
            input.value = this.currentRecipe.tags ? this.currentRecipe.tags.join(', ') : '';
            
            // Hide editor
            editor.classList.remove('active');
            tagsContainer.querySelector('.editable-content').classList.remove('hide');
        }
    }
    
    // Update recipe metadata on the server
    async updateRecipeMetadata(updates) {
        try {
            const response = await fetch(`/api/recipe/${this.recipeId}/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates)
            });

            const data = await response.json();

            if (data.success) {
                // 显示保存成功的提示
                if (updates.title) {
                    showToast('Recipe name updated successfully', 'success');
                } else if (updates.tags) {
                    showToast('Recipe tags updated successfully', 'success');
                } else {
                    showToast('Recipe updated successfully', 'success');
                }
                
                // 更新当前recipe对象的属性
                Object.assign(this.currentRecipe, updates);
                
                // 确保这个更新也传播到卡片视图
                // 尝试找到可能显示这个recipe的卡片并更新它
                try {
                    const recipeCards = document.querySelectorAll('.recipe-card');
                    recipeCards.forEach(card => {
                        if (card.dataset.recipeId === this.recipeId) {
                            // 更新卡片标题
                            if (updates.title) {
                                const titleElement = card.querySelector('.recipe-title');
                                if (titleElement) {
                                    titleElement.textContent = updates.title;
                                }
                            }
                            
                            // 更新卡片标签
                            if (updates.tags) {
                                const tagsElement = card.querySelector('.recipe-tags');
                                if (tagsElement) {
                                    if (updates.tags.length > 0) {
                                        tagsElement.innerHTML = updates.tags.map(
                                            tag => `<div class="recipe-tag">${tag}</div>`
                                        ).join('');
                                    } else {
                                        tagsElement.innerHTML = '';
                                    }
                                }
                            }
                        }
                    });
                } catch (err) {
                    console.log("Non-critical error updating recipe cards:", err);
                }
                
                // 重要：强制刷新recipes列表，确保从服务器获取最新数据
                try {
                    if (window.recipeManager && typeof window.recipeManager.loadRecipes === 'function') {
                        // 异步刷新recipes列表，不阻塞用户界面
                        setTimeout(() => {
                            window.recipeManager.loadRecipes(true);
                        }, 500);
                    }
                } catch (err) {
                    console.log("Error refreshing recipes list:", err);
                }
            } else {
                showToast(`Failed to update recipe: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Error updating recipe:', error);
            showToast(`Error updating recipe: ${error.message}`, 'error');
        }
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