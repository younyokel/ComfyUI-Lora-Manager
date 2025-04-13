/**
 * Initialization Component
 * Manages the display of initialization progress and status
 */

class InitializationManager {
    constructor() {
        this.currentTipIndex = 0;
        this.tipInterval = null;
        this.websocket = null;
        this.currentStage = null;
        this.progress = 0;
        this.stages = [
            { id: 'stageScanFolders', name: 'scan_folders' },
            { id: 'stageCountModels', name: 'count_models' },
            { id: 'stageProcessModels', name: 'process_models' },
            { id: 'stageFinalizing', name: 'finalizing' }
        ];
    }

    /**
     * Initialize the component
     */
    initialize() {
        // Setup the tip carousel
        this.setupTipCarousel();
        
        // Connect to WebSocket for progress updates
        this.connectWebSocket();

        // Add event listeners for tip navigation
        this.setupTipNavigation();
        
        // Show first tip as active
        document.querySelector('.tip-item').classList.add('active');
        
        // Set the first stage as active
        this.updateStage('scan_folders');
    }

    /**
     * Connect to WebSocket for initialization progress updates
     */
    connectWebSocket() {
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            this.websocket = new WebSocket(`${wsProtocol}${window.location.host}/ws/init-progress`);
            
            this.websocket.onopen = () => {
                console.log('Connected to initialization progress WebSocket');
            };
            
            this.websocket.onmessage = (event) => {
                this.handleProgressUpdate(JSON.parse(event.data));
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Fall back to polling if WebSocket fails
                this.fallbackToPolling();
            };
            
            this.websocket.onclose = () => {
                console.log('WebSocket connection closed');
                // Check if we need to fall back to polling
                if (!this.pollingActive) {
                    this.fallbackToPolling();
                }
            };
        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.fallbackToPolling();
        }
    }

    /**
     * Fall back to polling if WebSocket connection fails
     */
    fallbackToPolling() {
        this.pollingActive = true;
        this.pollProgress();
        
        // Set a simulated progress that moves forward slowly
        // This gives users feedback even if the backend isn't providing updates
        let simulatedProgress = 0;
        const simulateInterval = setInterval(() => {
            simulatedProgress += 0.5;
            if (simulatedProgress > 95) {
                clearInterval(simulateInterval);
                return;
            }
            
            // Only use simulated progress if we haven't received a real update
            if (this.progress < simulatedProgress) {
                this.updateProgress(simulatedProgress);
            }
        }, 1000);
    }

    /**
     * Poll for progress updates from the server
     */
    pollProgress() {
        const checkProgress = () => {
            fetch('/api/init-status')
                .then(response => response.json())
                .then(data => {
                    this.handleProgressUpdate(data);
                    
                    // If initialization is complete, stop polling
                    if (data.status !== 'complete') {
                        setTimeout(checkProgress, 2000);
                    } else {
                        window.location.reload();
                    }
                })
                .catch(error => {
                    console.error('Error polling for progress:', error);
                    setTimeout(checkProgress, 3000); // Try again after a longer delay
                });
        };
        
        checkProgress();
    }

    /**
     * Handle progress updates from WebSocket or polling
     */
    handleProgressUpdate(data) {
        if (!data) return;
        
        // Update progress percentage
        if (data.progress !== undefined) {
            this.updateProgress(data.progress);
        }
        
        // Update current stage
        if (data.stage) {
            this.updateStage(data.stage);
        }
        
        // Update stage-specific details
        if (data.details) {
            this.updateStageDetails(data.stage, data.details);
        }
        
        // If initialization is complete, reload the page
        if (data.status === 'complete') {
            this.showCompletionMessage();
            
            // Give the user a moment to see the completion message
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
    }

    /**
     * Update the progress bar and percentage
     */
    updateProgress(progress) {
        this.progress = progress;
        const progressBar = document.getElementById('initProgressBar');
        const progressPercentage = document.getElementById('progressPercentage');
        
        if (progressBar && progressPercentage) {
            progressBar.style.width = `${progress}%`;
            progressPercentage.textContent = `${Math.round(progress)}%`;
        }
    }

    /**
     * Update the current stage
     */
    updateStage(stageName) {
        // Mark the previous stage as completed if it exists
        if (this.currentStage) {
            const previousStageElement = document.getElementById(this.currentStage);
            if (previousStageElement) {
                previousStageElement.classList.remove('active');
                previousStageElement.classList.add('completed');
                
                // Update the stage status icon to completed
                const statusElement = previousStageElement.querySelector('.stage-status');
                if (statusElement) {
                    statusElement.className = 'stage-status completed';
                    statusElement.innerHTML = '<i class="fas fa-check"></i>';
                }
            }
        }
        
        // Find and activate the new current stage
        const stageInfo = this.stages.find(s => s.name === stageName);
        if (stageInfo) {
            this.currentStage = stageInfo.id;
            const currentStageElement = document.getElementById(stageInfo.id);
            
            if (currentStageElement) {
                currentStageElement.classList.add('active');
                
                // Update the stage status icon to in-progress
                const statusElement = currentStageElement.querySelector('.stage-status');
                if (statusElement) {
                    statusElement.className = 'stage-status in-progress';
                    statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                }
                
                // Update the progress status message
                const progressStatus = document.getElementById('progressStatus');
                if (progressStatus) {
                    progressStatus.textContent = `${this.stageNameToDisplay(stageName)}...`;
                }
            }
        }
    }

    /**
     * Convert stage name to display text
     */
    stageNameToDisplay(stageName) {
        switch (stageName) {
            case 'scan_folders':
                return 'Scanning folders';
            case 'count_models':
                return 'Counting models';
            case 'process_models':
                return 'Processing models';
            case 'finalizing':
                return 'Finalizing';
            default:
                return 'Initializing';
        }
    }

    /**
     * Update stage-specific details
     */
    updateStageDetails(stageName, details) {
        const detailsMap = {
            'scan_folders': 'scanFoldersDetails',
            'count_models': 'countModelsDetails',
            'process_models': 'processModelsDetails',
            'finalizing': 'finalizingDetails'
        };
        
        const detailsElementId = detailsMap[stageName];
        if (detailsElementId) {
            const detailsElement = document.getElementById(detailsElementId);
            if (detailsElement && details) {
                detailsElement.textContent = details;
            }
        }
    }

    /**
     * Setup the tip carousel to rotate through tips
     */
    setupTipCarousel() {
        const tipItems = document.querySelectorAll('.tip-item');
        if (tipItems.length === 0) return;
        
        // Show the first tip
        tipItems[0].classList.add('active');
        
        // Set up automatic rotation
        this.tipInterval = setInterval(() => {
            this.showNextTip();
        }, 8000); // Change tip every 8 seconds
    }

    /**
     * Setup tip navigation dots
     */
    setupTipNavigation() {
        const tipDots = document.querySelectorAll('.tip-dot');
        
        tipDots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                this.showTipByIndex(index);
            });
        });
    }

    /**
     * Show the next tip in the carousel
     */
    showNextTip() {
        const tipItems = document.querySelectorAll('.tip-item');
        const tipDots = document.querySelectorAll('.tip-dot');
        
        if (tipItems.length === 0) return;
        
        // Hide current tip
        tipItems[this.currentTipIndex].classList.remove('active');
        tipDots[this.currentTipIndex].classList.remove('active');
        
        // Calculate next index
        this.currentTipIndex = (this.currentTipIndex + 1) % tipItems.length;
        
        // Show next tip
        tipItems[this.currentTipIndex].classList.add('active');
        tipDots[this.currentTipIndex].classList.add('active');
    }

    /**
     * Show a specific tip by index
     */
    showTipByIndex(index) {
        const tipItems = document.querySelectorAll('.tip-item');
        const tipDots = document.querySelectorAll('.tip-dot');
        
        if (index >= tipItems.length || index < 0) return;
        
        // Hide current tip
        tipItems[this.currentTipIndex].classList.remove('active');
        tipDots[this.currentTipIndex].classList.remove('active');
        
        // Update index and show selected tip
        this.currentTipIndex = index;
        
        // Show selected tip
        tipItems[this.currentTipIndex].classList.add('active');
        tipDots[this.currentTipIndex].classList.add('active');
        
        // Reset interval to prevent quick tip change
        if (this.tipInterval) {
            clearInterval(this.tipInterval);
            this.tipInterval = setInterval(() => {
                this.showNextTip();
            }, 8000);
        }
    }

    /**
     * Show completion message
     */
    showCompletionMessage() {
        // Mark all stages as completed
        this.stages.forEach(stage => {
            const stageElement = document.getElementById(stage.id);
            if (stageElement) {
                stageElement.classList.remove('active');
                stageElement.classList.add('completed');
                
                const statusElement = stageElement.querySelector('.stage-status');
                if (statusElement) {
                    statusElement.className = 'stage-status completed';
                    statusElement.innerHTML = '<i class="fas fa-check"></i>';
                }
            }
        });
        
        // Update progress to 100%
        this.updateProgress(100);
        
        // Update status message
        const progressStatus = document.getElementById('progressStatus');
        if (progressStatus) {
            progressStatus.textContent = 'Initialization complete!';
        }
        
        // Update title and subtitle
        const initTitle = document.getElementById('initTitle');
        const initSubtitle = document.getElementById('initSubtitle');
        
        if (initTitle) {
            initTitle.textContent = 'Initialization Complete';
        }
        
        if (initSubtitle) {
            initSubtitle.textContent = 'Reloading page...';
        }
    }

    /**
     * Clean up resources when the component is destroyed
     */
    cleanup() {
        if (this.tipInterval) {
            clearInterval(this.tipInterval);
        }
        
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.close();
        }
    }
}

// Create and export the initialization manager
export const initManager = new InitializationManager();

// Initialize the component when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're in initialization mode
    const initContainer = document.getElementById('initializationContainer');
    if (initContainer) {
        initManager.initialize();
    }
});

// Clean up when the page is unloaded
window.addEventListener('beforeunload', () => {
    initManager.cleanup();
});