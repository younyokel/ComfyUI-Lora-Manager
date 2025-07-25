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