import { showToast } from '../../utils/uiHelpers.js';

export class DownloadManager {
    constructor(importManager) {
        this.importManager = importManager;
    }

    async saveRecipe() {
        // Check if we're in download-only mode (for existing recipe)
        const isDownloadOnly = !!this.importManager.recipeId;
        
        if (!isDownloadOnly && !this.importManager.recipeName) {
            showToast('Please enter a recipe name', 'error');
            return;
        }
        
        try {
            // Show progress indicator
            this.importManager.loadingManager.showSimpleLoading(isDownloadOnly ? 'Downloading LoRAs...' : 'Saving recipe...');
            
            // Only send the complete recipe to save if not in download-only mode
            if (!isDownloadOnly) {
                // Create FormData object for saving recipe
                const formData = new FormData();
                
                // Add image data - depends on import mode
                if (this.importManager.recipeImage) {
                    // Direct upload
                    formData.append('image', this.importManager.recipeImage);
                } else if (this.importManager.recipeData && this.importManager.recipeData.image_base64) {
                    // URL mode with base64 data
                    formData.append('image_base64', this.importManager.recipeData.image_base64);
                } else if (this.importManager.importMode === 'url') {
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
                
                formData.append('name', this.importManager.recipeName);
                formData.append('tags', JSON.stringify(this.importManager.recipeTags));
                
                // Prepare complete metadata including generation parameters
                const completeMetadata = {
                    base_model: this.importManager.recipeData.base_model || "",
                    loras: this.importManager.recipeData.loras || [],
                    gen_params: this.importManager.recipeData.gen_params || {},
                    raw_metadata: this.importManager.recipeData.raw_metadata || {}
                };
                
                // Add source_path to metadata to track where the recipe was imported from
                if (this.importManager.importMode === 'url') {
                    const urlInput = document.getElementById('imageUrlInput');
                    if (urlInput && urlInput.value) {
                        completeMetadata.source_path = urlInput.value;
                    }
                }
                
                formData.append('metadata', JSON.stringify(completeMetadata));
            
                // Send save request
                const response = await fetch('/api/recipes/save', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();

                if (!result.success) {
                    // Handle save error
                    console.error("Failed to save recipe:", result.error);
                    showToast(result.error, 'error');
                    // Close modal
                    modalManager.closeModal('importModal');
                    return;
                }
            }

            // Check if we need to download LoRAs
            let failedDownloads = 0;
            if (this.importManager.downloadableLoRAs && this.importManager.downloadableLoRAs.length > 0) {
                await this.downloadMissingLoras();
            }

            // Show success message
            if (isDownloadOnly) {
                if (failedDownloads === 0) {    
                    showToast('LoRAs downloaded successfully', 'success');
                }
            } else {
                showToast(`Recipe "${this.importManager.recipeName}" saved successfully`, 'success');
            }
            
            // Close modal
            modalManager.closeModal('importModal');
            
            // Refresh the recipe
            window.recipeManager.loadRecipes();
            
        } catch (error) {
            console.error('Error:', error);
            showToast(error.message, 'error');
        } finally {
            this.importManager.loadingManager.hide();
        }
    }

    async downloadMissingLoras() {
        // For download, we need to validate the target path
        const loraRoot = document.getElementById('importLoraRoot')?.value;
        if (!loraRoot) {
            throw new Error('Please select a LoRA root directory');
        }
        
        // Build target path
        let targetPath = loraRoot;
        if (this.importManager.selectedFolder) {
            targetPath += '/' + this.importManager.selectedFolder;
        }
        
        const newFolder = document.getElementById('importNewFolder')?.value?.trim();
        if (newFolder) {
            targetPath += '/' + newFolder;
        }
        
        // Set up WebSocket for progress updates
        const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const ws = new WebSocket(`${wsProtocol}${window.location.host}/ws/fetch-progress`);
        
        // Show enhanced loading with progress details for multiple items
        const updateProgress = this.importManager.loadingManager.showDownloadProgress(
            this.importManager.downloadableLoRAs.length
        );
        
        let completedDownloads = 0;
        let failedDownloads = 0;
        let accessFailures = 0;
        let currentLoraProgress = 0;
        
        // Set up progress tracking for current download
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status === 'progress') {
                // Update current LoRA progress
                currentLoraProgress = data.progress;
                
                // Get current LoRA name
                const currentLora = this.importManager.downloadableLoRAs[completedDownloads + failedDownloads];
                const loraName = currentLora ? currentLora.name : '';
                
                // Update progress display
                updateProgress(currentLoraProgress, completedDownloads, loraName);
                
                // Add more detailed status messages based on progress
                if (currentLoraProgress < 3) {
                    this.importManager.loadingManager.setStatus(
                        `Preparing download for LoRA ${completedDownloads + failedDownloads + 1}/${this.importManager.downloadableLoRAs.length}`
                    );
                } else if (currentLoraProgress === 3) {
                    this.importManager.loadingManager.setStatus(
                        `Downloaded preview for LoRA ${completedDownloads + failedDownloads + 1}/${this.importManager.downloadableLoRAs.length}`
                    );
                } else if (currentLoraProgress > 3 && currentLoraProgress < 100) {
                    this.importManager.loadingManager.setStatus(
                        `Downloading LoRA ${completedDownloads + failedDownloads + 1}/${this.importManager.downloadableLoRAs.length}`
                    );
                } else {
                    this.importManager.loadingManager.setStatus(
                        `Finalizing LoRA ${completedDownloads + failedDownloads + 1}/${this.importManager.downloadableLoRAs.length}`
                    );
                }
            }
        };
        
        for (let i = 0; i < this.importManager.downloadableLoRAs.length; i++) {
            const lora = this.importManager.downloadableLoRAs[i];
            
            // Reset current LoRA progress for new download
            currentLoraProgress = 0;
            
            // Initial status update for new LoRA
            this.importManager.loadingManager.setStatus(`Starting download for LoRA ${i+1}/${this.importManager.downloadableLoRAs.length}`);
            updateProgress(0, completedDownloads, lora.name);
            
            try {
                // Download the LoRA
                const response = await fetch('/api/download-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        download_url: lora.downloadUrl,
                        model_version_id: lora.modelVersionId,
                        model_hash: lora.hash,
                        model_root: loraRoot,
                        relative_path: targetPath.replace(loraRoot + '/', '')
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to download LoRA ${lora.name}: ${errorText}`);
                    
                    // Check if this is an early access error (status 401 is the key indicator)
                    if (response.status === 401) {
                        accessFailures++;
                        this.importManager.loadingManager.setStatus(
                            `Failed to download ${lora.name}: Access restricted`
                        );
                    }
                    
                    failedDownloads++;
                    // Continue with next download
                } else {
                    completedDownloads++;
                    
                    // Update progress to show completion of current LoRA
                    updateProgress(100, completedDownloads, '');
                    
                    if (completedDownloads + failedDownloads < this.importManager.downloadableLoRAs.length) {
                        this.importManager.loadingManager.setStatus(
                            `Completed ${completedDownloads}/${this.importManager.downloadableLoRAs.length} LoRAs. Starting next download...`
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
            if (accessFailures > 0) {
                showToast(
                    `Downloaded ${completedDownloads} of ${this.importManager.downloadableLoRAs.length} LoRAs. ${accessFailures} failed due to access restrictions. Check your API key in settings or early access status.`,
                    'error'
                );
            } else {
                showToast(`Downloaded ${completedDownloads} of ${this.importManager.downloadableLoRAs.length} LoRAs`, 'error');
            }
        }
        
        return failedDownloads;
    }
}
