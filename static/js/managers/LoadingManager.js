// Loading management
export class LoadingManager {
    constructor() {
        this.overlay = document.getElementById('loading-overlay');
        this.progressBar = this.overlay.querySelector('.progress-bar');
        this.statusText = this.overlay.querySelector('.loading-status');
    }

    show(message = 'Loading...', progress = 0) {
        this.overlay.style.display = 'flex';
        this.setProgress(progress);
        this.setStatus(message);
    }

    hide() {
        this.overlay.style.display = 'none';
        this.reset();
    }

    setProgress(percent) {
        this.progressBar.style.width = `${percent}%`;
        this.progressBar.setAttribute('aria-valuenow', percent);
    }

    setStatus(message) {
        this.statusText.textContent = message;
    }

    reset() {
        this.setProgress(0);
        this.setStatus('');
    }

    async showWithProgress(callback, options = {}) {
        const { initialMessage = 'Processing...', completionMessage = 'Complete' } = options;
        
        try {
            this.show(initialMessage);
            await callback(this);
            this.setProgress(100);
            this.setStatus(completionMessage);
            await new Promise(resolve => setTimeout(resolve, 500));
        } finally {
            this.hide();
        }
    }

    showSimpleLoading(message = 'Loading...') {
        this.overlay.style.display = 'flex';
        this.progressBar.style.display = 'none';
        this.setStatus(message);
    }

    restoreProgressBar() {
        this.progressBar.style.display = 'block';
    }
} 