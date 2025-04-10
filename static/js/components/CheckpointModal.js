import { showToast } from '../utils/uiHelpers.js';
import { modalManager } from '../managers/ModalManager.js';

/**
 * CheckpointModal - Component for displaying checkpoint details
 * This is a basic implementation that can be expanded in the future
 */
export class CheckpointModal {
    constructor() {
        this.modal = document.getElementById('checkpointModal');
        this.modalTitle = document.getElementById('checkpointModalTitle');
        this.modalContent = document.getElementById('checkpointModalContent');
        this.currentCheckpoint = null;
        
        // Initialize close events
        this._initCloseEvents();
    }
    
    _initCloseEvents() {
        if (!this.modal) return;
        
        // Close button
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
    }
    
    /**
     * Show checkpoint details in the modal
     * @param {Object} checkpoint - Checkpoint data
     */
    showCheckpointDetails(checkpoint) {
        if (!this.modal || !this.modalContent) {
            console.error('Checkpoint modal elements not found');
            return;
        }
        
        this.currentCheckpoint = checkpoint;
        
        // Set modal title
        if (this.modalTitle) {
            this.modalTitle.textContent = checkpoint.model_name || 'Checkpoint Details';
        }
        
        // This is a basic implementation that can be expanded with more details
        // For now, just display some basic information
        this.modalContent.innerHTML = `
            <div class="checkpoint-details">
                <div class="checkpoint-preview">
                    <img src="${checkpoint.preview_url || '/loras_static/images/no-preview.png'}" 
                         alt="${checkpoint.model_name}" />
                </div>
                <div class="checkpoint-info">
                    <h3>${checkpoint.model_name}</h3>
                    <div class="info-grid">
                        <div class="info-row">
                            <span class="info-label">File Name:</span>
                            <span class="info-value">${checkpoint.file_name}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Location:</span>
                            <span class="info-value">${checkpoint.folder}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Base Model:</span>
                            <span class="info-value">${checkpoint.base_model || 'Unknown'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">File Size:</span>
                            <span class="info-value">${this._formatFileSize(checkpoint.file_size)}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">SHA256:</span>
                            <span class="info-value sha-value">${checkpoint.sha256 || 'Unknown'}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="placeholder-message">
                <p>Detailed checkpoint information will be implemented in a future update.</p>
            </div>
        `;
        
        // Show the modal
        this.modal.style.display = 'block';
    }
    
    /**
     * Close the modal
     */
    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.currentCheckpoint = null;
        }
    }
    
    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} - Formatted file size
     */
    _formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        if (i === 0) return `${bytes} ${sizes[i]}`;
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }
}