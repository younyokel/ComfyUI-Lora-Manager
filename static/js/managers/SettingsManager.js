import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';

export class SettingsManager {
    constructor() {
        this.initialized = false;
        this.isOpen = false;
        
        // Add initialization to sync with modal state
        this.initialize();
    }

    initialize() {
        if (this.initialized) return;
        
        // Add event listener to sync state when modal is closed via other means (like Escape key)
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        this.isOpen = settingsModal.style.display === 'block';
                    }
                });
            });
            
            observer.observe(settingsModal, { attributes: true });
        }
        
        this.initialized = true;
    }

    toggleSettings() {
        if (this.isOpen) {
            modalManager.closeModal('settingsModal');
        } else {
            modalManager.showModal('settingsModal');
        }
        this.isOpen = !this.isOpen;
    }

    async saveSettings() {
        const apiKey = document.getElementById('civitaiApiKey').value;
        
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    civitai_api_key: apiKey
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save settings');
            }

            showToast('Settings saved successfully', 'success');
            modalManager.closeModal('settingsModal');
        } catch (error) {
            showToast('Failed to save settings: ' + error.message, 'error');
        }
    }
}

// Helper function for toggling API key visibility
export function toggleApiKeyVisibility(button) {
    const input = button.parentElement.querySelector('input');
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}
