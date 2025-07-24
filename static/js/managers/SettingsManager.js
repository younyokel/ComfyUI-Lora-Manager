import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { setStorageItem, getStorageItem } from '../utils/storageHelpers.js';
import { DOWNLOAD_PATH_TEMPLATES, MAPPABLE_BASE_MODELS } from '../utils/constants.js';

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
        
        // Initialize default values for new settings if they don't exist
        if (state.global.settings.compactMode === undefined) {
            state.global.settings.compactMode = false;
        }
        
        // Set default for optimizeExampleImages if undefined
        if (state.global.settings.optimizeExampleImages === undefined) {
            state.global.settings.optimizeExampleImages = true;
        }
        
        // Set default for cardInfoDisplay if undefined
        if (state.global.settings.cardInfoDisplay === undefined) {
            state.global.settings.cardInfoDisplay = 'always';
        }

        // Set default for defaultCheckpointRoot if undefined
        if (state.global.settings.default_checkpoint_root === undefined) {
            state.global.settings.default_checkpoint_root = '';
        }

        // Convert old boolean compactMode to new displayDensity string
        if (typeof state.global.settings.displayDensity === 'undefined') {
            if (state.global.settings.compactMode === true) {
                state.global.settings.displayDensity = 'compact';
            } else {
                state.global.settings.displayDensity = 'default';
            }
            // We can delete the old setting, but keeping it for backwards compatibility
        }

        // Set default for download path template if undefined
        if (state.global.settings.download_path_template === undefined) {
            state.global.settings.download_path_template = DOWNLOAD_PATH_TEMPLATES.BASE_MODEL_TAG.value;
        }

        // Set default for base model path mappings if undefined
        if (state.global.settings.base_model_path_mappings === undefined) {
            state.global.settings.base_model_path_mappings = {};
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
        
        // Add event listeners for all toggle-visibility buttons
        document.querySelectorAll('.toggle-visibility').forEach(button => {
            button.addEventListener('click', () => this.toggleInputVisibility(button));
        });
        
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
        
        // Set video autoplay on hover setting
        const autoplayOnHoverCheckbox = document.getElementById('autoplayOnHover');
        if (autoplayOnHoverCheckbox) {
            autoplayOnHoverCheckbox.checked = state.global.settings.autoplayOnHover || false;
        }
        
        // Set display density setting
        const displayDensitySelect = document.getElementById('displayDensity');
        if (displayDensitySelect) {
            displayDensitySelect.value = state.global.settings.displayDensity || 'default';
        }
        
        // Set card info display setting
        const cardInfoDisplaySelect = document.getElementById('cardInfoDisplay');
        if (cardInfoDisplaySelect) {
            cardInfoDisplaySelect.value = state.global.settings.cardInfoDisplay || 'always';
        }

        // Set optimize example images setting
        const optimizeExampleImagesCheckbox = document.getElementById('optimizeExampleImages');
        if (optimizeExampleImagesCheckbox) {
            optimizeExampleImagesCheckbox.checked = state.global.settings.optimizeExampleImages || false;
        }

        // Set download path template setting
        const downloadPathTemplateSelect = document.getElementById('downloadPathTemplate');
        if (downloadPathTemplateSelect) {
            downloadPathTemplateSelect.value = state.global.settings.download_path_template || '';
            this.updatePathTemplatePreview();
        }

        // Load base model path mappings
        this.loadBaseModelMappings();

        // Load default lora root
        await this.loadLoraRoots();
        
        // Load default checkpoint root
        await this.loadCheckpointRoots();
        
        // Backend settings are loaded from the template directly
    }

    async loadLoraRoots() {
        try {
            const defaultLoraRootSelect = document.getElementById('defaultLoraRoot');
            if (!defaultLoraRootSelect) return;
            
            // Fetch lora roots
            const response = await fetch('/api/loras/roots');
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

    async loadCheckpointRoots() {
        try {
            const defaultCheckpointRootSelect = document.getElementById('defaultCheckpointRoot');
            if (!defaultCheckpointRootSelect) return;
            
            // Fetch checkpoint roots
            const response = await fetch('/api/checkpoints/roots');
            if (!response.ok) {
                throw new Error('Failed to fetch checkpoint roots');
            }
            
            const data = await response.json();
            if (!data.roots || data.roots.length === 0) {
                throw new Error('No checkpoint roots found');
            }
            
            // Clear existing options except the first one (No Default)
            const noDefaultOption = defaultCheckpointRootSelect.querySelector('option[value=""]');
            defaultCheckpointRootSelect.innerHTML = '';
            defaultCheckpointRootSelect.appendChild(noDefaultOption);
            
            // Add options for each root
            data.roots.forEach(root => {
                const option = document.createElement('option');
                option.value = root;
                option.textContent = root;
                defaultCheckpointRootSelect.appendChild(option);
            });
            
            // Set selected value from settings
            const defaultRoot = state.global.settings.default_checkpoint_root || '';
            defaultCheckpointRootSelect.value = defaultRoot;
            
        } catch (error) {
            console.error('Error loading checkpoint roots:', error);
            showToast('Failed to load checkpoint roots: ' + error.message, 'error');
        }
    }

    loadBaseModelMappings() {
        const mappingsContainer = document.getElementById('baseModelMappingsContainer');
        if (!mappingsContainer) return;

        const mappings = state.global.settings.base_model_path_mappings || {};
        
        // Clear existing mappings
        mappingsContainer.innerHTML = '';

        // Add existing mappings
        Object.entries(mappings).forEach(([baseModel, pathValue]) => {
            this.addMappingRow(baseModel, pathValue);
        });

        // Add empty row for new mappings if none exist
        if (Object.keys(mappings).length === 0) {
            this.addMappingRow('', '');
        }
    }

    addMappingRow(baseModel = '', pathValue = '') {
        const mappingsContainer = document.getElementById('baseModelMappingsContainer');
        if (!mappingsContainer) return;

        const row = document.createElement('div');
        row.className = 'mapping-row';
        
        const availableModels = MAPPABLE_BASE_MODELS.filter(model => {
            const existingMappings = state.global.settings.base_model_path_mappings || {};
            return !existingMappings.hasOwnProperty(model) || model === baseModel;
        });

        row.innerHTML = `
            <div class="mapping-controls">
                <select class="base-model-select">
                    <option value="">Select Base Model</option>
                    ${availableModels.map(model => 
                        `<option value="${model}" ${model === baseModel ? 'selected' : ''}>${model}</option>`
                    ).join('')}
                </select>
                <input type="text" class="path-value-input" placeholder="Custom path (e.g., flux)" value="${pathValue}">
                <button type="button" class="remove-mapping-btn" title="Remove mapping">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add event listeners
        const baseModelSelect = row.querySelector('.base-model-select');
        const pathValueInput = row.querySelector('.path-value-input');
        const removeBtn = row.querySelector('.remove-mapping-btn');

        // Save on select change immediately
        baseModelSelect.addEventListener('change', () => this.updateBaseModelMappings());
        
        // Save on input blur or Enter key
        pathValueInput.addEventListener('blur', () => this.updateBaseModelMappings());
        pathValueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
        
        removeBtn.addEventListener('click', () => {
            row.remove();
            this.updateBaseModelMappings();
        });

        mappingsContainer.appendChild(row);
    }

    updateBaseModelMappings() {
        const mappingsContainer = document.getElementById('baseModelMappingsContainer');
        if (!mappingsContainer) return;

        const rows = mappingsContainer.querySelectorAll('.mapping-row');
        const newMappings = {};
        let hasValidMapping = false;

        rows.forEach(row => {
            const baseModelSelect = row.querySelector('.base-model-select');
            const pathValueInput = row.querySelector('.path-value-input');
            
            const baseModel = baseModelSelect.value.trim();
            const pathValue = pathValueInput.value.trim();
            
            if (baseModel && pathValue) {
                newMappings[baseModel] = pathValue;
                hasValidMapping = true;
            }
        });

        // Check if mappings have actually changed
        const currentMappings = state.global.settings.base_model_path_mappings || {};
        const mappingsChanged = JSON.stringify(currentMappings) !== JSON.stringify(newMappings);

        if (mappingsChanged) {
            // Update state and save
            state.global.settings.base_model_path_mappings = newMappings;
            this.saveBaseModelMappings();
        }

        // Add empty row if no valid mappings exist
        const hasEmptyRow = Array.from(rows).some(row => {
            const baseModelSelect = row.querySelector('.base-model-select');
            const pathValueInput = row.querySelector('.path-value-input');
            return !baseModelSelect.value && !pathValueInput.value;
        });

        if (!hasEmptyRow) {
            this.addMappingRow('', '');
        }

        // Update available options in all selects
        this.updateAvailableBaseModels();
    }

    updateAvailableBaseModels() {
        const mappingsContainer = document.getElementById('baseModelMappingsContainer');
        if (!mappingsContainer) return;

        const existingMappings = state.global.settings.base_model_path_mappings || {};
        const rows = mappingsContainer.querySelectorAll('.mapping-row');

        rows.forEach(row => {
            const select = row.querySelector('.base-model-select');
            const currentValue = select.value;
            
            // Get available models (not already mapped, except current)
            const availableModels = MAPPABLE_BASE_MODELS.filter(model => 
                !existingMappings.hasOwnProperty(model) || model === currentValue
            );

            // Rebuild options
            select.innerHTML = '<option value="">Select Base Model</option>' +
                availableModels.map(model => 
                    `<option value="${model}" ${model === currentValue ? 'selected' : ''}>${model}</option>`
                ).join('');
        });
    }

    async saveBaseModelMappings() {
        try {
            // Save to localStorage
            setStorageItem('settings', state.global.settings);

            // Save to backend
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    base_model_path_mappings: JSON.stringify(state.global.settings.base_model_path_mappings)
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save base model mappings');
            }

            // Show success toast
            const mappingCount = Object.keys(state.global.settings.base_model_path_mappings).length;
            if (mappingCount > 0) {
                showToast(`Base model path mappings updated (${mappingCount} mapping${mappingCount !== 1 ? 's' : ''})`, 'success');
            } else {
                showToast('Base model path mappings cleared', 'success');
            }

        } catch (error) {
            console.error('Error saving base model mappings:', error);
            showToast('Failed to save base model mappings: ' + error.message, 'error');
        }
    }

    updatePathTemplatePreview() {
        const templateSelect = document.getElementById('downloadPathTemplate');
        const previewElement = document.getElementById('pathTemplatePreview');
        if (!templateSelect || !previewElement) return;

        const template = templateSelect.value;
        const templateInfo = Object.values(DOWNLOAD_PATH_TEMPLATES).find(t => t.value === template);
        
        if (templateInfo) {
            previewElement.textContent = templateInfo.example;
            previewElement.style.display = 'block';
        } else {
            previewElement.style.display = 'none';
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

    async saveToggleSetting(elementId, settingKey) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const value = element.checked;
        
        // Update frontend state
        if (settingKey === 'blur_mature_content') {
            state.global.settings.blurMatureContent = value;
        } else if (settingKey === 'show_only_sfw') {
            state.global.settings.show_only_sfw = value;
        } else if (settingKey === 'autoplay_on_hover') {
            state.global.settings.autoplayOnHover = value;
        } else if (settingKey === 'optimize_example_images') {
            state.global.settings.optimizeExampleImages = value;
        } else if (settingKey === 'compact_mode') {
            state.global.settings.compactMode = value;
        } else {
            // For any other settings that might be added in the future
            state.global.settings[settingKey] = value;
        }
        
        // Save to localStorage
        setStorageItem('settings', state.global.settings);
        
        try {
            // For backend settings, make API call
            if (['show_only_sfw', 'blur_mature_content', 'autoplay_on_hover', 'optimize_example_images', 'use_centralized_examples'].includes(settingKey)) {
                const payload = {};
                payload[settingKey] = value;
                
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error('Failed to save setting');
                }
                
                showToast(`Settings updated: ${settingKey.replace(/_/g, ' ')}`, 'success');
            }
            
            // Apply frontend settings immediately
            this.applyFrontendSettings();
            
            if (settingKey === 'show_only_sfw') {
                this.reloadContent();
            }
            
            // Recalculate layout when compact mode changes
            if (settingKey === 'compact_mode' && state.virtualScroller) {
                state.virtualScroller.calculateLayout();
                showToast(`Compact Mode ${value ? 'enabled' : 'disabled'}`, 'success');
            }
            
        } catch (error) {
            showToast('Failed to save setting: ' + error.message, 'error');
        }
    }
    
    async saveSelectSetting(elementId, settingKey) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const value = element.value;
        
        // Update frontend state
        if (settingKey === 'default_lora_root') {
            state.global.settings.default_loras_root = value;
        } else if (settingKey === 'default_checkpoint_root') {
            state.global.settings.default_checkpoint_root = value;
        } else if (settingKey === 'display_density') {
            state.global.settings.displayDensity = value;
            
            // Also update compactMode for backwards compatibility
            state.global.settings.compactMode = (value !== 'default');
        } else if (settingKey === 'card_info_display') {
            state.global.settings.cardInfoDisplay = value;
        } else if (settingKey === 'download_path_template') {
            state.global.settings.download_path_template = value;
            this.updatePathTemplatePreview();
        } else {
            // For any other settings that might be added in the future
            state.global.settings[settingKey] = value;
        }
        
        // Save to localStorage
        setStorageItem('settings', state.global.settings);
        
        try {
            // For backend settings, make API call
            if (settingKey === 'default_lora_root' || settingKey === 'default_checkpoint_root' || settingKey === 'download_path_template') {
                const payload = {};
                payload[settingKey] = value;
                
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error('Failed to save setting');
                }
                
                showToast(`Settings updated: ${settingKey.replace(/_/g, ' ')}`, 'success');
            }
            
            // Apply frontend settings immediately
            this.applyFrontendSettings();
            
            // Recalculate layout when display density changes
            if (settingKey === 'display_density' && state.virtualScroller) {
                state.virtualScroller.calculateLayout();
                
                let densityName = "Default";
                if (value === 'medium') densityName = "Medium";
                if (value === 'compact') densityName = "Compact";
                
                showToast(`Display Density set to ${densityName}`, 'success');
            }
            
        } catch (error) {
            showToast('Failed to save setting: ' + error.message, 'error');
        }
    }
    
    async saveInputSetting(elementId, settingKey) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const value = element.value;
        
        // For API key or other inputs that need to be saved on backend
        try {
            // Check if value has changed from existing value
            const currentValue = state.global.settings[settingKey] || '';
            if (value === currentValue) {
                return; // No change, exit early
            }
            
            // Update state
            state.global.settings[settingKey] = value;
            
            // Save to localStorage if appropriate
            if (!settingKey.includes('api_key')) { // Don't store API keys in localStorage for security
                setStorageItem('settings', state.global.settings);
            }
            
            // For backend settings, make API call
            const payload = {};
            payload[settingKey] = value;
            
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Failed to save setting');
            }
            
            showToast(`Settings updated: ${settingKey.replace(/_/g, ' ')}`, 'success');
            
        } catch (error) {
            showToast('Failed to save setting: ' + error.message, 'error');
        }
    }

    toggleInputVisibility(button) {
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

    confirmClearCache() {
        // Show confirmation modal
        modalManager.showModal('clearCacheModal');
    }

    async executeClearCache() {
        try {
            // Call the API endpoint to clear cache files
            const response = await fetch('/api/clear-cache', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            
            if (result.success) {
                showToast('Cache files have been cleared successfully. Cache will rebuild on next action.', 'success');
            } else {
                showToast(`Failed to clear cache: ${result.error}`, 'error');
            }
            
            // Close the confirmation modal
            modalManager.closeModal('clearCacheModal');
        } catch (error) {
            showToast(`Error clearing cache: ${error.message}`, 'error');
            modalManager.closeModal('clearCacheModal');
        }
    }

    async reloadContent() {
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
    }

    async saveSettings() {
        // Get frontend settings from UI
        const blurMatureContent = document.getElementById('blurMatureContent').checked;
        const showOnlySFW = document.getElementById('showOnlySFW').checked;
        const defaultLoraRoot = document.getElementById('defaultLoraRoot').value;
        const defaultCheckpointRoot = document.getElementById('defaultCheckpointRoot').value;
        const autoplayOnHover = document.getElementById('autoplayOnHover').checked;
        const optimizeExampleImages = document.getElementById('optimizeExampleImages').checked;
        
        // Get backend settings
        const apiKey = document.getElementById('civitaiApiKey').value;
        
        // Update frontend state and save to localStorage
        state.global.settings.blurMatureContent = blurMatureContent;
        state.global.settings.show_only_sfw = showOnlySFW;
        state.global.settings.default_loras_root = defaultLoraRoot;
        state.global.settings.default_checkpoint_root = defaultCheckpointRoot;
        state.global.settings.autoplayOnHover = autoplayOnHover;
        state.global.settings.optimizeExampleImages = optimizeExampleImages;
        
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
                    show_only_sfw: showOnlySFW,
                    optimize_example_images: optimizeExampleImages,
                    default_checkpoint_root: defaultCheckpointRoot
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
        
        // Apply autoplay setting to existing videos in card previews
        const autoplayOnHover = state.global.settings.autoplayOnHover;
        document.querySelectorAll('.card-preview video').forEach(video => {
            // Remove previous event listeners by cloning and replacing the element
            const videoParent = video.parentElement;
            const videoClone = video.cloneNode(true);
            
            if (autoplayOnHover) {
                // Pause video initially and set up mouse events for hover playback
                videoClone.removeAttribute('autoplay');
                videoClone.pause();
                
                // Add mouse events to the parent element
                videoParent.onmouseenter = () => videoClone.play();
                videoParent.onmouseleave = () => {
                    videoClone.pause();
                    videoClone.currentTime = 0;
                };
            } else {
                // Use default autoplay behavior
                videoClone.setAttribute('autoplay', '');
                videoParent.onmouseenter = null;
                videoParent.onmouseleave = null;
            }
            
            videoParent.replaceChild(videoClone, video);
        });
        
        // Apply display density class to grid
        const grid = document.querySelector('.card-grid');
        if (grid) {
            const density = state.global.settings.displayDensity || 'default';
            
            // Remove all density classes first
            grid.classList.remove('default-density', 'medium-density', 'compact-density');
            
            // Add the appropriate density class
            grid.classList.add(`${density}-density`);
        }
        
        // Apply card info display setting
        const cardInfoDisplay = state.global.settings.cardInfoDisplay || 'always';
        document.body.classList.toggle('hover-reveal', cardInfoDisplay === 'hover');
    }
}

// Create singleton instance
export const settingsManager = new SettingsManager();
