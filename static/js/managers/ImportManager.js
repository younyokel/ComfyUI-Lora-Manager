import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { LoadingManager } from './LoadingManager.js';

export class ImportManager {
    constructor() {
        this.recipeImage = null;
        this.recipeData = null;
        this.recipeName = '';
        this.recipeTags = [];
        this.missingLoras = [];
        
        // Add initialization check
        this.initialized = false;
        this.selectedFolder = '';

        // Add LoadingManager instance
        this.loadingManager = new LoadingManager();
        this.folderClickHandler = null;
        this.updateTargetPath = this.updateTargetPath.bind(this);
        
        // 添加对注入样式的引用
        this.injectedStyles = null;
        
        // Add import mode tracking
        this.importMode = 'upload'; // Default mode: 'upload' or 'url'
    }

    showImportModal() {
        if (!this.initialized) {
            // Check if modal exists
            const modal = document.getElementById('importModal');
            if (!modal) {
                console.error('Import modal element not found');
                return;
            }
            this.initialized = true;
        }
        
        // Always reset the state when opening the modal
        this.resetSteps();
        
        // Show the modal
        modalManager.showModal('importModal', null, () => {
            // Cleanup handler when modal closes
            this.cleanupFolderBrowser();
            
            // Remove any injected styles
            this.removeInjectedStyles();
        });
        
        // Verify the modal is properly shown
        setTimeout(() => {
            this.ensureModalVisible();
        }, 50);
    }

    // 添加移除注入样式的方法
    removeInjectedStyles() {
        if (this.injectedStyles && this.injectedStyles.parentNode) {
            this.injectedStyles.parentNode.removeChild(this.injectedStyles);
            this.injectedStyles = null;
        }
        
        // Also reset any inline styles that might have been set with !important
        document.querySelectorAll('.import-step').forEach(step => {
            step.style.cssText = '';
        });
    }

    resetSteps() {
        // Remove any existing injected styles
        this.removeInjectedStyles();
        
        // Show the first step
        this.showStep('uploadStep');
        
        // Reset file input
        const fileInput = document.getElementById('recipeImageUpload');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Reset URL input
        const urlInput = document.getElementById('imageUrlInput');
        if (urlInput) {
            urlInput.value = '';
        }
        
        // Reset error messages
        const uploadError = document.getElementById('uploadError');
        if (uploadError) {
            uploadError.textContent = '';
        }
        
        const urlError = document.getElementById('urlError');
        if (urlError) {
            urlError.textContent = '';
        }
        
        // Reset recipe name input
        const recipeName = document.getElementById('recipeName');
        if (recipeName) {
            recipeName.value = '';
        }
        
        // Reset tags container
        const tagsContainer = document.getElementById('tagsContainer');
        if (tagsContainer) {
            tagsContainer.innerHTML = '<div class="empty-tags">No tags added</div>';
        }
        
        // Reset state variables
        this.recipeImage = null;
        this.recipeData = null;
        this.recipeName = '';
        this.recipeTags = [];
        this.missingLoras = [];
        this.downloadableLoRAs = [];
        
        // Reset import mode to upload
        this.importMode = 'upload';
        this.toggleImportMode('upload');
        
        // Clear selected folder and remove selection from UI
        this.selectedFolder = '';
        const folderBrowser = document.getElementById('importFolderBrowser');
        if (folderBrowser) {
            folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                f.classList.remove('selected'));
        }
        
        // Clear missing LoRAs list if it exists
        const missingLorasList = document.getElementById('missingLorasList');
        if (missingLorasList) {
            missingLorasList.innerHTML = '';
        }
        
        // Reset total download size
        const totalSizeDisplay = document.getElementById('totalDownloadSize');
        if (totalSizeDisplay) {
            totalSizeDisplay.textContent = 'Calculating...';
        }
    }

    toggleImportMode(mode) {
        this.importMode = mode;
        
        // Update toggle buttons
        const uploadBtn = document.querySelector('.toggle-btn[data-mode="upload"]');
        const urlBtn = document.querySelector('.toggle-btn[data-mode="url"]');
        
        if (uploadBtn && urlBtn) {
            if (mode === 'upload') {
                uploadBtn.classList.add('active');
                urlBtn.classList.remove('active');
            } else {
                uploadBtn.classList.remove('active');
                urlBtn.classList.add('active');
            }
        }
        
        // Show/hide appropriate sections
        const uploadSection = document.getElementById('uploadSection');
        const urlSection = document.getElementById('urlSection');
        
        if (uploadSection && urlSection) {
            if (mode === 'upload') {
                uploadSection.style.display = 'block';
                urlSection.style.display = 'none';
            } else {
                uploadSection.style.display = 'none';
                urlSection.style.display = 'block';
            }
        }
        
        // Clear error messages
        const uploadError = document.getElementById('uploadError');
        const urlError = document.getElementById('urlError');
        
        if (uploadError) uploadError.textContent = '';
        if (urlError) urlError.textContent = '';
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        const errorElement = document.getElementById('uploadError');
        
        if (!file) {
            return;
        }
        
        // Validate file type
        if (!file.type.match('image.*')) {
            errorElement.textContent = 'Please select an image file';
            return;
        }
        
        // Reset error
        errorElement.textContent = '';
        this.recipeImage = file;
        
        // Auto-proceed to next step if file is selected
        this.uploadAndAnalyzeImage();
    }

    async handleUrlInput() {
        const urlInput = document.getElementById('imageUrlInput');
        const errorElement = document.getElementById('urlError');
        const url = urlInput.value.trim();
        
        // Validate URL
        if (!url) {
            errorElement.textContent = 'Please enter a URL';
            return;
        }
        
        // Basic URL validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            errorElement.textContent = 'Please enter a valid URL';
            return;
        }
        
        // Reset error
        errorElement.textContent = '';
        
        // Show loading indicator
        this.loadingManager.showSimpleLoading('Fetching image from URL...');
        
        try {
            // Call API to analyze the URL
            await this.analyzeImageFromUrl(url);
        } catch (error) {
            errorElement.textContent = error.message || 'Failed to fetch image from URL';
        } finally {
            this.loadingManager.hide();
        }
    }

    async analyzeImageFromUrl(url) {
        try {
            // Call the API with URL data
            const response = await fetch('/api/recipes/analyze-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to analyze image from URL');
            }
            
            // Get recipe data from response
            this.recipeData = await response.json();
            
            // Check if we have an error message
            if (this.recipeData.error) {
                throw new Error(this.recipeData.error);
            }
            
            // Check if we have valid recipe data
            if (!this.recipeData || !this.recipeData.loras || this.recipeData.loras.length === 0) {
                throw new Error('No LoRA information found in this image');
            }
            
            // Find missing LoRAs
            this.missingLoras = this.recipeData.loras.filter(lora => !lora.existsLocally);
            
            // Proceed to recipe details step
            this.showRecipeDetailsStep();
            
        } catch (error) {
            console.error('Error analyzing URL:', error);
            throw error;
        }
    }

    async uploadAndAnalyzeImage() {
        if (!this.recipeImage) {
            showToast('Please select an image first', 'error');
            return;
        }
        
        try {
            this.loadingManager.showSimpleLoading('Analyzing image metadata...');
            
            // Create form data for upload
            const formData = new FormData();
            formData.append('image', this.recipeImage);
            
            // Upload image for analysis
            const response = await fetch('/api/recipes/analyze-image', {
                method: 'POST',
                body: formData
            });
             
            // Get recipe data from response
            this.recipeData = await response.json();

            console.log('Recipe data:', this.recipeData);
            
            // Check if we have an error message
            if (this.recipeData.error) {
                throw new Error(this.recipeData.error);
            }
            
            // Check if we have valid recipe data
            if (!this.recipeData || !this.recipeData.loras || this.recipeData.loras.length === 0) {
                throw new Error('No LoRA information found in this image');
            }
            
            // Store generation parameters if available
            if (this.recipeData.gen_params) {
                console.log('Generation parameters found:', this.recipeData.gen_params);
            }
            
            // Find missing LoRAs
            this.missingLoras = this.recipeData.loras.filter(lora => !lora.existsLocally);
            
            // Proceed to recipe details step
            this.showRecipeDetailsStep();
            
        } catch (error) {
            document.getElementById('uploadError').textContent = error.message;
        } finally {
            this.loadingManager.hide();
        }
    }

    showRecipeDetailsStep() {
        this.showStep('detailsStep');
        
        // Set default recipe name from prompt or image filename
        const recipeName = document.getElementById('recipeName');
        
        // Check if we have recipe metadata from a shared recipe
        if (this.recipeData && this.recipeData.from_recipe_metadata) {
            // Use title from recipe metadata
            if (this.recipeData.title) {
                recipeName.value = this.recipeData.title;
                this.recipeName = this.recipeData.title;
            }
            
            // Use tags from recipe metadata
            if (this.recipeData.tags && Array.isArray(this.recipeData.tags)) {
                this.recipeTags = [...this.recipeData.tags];
                this.updateTagsDisplay();
            }
        } else if (this.recipeData && this.recipeData.gen_params && this.recipeData.gen_params.prompt) {
            // Use the first 10 words from the prompt as the default recipe name
            const promptWords = this.recipeData.gen_params.prompt.split(' ');
            const truncatedPrompt = promptWords.slice(0, 10).join(' ');
            recipeName.value = truncatedPrompt;
            this.recipeName = truncatedPrompt;
            
            // Set up click handler to select all text for easy editing
            if (!recipeName.hasSelectAllHandler) {
                recipeName.addEventListener('click', function() {
                    this.select();
                });
                recipeName.hasSelectAllHandler = true;
            }
        } else if (this.recipeImage && !recipeName.value) {
            // Fallback to image filename if no prompt is available
            const fileName = this.recipeImage.name.split('.')[0];
            recipeName.value = fileName;
            this.recipeName = fileName;
        }
        
        // Always set up click handler for easy editing if not already set
        if (!recipeName.hasSelectAllHandler) {
            recipeName.addEventListener('click', function() {
                this.select();
            });
            recipeName.hasSelectAllHandler = true;
        }
        
        // Display the uploaded image in the preview
        const imagePreview = document.getElementById('recipeImagePreview');
        if (imagePreview) {
            if (this.recipeImage) {
                // For file upload mode
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.innerHTML = `<img src="${e.target.result}" alt="Recipe preview">`;
                };
                reader.readAsDataURL(this.recipeImage);
            } else if (this.recipeData && this.recipeData.image_base64) {
                // For URL mode - use the base64 image data returned from the backend
                imagePreview.innerHTML = `<img src="data:image/jpeg;base64,${this.recipeData.image_base64}" alt="Recipe preview">`;
            } else if (this.importMode === 'url') {
                // Fallback for URL mode if no base64 data
                const urlInput = document.getElementById('imageUrlInput');
                if (urlInput && urlInput.value) {
                    imagePreview.innerHTML = `<img src="${urlInput.value}" alt="Recipe preview" crossorigin="anonymous">`;
                }
            }
        }
        
        // Update LoRA count information
        const totalLoras = this.recipeData.loras.length;
        const existingLoras = this.recipeData.loras.filter(lora => lora.existsLocally).length;
        const loraCountInfo = document.getElementById('loraCountInfo');
        if (loraCountInfo) {
            loraCountInfo.textContent = `(${existingLoras}/${totalLoras} in library)`;
        }
        
        // Display LoRAs list
        const lorasList = document.getElementById('lorasList');
        if (lorasList) {
            lorasList.innerHTML = this.recipeData.loras.map(lora => {
                const existsLocally = lora.existsLocally;
                const isDeleted = lora.isDeleted;
                const isEarlyAccess = lora.isEarlyAccess;
                const localPath = lora.localPath || '';
                
                // Create status badge based on LoRA status
                let statusBadge;
                if (isDeleted) {
                    statusBadge = `<div class="deleted-badge">
                        <i class="fas fa-exclamation-circle"></i> Deleted from Civitai
                    </div>`;
                } else {
                    statusBadge = existsLocally ? 
                        `<div class="local-badge">
                            <i class="fas fa-check"></i> In Library
                            <div class="local-path">${localPath}</div>
                        </div>` :
                        `<div class="missing-badge">
                            <i class="fas fa-exclamation-triangle"></i> Not in Library
                        </div>`;
                }

                // Early access badge (shown additionally with other badges)
                let earlyAccessBadge = '';
                if (isEarlyAccess) {
                    // Format the early access end date if available
                    let earlyAccessInfo = 'This LoRA requires early access payment to download.';
                    if (lora.earlyAccessEndsAt) {
                        try {
                            const endDate = new Date(lora.earlyAccessEndsAt);
                            const formattedDate = endDate.toLocaleDateString();
                            earlyAccessInfo += ` Early access ends on ${formattedDate}.`;
                        } catch (e) {
                            console.warn('Failed to format early access date', e);
                        }
                    }
                    
                    earlyAccessBadge = `<div class="early-access-badge">
                        <i class="fas fa-clock"></i> Early Access
                        <div class="early-access-info">${earlyAccessInfo} Verify that you have purchased early access before downloading.</div>
                    </div>`;
                }

                // Format size if available
                const sizeDisplay = lora.size ? 
                    `<div class="size-badge">${this.formatFileSize(lora.size)}</div>` : '';

                return `
                    <div class="lora-item ${existsLocally ? 'exists-locally' : isDeleted ? 'is-deleted' : 'missing-locally'} ${isEarlyAccess ? 'is-early-access' : ''}">
                        <div class="lora-thumbnail">
                            <img src="${lora.thumbnailUrl || '/loras_static/images/no-preview.png'}" alt="LoRA preview">
                        </div>
                        <div class="lora-content">
                            <div class="lora-header">
                                <h3>${lora.name}</h3>
                                <div class="badge-container">
                                    ${statusBadge}
                                    ${earlyAccessBadge}
                                </div>
                            </div>
                            ${lora.version ? `<div class="lora-version">${lora.version}</div>` : ''}
                            <div class="lora-info">
                                ${lora.baseModel ? `<div class="base-model">${lora.baseModel}</div>` : ''}
                                ${sizeDisplay}
                                <div class="weight-badge">Weight: ${lora.weight || 1.0}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Check for early access loras and show warning if any exist
        const earlyAccessLoras = this.recipeData.loras.filter(lora => 
            lora.isEarlyAccess && !lora.existsLocally && !lora.isDeleted);
        if (earlyAccessLoras.length > 0) {
            // Show a warning about early access loras
            const warningMessage = `
                <div class="early-access-warning">
                    <div class="warning-icon"><i class="fas fa-clock"></i></div>
                    <div class="warning-content">
                        <div class="warning-title">${earlyAccessLoras.length} LoRA(s) require Early Access</div>
                        <div class="warning-text">
                            These LoRAs require a payment to access. Download will fail if you haven't purchased access.
                            You may need to log in to your Civitai account in browser settings.
                        </div>
                    </div>
                </div>
            `;
            
            // Show the warning message
            const buttonsContainer = document.querySelector('#detailsStep .modal-actions');
            if (buttonsContainer) {
                // Remove existing warning if any
                const existingWarning = document.getElementById('earlyAccessWarning');
                if (existingWarning) {
                    existingWarning.remove();
                }
                
                // Add new warning
                const warningContainer = document.createElement('div');
                warningContainer.id = 'earlyAccessWarning';
                warningContainer.innerHTML = warningMessage;
                buttonsContainer.parentNode.insertBefore(warningContainer, buttonsContainer);
            }
        }
        
        // Update Next button state based on missing LoRAs
        this.updateNextButtonState();
    }
    
    updateNextButtonState() {
        const nextButton = document.querySelector('#detailsStep .primary-btn');
        if (!nextButton) return;
        
        // Count deleted LoRAs
        const deletedLoras = this.recipeData.loras.filter(lora => lora.isDeleted).length;
        
        // If we have deleted LoRAs, show a warning and update button text
        if (deletedLoras > 0) {
            // Remove any existing warning
            const existingWarning = document.getElementById('deletedLorasWarning');
            if (existingWarning) {
                existingWarning.remove();
            }
            
            // Create a new warning container above the buttons
            const buttonsContainer = document.querySelector('#detailsStep .modal-actions') || nextButton.parentNode;
            const warningContainer = document.createElement('div');
            warningContainer.id = 'deletedLorasWarning';
            warningContainer.className = 'deleted-loras-warning';
            
            // Create warning message
            warningContainer.innerHTML = `
                <div class="warning-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="warning-content">
                    <div class="warning-title">${deletedLoras} LoRA(s) have been deleted from Civitai</div>
                    <div class="warning-text">These LoRAs cannot be downloaded. If you continue, they will be removed from the recipe.</div>
                </div>
            `;
            
            // Insert before the buttons container
            buttonsContainer.parentNode.insertBefore(warningContainer, buttonsContainer);
            
            // Update next button text to be more clear
            nextButton.textContent = 'Continue Without Deleted LoRAs';
        } else {
            // Remove warning if no deleted LoRAs
            const warningMsg = document.getElementById('deletedLorasWarning');
            if (warningMsg) {
                warningMsg.remove();
            }
            
            // If we have missing LoRAs (not deleted), show "Download Missing LoRAs"
            // Otherwise show "Save Recipe"
            const missingNotDeleted = this.recipeData.loras.filter(
                lora => !lora.existsLocally && !lora.isDeleted
            ).length;
            
            if (missingNotDeleted > 0) {
                nextButton.textContent = 'Download Missing LoRAs';
            } else {
                nextButton.textContent = 'Save Recipe';
            }
        }
    }

    handleRecipeNameChange(event) {
        this.recipeName = event.target.value.trim();
    }

    addTag() {
        const tagInput = document.getElementById('tagInput');
        const tag = tagInput.value.trim();
        
        if (!tag) return;
        
        if (!this.recipeTags.includes(tag)) {
            this.recipeTags.push(tag);
            this.updateTagsDisplay();
        }
        
        tagInput.value = '';
    }
    
    removeTag(tag) {
        this.recipeTags = this.recipeTags.filter(t => t !== tag);
        this.updateTagsDisplay();
    }
    
    updateTagsDisplay() {
        const tagsContainer = document.getElementById('tagsContainer');
        
        if (this.recipeTags.length === 0) {
            tagsContainer.innerHTML = '<div class="empty-tags">No tags added</div>';
            return;
        }
        
        tagsContainer.innerHTML = this.recipeTags.map(tag => `
            <div class="recipe-tag">
                ${tag}
                <i class="fas fa-times" onclick="importManager.removeTag('${tag}')"></i>
            </div>
        `).join('');
    }

    proceedFromDetails() {
        // Validate recipe name
        if (!this.recipeName) {
            showToast('Please enter a recipe name', 'error');
            return;
        }
        
        // Automatically mark all deleted LoRAs as excluded
        if (this.recipeData && this.recipeData.loras) {
            this.recipeData.loras.forEach(lora => {
                if (lora.isDeleted) {
                    lora.exclude = true;
                }
            });
        }
        
        // Update missing LoRAs list to exclude deleted LoRAs
        this.missingLoras = this.recipeData.loras.filter(lora => 
            !lora.existsLocally && !lora.isDeleted);
            
        // Check for early access loras and show warning if any exist
        const earlyAccessLoras = this.missingLoras.filter(lora => lora.isEarlyAccess);
        if (earlyAccessLoras.length > 0) {
            // Show a warning about early access loras
            const warningMessage = `
                <div class="early-access-warning">
                    <div class="warning-icon"><i class="fas fa-clock"></i></div>
                    <div class="warning-content">
                        <div class="warning-title">${earlyAccessLoras.length} LoRA(s) require Early Access</div>
                        <div class="warning-text">
                            These LoRAs require a payment to access. Download will fail if you haven't purchased access.
                            You may need to log in to your Civitai account in browser settings.
                        </div>
                    </div>
                </div>
            `;
            
            // Show the warning message
            const buttonsContainer = document.querySelector('#detailsStep .modal-actions');
            if (buttonsContainer) {
                // Remove existing warning if any
                const existingWarning = document.getElementById('earlyAccessWarning');
                if (existingWarning) {
                    existingWarning.remove();
                }
                
                // Add new warning
                const warningContainer = document.createElement('div');
                warningContainer.id = 'earlyAccessWarning';
                warningContainer.innerHTML = warningMessage;
                buttonsContainer.parentNode.insertBefore(warningContainer, buttonsContainer);
            }
        }
        
        // If we have downloadable missing LoRAs, go to location step
        if (this.missingLoras.length > 0) {
            // Store only downloadable LoRAs for the download step
            this.downloadableLoRAs = this.missingLoras;
            this.proceedToLocation();
        } else {
            // Otherwise, save the recipe directly
            this.saveRecipe();
        }
    }

    async proceedToLocation() {
        
        // Show the location step with special handling
        this.showStep('locationStep');
        
        // Double-check after a short delay to ensure the step is visible
        setTimeout(() => {
            const locationStep = document.getElementById('locationStep');
            if (locationStep.style.display !== 'block' || 
                window.getComputedStyle(locationStep).display !== 'block') {
                // Force display again
                locationStep.style.display = 'block';
                
                // If still not visible, try with injected style
                if (window.getComputedStyle(locationStep).display !== 'block') {
                    this.injectedStyles = document.createElement('style');
                    this.injectedStyles.innerHTML = `
                        #locationStep {
                            display: block !important;
                            opacity: 1 !important;
                            visibility: visible !important;
                        }
                    `;
                    document.head.appendChild(this.injectedStyles);
                }
            }
        }, 100);
        
        try {
            // Display missing LoRAs that will be downloaded
            const missingLorasList = document.getElementById('missingLorasList');
            if (missingLorasList && this.downloadableLoRAs.length > 0) {
                // Calculate total size
                const totalSize = this.downloadableLoRAs.reduce((sum, lora) => {
                    return sum + (lora.size ? parseInt(lora.size) : 0);
                }, 0);
                
                // Update total size display
                const totalSizeDisplay = document.getElementById('totalDownloadSize');
                if (totalSizeDisplay) {
                    totalSizeDisplay.textContent = this.formatFileSize(totalSize);
                }
                
                // Update header to include count of missing LoRAs
                const missingLorasHeader = document.querySelector('.summary-header h3');
                if (missingLorasHeader) {
                    missingLorasHeader.innerHTML = `Missing LoRAs <span class="lora-count-badge">(${this.downloadableLoRAs.length})</span> <span id="totalDownloadSize" class="total-size-badge">${this.formatFileSize(totalSize)}</span>`;
                }
                
                // Generate missing LoRAs list
                missingLorasList.innerHTML = this.downloadableLoRAs.map(lora => {
                    const sizeDisplay = lora.size ? this.formatFileSize(lora.size) : 'Unknown size';
                    const baseModel = lora.baseModel ? `<span class="lora-base-model">${lora.baseModel}</span>` : '';
                    const isEarlyAccess = lora.isEarlyAccess;
                    
                    // Early access badge
                    let earlyAccessBadge = '';
                    if (isEarlyAccess) {
                        earlyAccessBadge = `<span class="early-access-badge">
                            <i class="fas fa-clock"></i> Early Access
                        </span>`;
                    }
                    
                    return `
                        <div class="missing-lora-item ${isEarlyAccess ? 'is-early-access' : ''}">
                            <div class="missing-lora-info">
                                <div class="missing-lora-name">${lora.name}</div>
                                ${baseModel}
                                ${earlyAccessBadge}
                            </div>
                            <div class="missing-lora-size">${sizeDisplay}</div>
                        </div>
                    `;
                }).join('');
                
                // Set up toggle for missing LoRAs list
                const toggleBtn = document.getElementById('toggleMissingLorasList');
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', () => {
                        missingLorasList.classList.toggle('collapsed');
                        const icon = toggleBtn.querySelector('i');
                        if (icon) {
                            icon.classList.toggle('fa-chevron-down');
                            icon.classList.toggle('fa-chevron-up');
                        }
                    });
                }
            }
            
            // Fetch LoRA roots
            const rootsResponse = await fetch('/api/lora-roots');
            if (!rootsResponse.ok) {
                throw new Error(`Failed to fetch LoRA roots: ${rootsResponse.status}`);
            }
            
            const rootsData = await rootsResponse.json();
            const loraRoot = document.getElementById('importLoraRoot');
            if (loraRoot) {
                loraRoot.innerHTML = rootsData.roots.map(root => 
                    `<option value="${root}">${root}</option>`
                ).join('');
            }
            
            // Fetch folders
            const foldersResponse = await fetch('/api/folders');
            if (!foldersResponse.ok) {
                throw new Error(`Failed to fetch folders: ${foldersResponse.status}`);
            }
            
            const foldersData = await foldersResponse.json();
            const folderBrowser = document.getElementById('importFolderBrowser');
            if (folderBrowser) {
                folderBrowser.innerHTML = foldersData.folders.map(folder => 
                    folder ? `<div class="folder-item" data-folder="${folder}">${folder}</div>` : ''
                ).join('');
            }

            // Initialize folder browser after loading data
            this.initializeFolderBrowser();
        } catch (error) {
            console.error('Error in API calls:', error);
            showToast(error.message, 'error');
        }
    }

    backToUpload() {
        this.showStep('uploadStep');
        
        // Reset file input to ensure it can trigger change events again
        const fileInput = document.getElementById('recipeImageUpload');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Reset URL input
        const urlInput = document.getElementById('imageUrlInput');
        if (urlInput) {
            urlInput.value = '';
        }
        
        // Clear any previous error messages
        const uploadError = document.getElementById('uploadError');
        if (uploadError) {
            uploadError.textContent = '';
        }
        
        const urlError = document.getElementById('urlError');
        if (urlError) {
            urlError.textContent = '';
        }
    }

    backToDetails() {
        this.showStep('detailsStep');
    }

    async saveRecipe() {
        if (!this.recipeName) {
            showToast('Please enter a recipe name', 'error');
            return;
        }
        
        try {
            // First save the recipe
            this.loadingManager.showSimpleLoading('Saving recipe...');
            
            // Create form data for save request
            const formData = new FormData();
            
            // Handle image data - either from file upload or from URL mode
            if (this.recipeImage) {
                // File upload mode
                formData.append('image', this.recipeImage);
            } else if (this.recipeData && this.recipeData.image_base64) {
                // URL mode with base64 data
                formData.append('image_base64', this.recipeData.image_base64);
            } else if (this.importMode === 'url') {
                // Fallback for URL mode - tell backend to fetch the image again
                const urlInput = document.getElementById('imageUrlInput');
                if (urlInput && urlInput.value) {
                    formData.append('image_url', urlInput.value);
                } else {
                    throw new Error('No image data available');
                }
            } else {
                throw new Error('No image data available');
            }
            
            formData.append('name', this.recipeName);
            formData.append('tags', JSON.stringify(this.recipeTags));
            
            // Prepare complete metadata including generation parameters
            const completeMetadata = {
                base_model: this.recipeData.base_model || "",
                loras: this.recipeData.loras || [],
                gen_params: this.recipeData.gen_params || {},
                raw_metadata: this.recipeData.raw_metadata || {}
            };
            
            formData.append('metadata', JSON.stringify(completeMetadata));
            
            // Send save request
            const response = await fetch('/api/recipes/save', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (result.success) {
                // Handle successful save
                
                
                // Check if we need to download LoRAs
                if (this.downloadableLoRAs && this.downloadableLoRAs.length > 0) {
                    // For download, we need to validate the target path
                    const loraRoot = document.getElementById('importLoraRoot')?.value;
                    if (!loraRoot) {
                        throw new Error('Please select a LoRA root directory');
                    }
                    
                    // Build target path
                    let targetPath = loraRoot;
                    if (this.selectedFolder) {
                        targetPath += '/' + this.selectedFolder;
                    }
                    
                    const newFolder = document.getElementById('importNewFolder')?.value?.trim();
                    if (newFolder) {
                        targetPath += '/' + newFolder;
                    }
                    
                    // Set up WebSocket for progress updates
                    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
                    const ws = new WebSocket(`${wsProtocol}${window.location.host}/ws/fetch-progress`);
                    
                    // Show enhanced loading with progress details for multiple items
                    const updateProgress = this.loadingManager.showDownloadProgress(this.downloadableLoRAs.length);
                    
                    let completedDownloads = 0;
                    let failedDownloads = 0;
                    let earlyAccessFailures = 0;
                    let currentLoraProgress = 0;
                    
                    // Set up progress tracking for current download
                    ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        if (data.status === 'progress') {
                            // Update current LoRA progress
                            currentLoraProgress = data.progress;
                            
                            // Get current LoRA name
                            const currentLora = this.downloadableLoRAs[completedDownloads + failedDownloads];
                            const loraName = currentLora ? currentLora.name : '';
                            
                            // Update progress display
                            updateProgress(currentLoraProgress, completedDownloads, loraName);
                            
                            // Add more detailed status messages based on progress
                            if (currentLoraProgress < 3) {
                                this.loadingManager.setStatus(
                                    `Preparing download for LoRA ${completedDownloads + failedDownloads + 1}/${this.downloadableLoRAs.length}`
                                );
                            } else if (currentLoraProgress === 3) {
                                this.loadingManager.setStatus(
                                    `Downloaded preview for LoRA ${completedDownloads + failedDownloads + 1}/${this.downloadableLoRAs.length}`
                                );
                            } else if (currentLoraProgress > 3 && currentLoraProgress < 100) {
                                this.loadingManager.setStatus(
                                    `Downloading LoRA ${completedDownloads + failedDownloads + 1}/${this.downloadableLoRAs.length}`
                                );
                            } else {
                                this.loadingManager.setStatus(
                                    `Finalizing LoRA ${completedDownloads + failedDownloads + 1}/${this.downloadableLoRAs.length}`
                                );
                            }
                        }
                    };
                    
                    for (let i = 0; i < this.downloadableLoRAs.length; i++) {
                        const lora = this.downloadableLoRAs[i];
                        
                        // Reset current LoRA progress for new download
                        currentLoraProgress = 0;
                        
                        // Initial status update for new LoRA
                        this.loadingManager.setStatus(`Starting download for LoRA ${i+1}/${this.downloadableLoRAs.length}`);
                        updateProgress(0, completedDownloads, lora.name);
                        
                        try {
                            // Download the LoRA
                            const response = await fetch('/api/download-lora', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    download_url: lora.downloadUrl,
                                    lora_root: loraRoot,
                                    relative_path: targetPath.replace(loraRoot + '/', '')
                                })
                            });
                            
                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error(`Failed to download LoRA ${lora.name}: ${errorText}`);
                                
                                // Check if this is an early access error (status 401 is the key indicator)
                                if (response.status === 401 || 
                                   (errorText.toLowerCase().includes('early access') || 
                                    errorText.toLowerCase().includes('purchase'))) {
                                    earlyAccessFailures++;
                                    this.loadingManager.setStatus(
                                        `Failed to download ${lora.name}: Early Access required`
                                    );
                                }
                                
                                failedDownloads++;
                                // Continue with next download
                            } else {
                                completedDownloads++;
                                
                                // Update progress to show completion of current LoRA
                                updateProgress(100, completedDownloads, '');
                                
                                if (completedDownloads + failedDownloads < this.downloadableLoRAs.length) {
                                    this.loadingManager.setStatus(
                                        `Completed ${completedDownloads}/${this.downloadableLoRAs.length} LoRAs. Starting next download...`
                                    );
                                }
                            }
                        } catch (downloadError) {
                            console.error(`Error downloading LoRA ${lora.name}:`, downloadError);
                            failedDownloads++;
                            // Continue with next download
                        }
                    }
                    
                    // Close WebSocket
                    ws.close();
                    
                    // Show appropriate completion message based on results
                    if (failedDownloads === 0) {
                        showToast(`All ${completedDownloads} LoRAs downloaded successfully`, 'success');
                    } else {
                        if (earlyAccessFailures > 0) {
                            showToast(
                                `Downloaded ${completedDownloads} of ${this.downloadableLoRAs.length} LoRAs. ${earlyAccessFailures} failed due to Early Access restrictions.`,
                                'error'
                            );
                        } else {
                            showToast(`Downloaded ${completedDownloads} of ${this.downloadableLoRAs.length} LoRAs`, 'error');
                        }
                    }
                }

                // Show success message for recipe save
                showToast(`Recipe "${this.recipeName}" saved successfully`, 'success');
                
                // Close modal and reload recipes
                modalManager.closeModal('importModal');
                
                window.recipeManager.loadRecipes(true); // true to reset pagination
                
            } else {
                // Handle error
                console.error(`Failed to save recipe: ${result.error}`);
                // Show error message to user
                showToast(result.error, 'error');
            }
            
        } catch (error) {
            console.error('Error saving recipe:', error);
            showToast(error.message, 'error');
        } finally {
            this.loadingManager.hide();
        }
    }

    initializeFolderBrowser() {
        const folderBrowser = document.getElementById('importFolderBrowser');
        if (!folderBrowser) return;

        // Cleanup existing handler if any
        this.cleanupFolderBrowser();

        // Create new handler
        this.folderClickHandler = (event) => {
            const folderItem = event.target.closest('.folder-item');
            if (!folderItem) return;

            if (folderItem.classList.contains('selected')) {
                folderItem.classList.remove('selected');
                this.selectedFolder = '';
            } else {
                folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                    f.classList.remove('selected'));
                folderItem.classList.add('selected');
                this.selectedFolder = folderItem.dataset.folder;
            }
            
            // Update path display after folder selection
            this.updateTargetPath();
        };

        // Add the new handler
        folderBrowser.addEventListener('click', this.folderClickHandler);
        
        // Add event listeners for path updates
        const loraRoot = document.getElementById('importLoraRoot');
        const newFolder = document.getElementById('importNewFolder');
        
        if (loraRoot) loraRoot.addEventListener('change', this.updateTargetPath);
        if (newFolder) newFolder.addEventListener('input', this.updateTargetPath);
        
        // Update initial path
        this.updateTargetPath();
    }

    cleanupFolderBrowser() {
        if (this.folderClickHandler) {
            const folderBrowser = document.getElementById('importFolderBrowser');
            if (folderBrowser) {
                folderBrowser.removeEventListener('click', this.folderClickHandler);
                this.folderClickHandler = null;
            }
        }
        
        // Remove path update listeners
        const loraRoot = document.getElementById('importLoraRoot');
        const newFolder = document.getElementById('importNewFolder');
        
        if (loraRoot) loraRoot.removeEventListener('change', this.updateTargetPath);
        if (newFolder) newFolder.removeEventListener('input', this.updateTargetPath);
    }
    
    updateTargetPath() {
        const pathDisplay = document.getElementById('importTargetPathDisplay');
        if (!pathDisplay) return;
        
        const loraRoot = document.getElementById('importLoraRoot')?.value || '';
        const newFolder = document.getElementById('importNewFolder')?.value?.trim() || '';
        
        let fullPath = loraRoot || 'Select a LoRA root directory'; 
        
        if (loraRoot) {
            if (this.selectedFolder) {
                fullPath += '/' + this.selectedFolder;
            }
            if (newFolder) {
                fullPath += '/' + newFolder;
            }
        }
    
        pathDisplay.innerHTML = `<span class="path-text">${fullPath}</span>`;
    }

    showStep(stepId) {
        
        // First, remove any injected styles to prevent conflicts
        this.removeInjectedStyles();
        
        // Hide all steps first
        document.querySelectorAll('.import-step').forEach(step => {
            step.style.display = 'none';
        });
        
        // Show target step with a monitoring mechanism
        const targetStep = document.getElementById(stepId);
        if (targetStep) {
            // Use direct style setting
            targetStep.style.display = 'block';
            
            // For the locationStep specifically, we need additional measures
            if (stepId === 'locationStep') {
                // Create a more persistent style to override any potential conflicts
                this.injectedStyles = document.createElement('style');
                this.injectedStyles.innerHTML = `
                    #locationStep {
                        display: block !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                    }
                `;
                document.head.appendChild(this.injectedStyles);
                
                // Force layout recalculation
                targetStep.offsetHeight;
                
                // Set up a monitor to ensure the step remains visible
                setTimeout(() => {
                    if (targetStep.style.display !== 'block') {
                        targetStep.style.display = 'block';
                    }
                    
                    // Check dimensions again after a short delay
                    const newRect = targetStep.getBoundingClientRect();
                }, 50);
            }
            
            // Scroll modal content to top
            const modalContent = document.querySelector('#importModal .modal-content');
            if (modalContent) {
                modalContent.scrollTop = 0;
            }
        }
    }

    // Add a helper method to format file sizes
    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    // Add this method to ensure the modal is fully visible and initialized
    ensureModalVisible() {
        const importModal = document.getElementById('importModal');
        if (!importModal) {
            console.error('Import modal element not found');
            return false;
        }
        
        // Check if modal is actually visible
        const modalDisplay = window.getComputedStyle(importModal).display;
        if (modalDisplay !== 'block') {
            console.error('Import modal is not visible, display: ' + modalDisplay);
            return false;
        }
        
        return true;
    }
}
