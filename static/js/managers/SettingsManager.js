import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { setStorageItem, getStorageItem } from '../utils/storageHelpers.js';

export class SettingsManager {
    constructor() {
        this.initialized = false;
        this.isOpen = false;
        
        // Add initialization to sync with modal state
        this.currentPage = document.body.dataset.page || 'loras';
        
        // Ensure settings are loaded from localStorage
        this.loadSettingsFromStorage();
        
        this.initialize();
    }

    loadSettingsFromStorage() {
        // Get saved settings from localStorage
        const savedSettings = getStorageItem('settings');
        
        // Apply saved settings to state if available
        if (savedSettings) {
            state.global.settings = { ...state.global.settings, ...savedSettings };
        }
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

    async loadSettingsToUI() {
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

        // Load default lora root
        await this.loadLoraRoots();
        
        // Backend settings are loaded from the template directly
    }

    async loadLoraRoots() {
        try {
            const defaultLoraRootSelect = document.getElementById('defaultLoraRoot');
            if (!defaultLoraRootSelect) return;
            
            // Fetch lora roots
            const response = await fetch('/api/lora-roots');
            if (!response.ok) {
                throw new Error('Failed to fetch LoRA roots');
            }
            
            const data = await response.json();
            if (!data.roots || data.roots.length === 0) {
                throw new Error('No LoRA roots found');
            }
            
            // Clear existing options except the first one (No Default)
            const noDefaultOption = defaultLoraRootSelect.querySelector('option[value=""]');
            defaultLoraRootSelect.innerHTML = '';
            defaultLoraRootSelect.appendChild(noDefaultOption);
            
            // Add options for each root
            data.roots.forEach(root => {
                const option = document.createElement('option');
                option.value = root;
                option.textContent = root;
                defaultLoraRootSelect.appendChild(option);
            });
            
            // Set selected value from settings
            const defaultRoot = state.global.settings.default_loras_root || '';
            defaultLoraRootSelect.value = defaultRoot;
            
        } catch (error) {
            console.error('Error loading LoRA roots:', error);
            showToast('Failed to load LoRA roots: ' + error.message, 'error');
        }
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
        const showOnlySFW = document.getElementById('showOnlySFW').checked;
        const defaultLoraRoot = document.getElementById('defaultLoraRoot').value;
        
        // Get backend settings
        const apiKey = document.getElementById('civitaiApiKey').value;
        
        // Update frontend state and save to localStorage
        state.global.settings.blurMatureContent = blurMatureContent;
        state.global.settings.show_only_sfw = showOnlySFW;
        state.global.settings.default_loras_root = defaultLoraRoot;
        
        // Save settings to localStorage
        setStorageItem('settings', state.global.settings);
        
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
            
            if (this.currentPage === 'loras') {
                // Reload the loras without updating folders
                await resetAndReload(false);
            } else if (this.currentPage === 'recipes') {
                // Reload the recipes without updating folders
                await window.recipeManager.loadRecipes();
            } else if (this.currentPage === 'checkpoints') {
                // Reload the checkpoints without updating folders
                await window.checkpointsManager.loadCheckpoints();
            }
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
