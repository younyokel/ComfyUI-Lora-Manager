import { showToast } from '../utils/uiHelpers.js';
import { getStorageItem, setStorageItem } from '../utils/storageHelpers.js';

// ExampleImagesManager.js
class ExampleImagesManager {
    constructor() {
        this.isDownloading = false;
        this.isPaused = false;
        this.progressUpdateInterval = null;
        this.startTime = null;
        this.progressPanel = document.getElementById('exampleImagesProgress');
        
        // Wait for DOM before initializing event listeners
        document.addEventListener('DOMContentLoaded', () => this.initEventListeners());
        
        // Initialize download path field
        this.initializePathOptions();
        
        // Check download status on page load
        this.checkDownloadStatus();
    }
    
    // Initialize event listeners for buttons
    initEventListeners() {
        const startBtn = document.getElementById('startExampleDownloadBtn');
        if (startBtn) {
            startBtn.onclick = () => this.startDownload();
        }
        
        const resumeBtn = document.getElementById('resumeExampleDownloadBtn');
        if (resumeBtn) {
            resumeBtn.onclick = () => this.resumeDownload();
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
            
            // Add event listener to the browse button
            const browseButton = document.getElementById('browseExampleImagesPath');
            if (browseButton) {
                browseButton.addEventListener('click', () => this.browseFolderDialog());
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
        const startBtn = document.getElementById('startExampleDownloadBtn');
        if (startBtn) {
            if (enabled) {
                startBtn.classList.remove('disabled');
                startBtn.disabled = false;
            } else {
                startBtn.classList.add('disabled');
                startBtn.disabled = true;
            }
        }
    }
    
    // Method to open folder browser dialog
    async browseFolderDialog() {
        try {
            const response = await fetch('/api/browse-folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    initial_dir: getStorageItem('example_images_path', '')
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.folder) {
                const pathInput = document.getElementById('exampleImagesPath');
                pathInput.value = data.folder;
                setStorageItem('example_images_path', data.folder);
                this.updateDownloadButtonState(true);
                showToast('Example images path updated successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to browse folder:', error);
            showToast('Failed to browse folder. Please ensure the server supports this feature.', 'error');
        }
    }
    
    async checkDownloadStatus() {
        try {
            const response = await fetch('/api/example-images-status');
            const data = await response.json();
            
            if (data.success) {
                this.isDownloading = data.is_downloading;
                this.isPaused = data.status.status === 'paused';
                
                if (this.isDownloading) {
                    this.updateUI(data.status);
                    this.showProgressPanel();
                    
                    // Start the progress update interval if downloading
                    if (!this.progressUpdateInterval) {
                        this.startProgressUpdates();
                    }
                }
            }
        } catch (error) {
            console.error('Failed to check download status:', error);
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
                showToast('Please select a download location first', 'warning');
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
                showToast('Example images download started', 'success');
                
                // Hide the start button, show resume button
                document.getElementById('startExampleDownloadBtn').style.display = 'none';
                
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
                showToast('Download paused', 'info');
                
                // Show resume button in settings too
                document.getElementById('resumeExampleDownloadBtn').style.display = 'block';
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
                showToast('Download resumed', 'success');
                
                // Hide resume button in settings
                document.getElementById('resumeExampleDownloadBtn').style.display = 'none';
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
                    
                    // Reset UI
                    document.getElementById('startExampleDownloadBtn').style.display = 'block';
                    document.getElementById('resumeExampleDownloadBtn').style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Failed to update progress:', error);
        }
    }
    
    updateUI(status) {
        // Update status text
        const statusText = document.getElementById('downloadStatusText');
        statusText.textContent = this.getStatusText(status.status);
        
        // Update progress counts and bar
        const progressCounts = document.getElementById('downloadProgressCounts');
        progressCounts.textContent = `${status.completed}/${status.total}`;
        
        const progressBar = document.getElementById('downloadProgressBar');
        const progressPercent = status.total > 0 ? (status.completed / status.total) * 100 : 0;
        progressBar.style.width = `${progressPercent}%`;
        
        // Update current model
        const currentModel = document.getElementById('currentModelName');
        currentModel.textContent = status.current_model || '-';
        
        // Update time stats
        this.updateTimeStats(status);
        
        // Update errors
        this.updateErrors(status);
        
        // Update pause/resume button
        if (status.status === 'paused') {
            document.getElementById('pauseExampleDownloadBtn').innerHTML = '<i class="fas fa-play"></i>';
            document.getElementById('pauseExampleDownloadBtn').onclick = () => this.resumeDownload();
            document.getElementById('resumeExampleDownloadBtn').style.display = 'block';
        } else {
            document.getElementById('pauseExampleDownloadBtn').innerHTML = '<i class="fas fa-pause"></i>';
            document.getElementById('pauseExampleDownloadBtn').onclick = () => this.pauseDownload();
            document.getElementById('resumeExampleDownloadBtn').style.display = 'none';
        }
    }
    
    updateTimeStats(status) {
        const elapsedTime = document.getElementById('elapsedTime');
        const remainingTime = document.getElementById('remainingTime');
        
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
        this.progressPanel.classList.add('visible');
    }
    
    hideProgressPanel() {
        this.progressPanel.classList.remove('visible');
    }
    
    toggleProgressPanel() {
        this.progressPanel.classList.toggle('collapsed');
        
        // Update icon
        const icon = document.querySelector('#collapseProgressBtn i');
        if (this.progressPanel.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-up';
        } else {
            icon.className = 'fas fa-chevron-down';
        }
    }
}

// Create singleton instance
export const exampleImagesManager = new ExampleImagesManager();
