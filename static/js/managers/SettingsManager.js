import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';

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
                        
                        // When modal is opened, update checkbox state from current settings
                        if (this.isOpen) {
                            this.loadSettingsToUI();
                        }
                    }
                });
            });
            
            observer.observe(settingsModal, { attributes: true });
        }
        
        this.initialized = true;
    }

    loadSettingsToUI() {
        // Set frontend settings from state
        const blurMatureContentCheckbox = document.getElementById('blurMatureContent');
        if (blurMatureContentCheckbox) {
            blurMatureContentCheckbox.checked = state.global.settings.blurMatureContent;
        }
        
        const showOnlySFWCheckbox = document.getElementById('showOnlySFW');
        if (showOnlySFWCheckbox) {
            // Sync with state (backend will set this via template)
            state.global.settings.show_only_sfw = showOnlySFWCheckbox.checked;
        }
        
        // Backend settings are loaded from the template directly
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
        // Get frontend settings from UI
        const blurMatureContent = document.getElementById('blurMatureContent').checked;
        
        // Get backend settings
        const apiKey = document.getElementById('civitaiApiKey').value;
        const showOnlySFW = document.getElementById('showOnlySFW').checked;
        
        // Update frontend state and save to localStorage
        state.global.settings.blurMatureContent = blurMatureContent;
        state.global.settings.show_only_sfw = showOnlySFW;
        
        // Save settings to localStorage
        localStorage.setItem('settings', JSON.stringify(state.global.settings));
        
        try {
            // Save backend settings via API
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    civitai_api_key: apiKey,
                    show_only_sfw: showOnlySFW
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save settings');
            }

            showToast('Settings saved successfully', 'success');
            modalManager.closeModal('settingsModal');
            
            // Apply frontend settings immediately
            this.applyFrontendSettings();
            
            // Reload the loras without updating folders
            await resetAndReload(false);
        } catch (error) {
            showToast('Failed to save settings: ' + error.message, 'error');
        }
    }

    applyFrontendSettings() {
        // Apply blur setting to existing content
        const blurSetting = state.global.settings.blurMatureContent;
        document.querySelectorAll('.lora-card[data-nsfw="true"] .card-image').forEach(img => {
            if (blurSetting) {
                img.classList.add('nsfw-blur');
            } else {
                img.classList.remove('nsfw-blur');
            }
        });
        
        // For show_only_sfw, there's no immediate action needed as it affects content loading
        // The setting will take effect on next reload
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
