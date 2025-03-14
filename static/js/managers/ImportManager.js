import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { LoadingManager } from './LoadingManager.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';

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
    }

    showImportModal() {
        console.log('Showing import modal...');
        if (!this.initialized) {
            // Check if modal exists
            const modal = document.getElementById('importModal');
            if (!modal) {
                console.error('Import modal element not found');
                return;
            }
            this.initialized = true;
        }
        
        modalManager.showModal('importModal', null, () => {
            // Cleanup handler when modal closes
            this.cleanupFolderBrowser();
        });
        this.resetSteps();
    }

    resetSteps() {
        document.querySelectorAll('.import-step').forEach(step => step.style.display = 'none');
        document.getElementById('uploadStep').style.display = 'block';
        
        // Reset file input
        const fileInput = document.getElementById('recipeImageUpload');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Reset error message
        const errorElement = document.getElementById('uploadError');
        if (errorElement) {
            errorElement.textContent = '';
        }
        
        // Reset preview
        const previewElement = document.getElementById('imagePreview');
        if (previewElement) {
            previewElement.innerHTML = '<div class="placeholder">Image preview will appear here</div>';
        }
        
        // Reset state variables
        this.recipeImage = null;
        this.recipeData = null;
        this.recipeName = '';
        this.recipeTags = [];
        this.missingLoras = [];
        
        // Clear selected folder and remove selection from UI
        this.selectedFolder = '';
        const folderBrowser = document.getElementById('importFolderBrowser');
        if (folderBrowser) {
            folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                f.classList.remove('selected'));
        }
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
            document.getElementById('uploadError').textContent = error.message;
        } finally {
            this.loadingManager.hide();
        }
    }

    showRecipeDetailsStep() {
        document.getElementById('uploadStep').style.display = 'none';
        document.getElementById('detailsStep').style.display = 'block';
        
        // Set default recipe name from image filename
        const recipeName = document.getElementById('recipeName');
        if (this.recipeImage && !recipeName.value) {
            const fileName = this.recipeImage.name.split('.')[0];
            recipeName.value = fileName;
            this.recipeName = fileName;
        }
        
        // Display the uploaded image in the preview
        const imagePreview = document.getElementById('recipeImagePreview');
        if (imagePreview && this.recipeImage) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.innerHTML = `<img src="${e.target.result}" alt="Recipe preview">`;
            };
            reader.readAsDataURL(this.recipeImage);
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
                    <div class="lora-item ${existsLocally ? 'exists-locally' : 'missing-locally'}">
                        <div class="lora-thumbnail">
                            <img src="${lora.thumbnailUrl || '/loras_static/images/no-preview.png'}" alt="LoRA preview">
                        </div>
                        <div class="lora-content">
                            <div class="lora-header">
                                <h3>${lora.name}</h3>
                                ${localStatus}
                            </div>
                            ${lora.version ? `<div class="lora-version">${lora.version}</div>` : ''}
                            <div class="lora-info">
                                ${lora.baseModel ? `<div class="base-model">${lora.baseModel}</div>` : ''}
                                <div class="weight-badge">Weight: ${lora.weight || 1.0}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Update Next button state based on missing LoRAs
        this.updateNextButtonState();
    }
    
    updateNextButtonState() {
        const nextButton = document.querySelector('#detailsStep .primary-btn');
        if (!nextButton) return;
        
        // If we have missing LoRAs, show "Download Missing LoRAs"
        // Otherwise show "Save Recipe"
        if (this.missingLoras.length > 0) {
            nextButton.textContent = 'Download Missing LoRAs';
        } else {
            nextButton.textContent = 'Save Recipe';
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
        
        // If we have missing LoRAs, go to location step
        if (this.missingLoras.length > 0) {
            this.proceedToLocation();
        } else {
            // Otherwise, save the recipe directly
            this.saveRecipe();
        }
    }

    async proceedToLocation() {
        document.getElementById('detailsStep').style.display = 'none';
        document.getElementById('locationStep').style.display = 'block';
        
        try {
            this.loadingManager.showSimpleLoading('Loading download options...');
            
            const response = await fetch('/api/lora-roots');
            if (!response.ok) {
                throw new Error('Failed to fetch LoRA roots');
            }
            
            const data = await response.json();
            const loraRoot = document.getElementById('importLoraRoot');
            
            // Check if we have roots
            if (!data.roots || data.roots.length === 0) {
                throw new Error('No LoRA root directories configured');
            }
            
            // Populate roots dropdown
            loraRoot.innerHTML = data.roots.map(root => 
                `<option value="${root}">${root}</option>`
            ).join('');

            // Initialize folder browser after loading roots
            await this.initializeFolderBrowser();
            
            // Display missing LoRAs
            const missingLorasList = document.getElementById('missingLorasList');
            if (missingLorasList) {
                missingLorasList.innerHTML = this.missingLoras.map(lora => `
                    <div class="missing-lora-item">
                        <div class="lora-name">${lora.name}</div>
                        <div class="lora-type">${lora.type || 'lora'}</div>
                    </div>
                `).join('');
            }
            
            // Update target path display
            this.updateTargetPath();
            
        } catch (error) {
            console.error('Error in proceedToLocation:', error);
            showToast(error.message, 'error');
            // Go back to details step on error
            this.backToDetails();
        } finally {
            this.loadingManager.hide();
        }
    }

    backToUpload() {
        document.getElementById('detailsStep').style.display = 'none';
        document.getElementById('uploadStep').style.display = 'block';
    }

    backToDetails() {
        document.getElementById('locationStep').style.display = 'none';
        document.getElementById('detailsStep').style.display = 'block';
    }

    async saveRecipe() {
        try {
            // If we're in the location step, we need to download missing LoRAs first
            if (document.getElementById('locationStep').style.display !== 'none') {
                const loraRoot = document.getElementById('importLoraRoot').value;
                const newFolder = document.getElementById('importNewFolder').value.trim();
                
                if (!loraRoot) {
                    showToast('Please select a LoRA root directory', 'error');
                    return;
                }
                
                // Construct relative path
                let targetFolder = '';
                if (this.selectedFolder) {
                    targetFolder = this.selectedFolder;
                }
                if (newFolder) {
                    targetFolder = targetFolder ? 
                        `${targetFolder}/${newFolder}` : newFolder;
                }
                
                // Show loading with progress bar for download
                this.loadingManager.show('Downloading missing LoRAs...', 0);
                
                // Setup WebSocket for progress updates
                const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
                const ws = new WebSocket(`${wsProtocol}${window.location.host}/ws/fetch-progress`);
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.status === 'progress') {
                        this.loadingManager.setProgress(data.progress);
                        this.loadingManager.setStatus(`Downloading: ${data.progress}%`);
                    }
                };
                
                // Download missing LoRAs
                const downloadResponse = await fetch('/api/recipes/download-missing-loras', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        loras: this.missingLoras,
                        lora_root: loraRoot,
                        relative_path: targetFolder
                    })
                });
                
                if (!downloadResponse.ok) {
                    throw new Error(await downloadResponse.text());
                }
                
                // Update missing LoRAs with downloaded paths
                const downloadResult = await downloadResponse.json();
                this.recipeData.loras = this.recipeData.loras.map(lora => {
                    const downloaded = downloadResult.downloaded.find(d => d.id === lora.id);
                    if (downloaded) {
                        return {
                            ...lora,
                            existsLocally: true,
                            localPath: downloaded.localPath
                        };
                    }
                    return lora;
                });
            }
            
            // Now save the recipe
            this.loadingManager.showSimpleLoading('Saving recipe...');
            
            // Create form data for recipe save
            const formData = new FormData();
            formData.append('image', this.recipeImage);
            formData.append('name', this.recipeName);
            formData.append('tags', JSON.stringify(this.recipeTags));
            formData.append('recipe_data', JSON.stringify(this.recipeData));
            
            // Save recipe
            const saveResponse = await fetch('/api/recipes/save', {
                method: 'POST',
                body: formData
            });
            
            if (!saveResponse.ok) {
                throw new Error(await saveResponse.text());
            }
            
            showToast('Recipe saved successfully', 'success');
            modalManager.closeModal('importModal');
            
            // Reload recipes
            window.location.reload();
            
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            this.loadingManager.hide();
        }
    }

    // Add new method to handle folder selection
    async initializeFolderBrowser() {
        const folderBrowser = document.getElementById('importFolderBrowser');
        if (!folderBrowser) return;

        // Cleanup existing handler if any
        this.cleanupFolderBrowser();

        try {
            // Get the selected root
            const loraRoot = document.getElementById('importLoraRoot').value;
            if (!loraRoot) {
                folderBrowser.innerHTML = '<div class="empty-folder">Please select a LoRA root directory</div>';
                return;
            }
            
            // Fetch folders for the selected root
            const response = await fetch(`/api/folders?root=${encodeURIComponent(loraRoot)}`);
            if (!response.ok) {
                throw new Error('Failed to fetch folders');
            }
            
            const data = await response.json();
            
            // Display folders
            if (data.folders && data.folders.length > 0) {
                folderBrowser.innerHTML = data.folders.map(folder => `
                    <div class="folder-item" data-folder="${folder}">
                        <i class="fas fa-folder"></i> ${folder}
                    </div>
                `).join('');
            } else {
                folderBrowser.innerHTML = '<div class="empty-folder">No folders found</div>';
            }
            
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
            
        } catch (error) {
            console.error('Error initializing folder browser:', error);
            folderBrowser.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
        
        // Add event listeners for path updates
        const loraRoot = document.getElementById('importLoraRoot');
        const newFolder = document.getElementById('importNewFolder');
        
        loraRoot.addEventListener('change', async () => {
            await this.initializeFolderBrowser();
            this.updateTargetPath();
        });
        
        newFolder.addEventListener('input', this.updateTargetPath);
        
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
    
    // Add new method to update target path
    updateTargetPath() {
        const pathDisplay = document.getElementById('importTargetPathDisplay');
        if (!pathDisplay) return;
        
        const loraRoot = document.getElementById('importLoraRoot')?.value || '';
        const newFolder = document.getElementById('importNewFolder')?.value.trim() || '';
        
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
} 