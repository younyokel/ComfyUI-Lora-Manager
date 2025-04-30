import { showToast } from '../utils/uiHelpers.js';
import { getStorageItem, setStorageItem } from '../utils/storageHelpers.js';

// ExampleImagesManager.js
class ExampleImagesManager {
    constructor() {
        this.isDownloading = false;
        this.isPaused = false;
        this.progressUpdateInterval = null;
        this.startTime = null;
        this.progressPanel = null;
        
        // Initialize download path field and check download status
        this.initializePathOptions();
        this.checkDownloadStatus();
    }
    
    // Initialize the manager
    initialize() {
        // Initialize event listeners
        this.initEventListeners();
        
        // Initialize progress panel reference
        this.progressPanel = document.getElementById('exampleImagesProgress');
        
        // Initialize progress panel button handlers
        const pauseBtn = document.getElementById('pauseExampleDownloadBtn');
        const collapseBtn = document.getElementById('collapseProgressBtn');
        
        if (pauseBtn) {
            pauseBtn.onclick = () => this.pauseDownload();
        }
        
        if (collapseBtn) {
            collapseBtn.onclick = () => this.toggleProgressPanel();
        }
    }
    
    // Initialize event listeners for buttons
    initEventListeners() {
        const downloadBtn = document.getElementById('exampleImagesDownloadBtn');
        if (downloadBtn) {
            downloadBtn.onclick = () => this.handleDownloadButton();
        }
    }
    
    async initializePathOptions() {
        try {
            // Get custom path input element
            const pathInput = document.getElementById('exampleImagesPath');

            // Set path from storage if available
            const savedPath = getStorageItem('example_images_path', '');
            if (savedPath) {
                pathInput.value = savedPath;
                // Enable download button if path is set
                this.updateDownloadButtonState(true);
            } else {
                // Disable download button if no path is set
                this.updateDownloadButtonState(false);
            }
            
            // Add event listener to validate path input
            pathInput.addEventListener('input', async () => {
                const hasPath = pathInput.value.trim() !== '';
                this.updateDownloadButtonState(hasPath);
                
                // Save path to storage when changed
                if (hasPath) {
                    setStorageItem('example_images_path', pathInput.value);
                    
                    // Update path in backend settings
                    try {
                        const response = await fetch('/api/settings', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                example_images_path: pathInput.value
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        if (!data.success) {
                            console.error('Failed to update example images path in backend:', data.error);
                        } else {
                            showToast('Example images path updated successfully', 'success');
                        }
                    } catch (error) {
                        console.error('Failed to update example images path:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Failed to initialize path options:', error);
        }
    }
    
    // Method to update download button state
    updateDownloadButtonState(enabled) {
        const downloadBtn = document.getElementById('exampleImagesDownloadBtn');
        if (downloadBtn) {
            if (enabled) {
                downloadBtn.classList.remove('disabled');
                downloadBtn.disabled = false;
            } else {
                downloadBtn.classList.add('disabled');
                downloadBtn.disabled = true;
            }
        }
    }
    
    // Method to handle download button click based on current state
    async handleDownloadButton() {
        if (this.isDownloading && this.isPaused) {
            // If download is paused, resume it
            this.resumeDownload();
        } else if (!this.isDownloading) {
            // If no download in progress, start a new one
            this.startDownload();
        } else {
            // If download is in progress, show info toast
            showToast('Download already in progress', 'info');
        }
    }
    
    async checkDownloadStatus() {
        try {
            const response = await fetch('/api/example-images-status');
            const data = await response.json();
            
            if (data.success) {
                this.isDownloading = data.is_downloading;
                this.isPaused = data.status.status === 'paused';
                
                // Update download button text based on status
                this.updateDownloadButtonText();
                
                if (this.isDownloading) {
                    // Ensure progress panel exists before updating UI
                    if (!this.progressPanel) {
                        this.progressPanel = document.getElementById('exampleImagesProgress');
                    }
                    
                    if (this.progressPanel) {
                        this.updateUI(data.status);
                        this.showProgressPanel();
                        
                        // Start the progress update interval if downloading
                        if (!this.progressUpdateInterval) {
                            this.startProgressUpdates();
                        }
                    } else {
                        console.warn('Progress panel not found, will retry on next update');
                        // Set a shorter timeout to try again
                        setTimeout(() => this.checkDownloadStatus(), 500);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to check download status:', error);
        }
    }
    
    // Update download button text based on current state
    updateDownloadButtonText() {
        const btnTextElement = document.getElementById('exampleDownloadBtnText');
        if (btnTextElement) {
            if (this.isDownloading && this.isPaused) {
                btnTextElement.textContent = "Resume";
            } else if (!this.isDownloading) {
                btnTextElement.textContent = "Download";
            }
        }
    }
    
    async startDownload() {
        if (this.isDownloading) {
            showToast('Download already in progress', 'warning');
            return;
        }
        
        try {
            const outputDir = document.getElementById('exampleImagesPath').value || '';
            
            if (!outputDir) {
                showToast('Please enter a download location first', 'warning');
                return;
            }
            
            const optimize = document.getElementById('optimizeExampleImages').checked;
            
            const response = await fetch('/api/download-example-images', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    output_dir: outputDir,
                    optimize: optimize,
                    model_types: ['lora', 'checkpoint']
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.isDownloading = true;
                this.isPaused = false;
                this.startTime = new Date();
                this.updateUI(data.status);
                this.showProgressPanel();
                this.startProgressUpdates();
                this.updateDownloadButtonText();
                showToast('Example images download started', 'success');
                
                // Close settings modal
                modalManager.closeModal('settingsModal');
            } else {
                showToast(data.error || 'Failed to start download', 'error');
            }
        } catch (error) {
            console.error('Failed to start download:', error);
            showToast('Failed to start download', 'error');
        }
    }
    
    async pauseDownload() {
        if (!this.isDownloading || this.isPaused) {
            return;
        }
        
        try {
            const response = await fetch('/api/pause-example-images', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.isPaused = true;
                document.getElementById('downloadStatusText').textContent = 'Paused';
                document.getElementById('pauseExampleDownloadBtn').innerHTML = '<i class="fas fa-play"></i>';
                document.getElementById('pauseExampleDownloadBtn').onclick = () => this.resumeDownload();
                this.updateDownloadButtonText();
                showToast('Download paused', 'info');
            } else {
                showToast(data.error || 'Failed to pause download', 'error');
            }
        } catch (error) {
            console.error('Failed to pause download:', error);
            showToast('Failed to pause download', 'error');
        }
    }
    
    async resumeDownload() {
        if (!this.isDownloading || !this.isPaused) {
            return;
        }
        
        try {
            const response = await fetch('/api/resume-example-images', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.isPaused = false;
                document.getElementById('downloadStatusText').textContent = 'Downloading';
                document.getElementById('pauseExampleDownloadBtn').innerHTML = '<i class="fas fa-pause"></i>';
                document.getElementById('pauseExampleDownloadBtn').onclick = () => this.pauseDownload();
                this.updateDownloadButtonText();
                showToast('Download resumed', 'success');
            } else {
                showToast(data.error || 'Failed to resume download', 'error');
            }
        } catch (error) {
            console.error('Failed to resume download:', error);
            showToast('Failed to resume download', 'error');
        }
    }
    
    startProgressUpdates() {
        // Clear any existing interval
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
        }
        
        // Set new interval to update progress every 2 seconds
        this.progressUpdateInterval = setInterval(async () => {
            await this.updateProgress();
        }, 2000);
    }
    
    async updateProgress() {
        try {
            const response = await fetch('/api/example-images-status');
            const data = await response.json();
            
            if (data.success) {
                this.isDownloading = data.is_downloading;
                this.isPaused = data.status.status === 'paused';
                
                // Update download button text
                this.updateDownloadButtonText();
                
                if (this.isDownloading) {
                    this.updateUI(data.status);
                } else {
                    // Download completed or failed
                    clearInterval(this.progressUpdateInterval);
                    this.progressUpdateInterval = null;
                    
                    if (data.status.status === 'completed') {
                        showToast('Example images download completed', 'success');
                        // Hide the panel after a delay
                        setTimeout(() => this.hideProgressPanel(), 5000);
                    } else if (data.status.status === 'error') {
                        showToast('Example images download failed', 'error');
                    }
                }
            }
        } catch (error) {
            console.error('Failed to update progress:', error);
        }
    }
    
    updateUI(status) {
        // Ensure progress panel exists
        if (!this.progressPanel) {
            this.progressPanel = document.getElementById('exampleImagesProgress');
            if (!this.progressPanel) {
                console.error('Progress panel element not found in DOM');
                return;
            }
        }
        
        // Update status text
        const statusText = document.getElementById('downloadStatusText');
        if (statusText) {
            statusText.textContent = this.getStatusText(status.status);
        }
        
        // Update progress counts and bar
        const progressCounts = document.getElementById('downloadProgressCounts');
        if (progressCounts) {
            progressCounts.textContent = `${status.completed}/${status.total}`;
        }
        
        const progressBar = document.getElementById('downloadProgressBar');
        if (progressBar) {
            const progressPercent = status.total > 0 ? (status.completed / status.total) * 100 : 0;
            progressBar.style.width = `${progressPercent}%`;
        }
        
        // Update current model
        const currentModel = document.getElementById('currentModelName');
        if (currentModel) {
            currentModel.textContent = status.current_model || '-';
        }
        
        // Update time stats
        this.updateTimeStats(status);
        
        // Update errors
        this.updateErrors(status);
        
        // Update pause/resume button
        const pauseBtn = document.getElementById('pauseExampleDownloadBtn');
        const resumeBtn = document.getElementById('resumeExampleDownloadBtn');
        
        if (pauseBtn) {
            if (status.status === 'paused') {
                pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                pauseBtn.onclick = () => this.resumeDownload();
            } else {
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                pauseBtn.onclick = () => this.pauseDownload();
            }
        }
        
        if (resumeBtn) {
            resumeBtn.style.display = status.status === 'paused' ? 'block' : 'none';
        }
    }
    
    updateTimeStats(status) {
        const elapsedTime = document.getElementById('elapsedTime');
        const remainingTime = document.getElementById('remainingTime');
        
        if (!elapsedTime || !remainingTime) return;
        
        // Calculate elapsed time
        let elapsed;
        if (status.start_time) {
            const now = new Date();
            const startTime = new Date(status.start_time * 1000);
            elapsed = Math.floor((now - startTime) / 1000);
        } else {
            elapsed = 0;
        }
        
        elapsedTime.textContent = this.formatTime(elapsed);
        
        // Calculate remaining time
        if (status.total > 0 && status.completed > 0 && status.status === 'running') {
            const rate = status.completed / elapsed; // models per second
            const remaining = Math.floor((status.total - status.completed) / rate);
            remainingTime.textContent = this.formatTime(remaining);
        } else {
            remainingTime.textContent = '--:--:--';
        }
    }
    
    updateErrors(status) {
        const errorContainer = document.getElementById('downloadErrorContainer');
        const errorList = document.getElementById('downloadErrors');
        
        if (!errorContainer || !errorList) return;
        
        if (status.errors && status.errors.length > 0) {
            // Show only the last 3 errors
            const recentErrors = status.errors.slice(-3);
            errorList.innerHTML = recentErrors.map(error => 
                `<div class="error-item">${error}</div>`
            ).join('');
            
            errorContainer.classList.remove('hidden');
        } else {
            errorContainer.classList.add('hidden');
        }
    }
    
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }
    
    getStatusText(status) {
        switch (status) {
            case 'running': return 'Downloading';
            case 'paused': return 'Paused';
            case 'completed': return 'Completed';
            case 'error': return 'Error';
            default: return 'Initializing';
        }
    }
    
    showProgressPanel() {
        // Ensure progress panel exists
        if (!this.progressPanel) {
            this.progressPanel = document.getElementById('exampleImagesProgress');
            if (!this.progressPanel) {
                console.error('Progress panel element not found in DOM');
                return;
            }
        }
        this.progressPanel.classList.add('visible');
    }
    
    hideProgressPanel() {
        if (!this.progressPanel) {
            this.progressPanel = document.getElementById('exampleImagesProgress');
            if (!this.progressPanel) return;
        }
        this.progressPanel.classList.remove('visible');
    }
    
    toggleProgressPanel() {
        if (!this.progressPanel) {
            this.progressPanel = document.getElementById('exampleImagesProgress');
            if (!this.progressPanel) return;
        }
        
        this.progressPanel.classList.toggle('collapsed');
        
        // Update icon
        const icon = document.querySelector('#collapseProgressBtn i');
        if (icon) {
            if (this.progressPanel.classList.contains('collapsed')) {
                icon.className = 'fas fa-chevron-up';
            } else {
                icon.className = 'fas fa-chevron-down';
            }
        }
    }
}

// Create singleton instance
export const exampleImagesManager = new ExampleImagesManager();
