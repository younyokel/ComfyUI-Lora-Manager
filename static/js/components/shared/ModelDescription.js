/**
 * ModelDescription.js
 * Handles model description related functionality - General version
 */

/**
 * Set up tab switching functionality
 */
export function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.showcase-tabs .tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs
            document.querySelectorAll('.showcase-tabs .tab-btn').forEach(btn => 
                btn.classList.remove('active')
            );
            document.querySelectorAll('.tab-content .tab-pane').forEach(tab => 
                tab.classList.remove('active')
            );
            
            // Add active class to clicked tab
            button.classList.add('active');
            const tabId = `${button.dataset.tab}-tab`;
            document.getElementById(tabId).classList.add('active');
            
            // If switching to description tab, make sure content is properly sized
            if (button.dataset.tab === 'description') {
                const descriptionContent = document.querySelector('.model-description-content');
                if (descriptionContent) {
                    const hasContent = descriptionContent.innerHTML.trim() !== '';
                    document.querySelector('.model-description-loading')?.classList.add('hidden');
                    
                    // If no content, show a message
                    if (!hasContent) {
                        descriptionContent.innerHTML = '<div class="no-description">No model description available</div>';
                        descriptionContent.classList.remove('hidden');
                    }
                }
            }
        });
    });
}

/**
 * Load model description - General version supports both LoRA and Checkpoint
 * @param {string} modelId - Model ID
 * @param {string} filePath - File path
 */
export async function loadModelDescription(modelId, filePath) {
    try {
        const descriptionContainer = document.querySelector('.model-description-content');
        const loadingElement = document.querySelector('.model-description-loading');
        
        if (!descriptionContainer || !loadingElement) return;
        
        // Show loading indicator
        loadingElement.classList.remove('hidden');
        descriptionContainer.classList.add('hidden');
        
        // Determine API endpoint based on file path or context
        let apiEndpoint = `/api/lora-model-description?model_id=${modelId}&file_path=${encodeURIComponent(filePath)}`;
        
        // If this is a checkpoint (can be determined from file path or other context)
        if (filePath.includes('.safetensors') || filePath.includes('.ckpt')) {
            // For now, use the same endpoint - can be updated later if checkpoint-specific endpoint is needed
            apiEndpoint = `/api/lora-model-description?model_id=${modelId}&file_path=${encodeURIComponent(filePath)}`;
        }
        
        // Try to get model description from API
        const response = await fetch(apiEndpoint);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch model description: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.description) {
            // Update the description content
            descriptionContainer.innerHTML = data.description;
            
            // Process any links in the description to open in new tab
            const links = descriptionContainer.querySelectorAll('a');
            links.forEach(link => {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            });
            
            // Show the description and hide loading indicator
            descriptionContainer.classList.remove('hidden');
            loadingElement.classList.add('hidden');
        } else {
            throw new Error(data.error || 'No description available');
        }
    } catch (error) {
        console.error('Error loading model description:', error);
        const loadingElement = document.querySelector('.model-description-loading');
        if (loadingElement) {
            loadingElement.innerHTML = `<div class="error-message">Failed to load model description. ${error.message}</div>`;
        }
        
        // Show empty state message in the description container
        const descriptionContainer = document.querySelector('.model-description-content');
        if (descriptionContainer) {
            descriptionContainer.innerHTML = '<div class="no-description">No model description available</div>';
            descriptionContainer.classList.remove('hidden');
        }
    }
}