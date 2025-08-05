import { showToast, updateFolderTags } from '../utils/uiHelpers.js';
import { state, getCurrentPageState } from '../state/index.js';
import { modalManager } from './ModalManager.js';
import { bulkManager } from './BulkManager.js';
import { getStorageItem } from '../utils/storageHelpers.js';
import { getModelApiClient } from '../api/modelApiFactory.js';

class MoveManager {
    constructor() {
        this.currentFilePath = null;
        this.bulkFilePaths = null;
        this.modal = document.getElementById('moveModal');
        this.modelRootSelect = document.getElementById('moveModelRoot');
        this.folderBrowser = document.getElementById('moveFolderBrowser');
        this.newFolderInput = document.getElementById('moveNewFolder');
        this.pathDisplay = document.getElementById('moveTargetPathDisplay');
        this.modalTitle = document.getElementById('moveModalTitle');
        this.rootLabel = document.getElementById('moveRootLabel');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Initialize model root directory selector
        this.modelRootSelect.addEventListener('change', () => this.updatePathPreview());

        // Folder selection event
        this.folderBrowser.addEventListener('click', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) return;

            // If clicking already selected folder, deselect it
            if (folderItem.classList.contains('selected')) {
                folderItem.classList.remove('selected');
            } else {
                // Deselect other folders
                this.folderBrowser.querySelectorAll('.folder-item').forEach(item => {
                    item.classList.remove('selected');
                });
                // Select current folder
                folderItem.classList.add('selected');
            }
            
            this.updatePathPreview();
        });

        // New folder input event
        this.newFolderInput.addEventListener('input', () => this.updatePathPreview());
    }

    async showMoveModal(filePath, modelType = null) {
        // Reset state
        this.currentFilePath = null;
        this.bulkFilePaths = null;
        
        const apiClient = getModelApiClient();
        const currentPageType = state.currentPageType;
        const modelConfig = apiClient.apiConfig.config;
        
        // Handle bulk mode
        if (filePath === 'bulk') {
            const selectedPaths = Array.from(state.selectedModels);
            if (selectedPaths.length === 0) {
                showToast('No models selected', 'warning');
                return;
            }
            this.bulkFilePaths = selectedPaths;
            this.modalTitle.textContent = `Move ${selectedPaths.length} ${modelConfig.displayName}s`;
        } else {
            // Single file mode
            this.currentFilePath = filePath;
            this.modalTitle.textContent = `Move ${modelConfig.displayName}`;
        }
        
        // Update UI labels based on model type
        this.rootLabel.textContent = `Select ${modelConfig.displayName} Root:`;
        this.pathDisplay.querySelector('.path-text').textContent = `Select a ${modelConfig.displayName.toLowerCase()} root directory`;
        
        // Clear previous selections
        this.folderBrowser.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.newFolderInput.value = '';

        try {
            // Fetch model roots
            let rootsData;
            if (modelType) {
                // For checkpoints, use the specific API method that considers modelType
                rootsData = await apiClient.fetchModelRoots(modelType);
            } else {
                // For other model types, use the generic method
                rootsData = await apiClient.fetchModelRoots();
            }
            
            if (!rootsData.roots || rootsData.roots.length === 0) {
                throw new Error(`No ${modelConfig.displayName.toLowerCase()} roots found`);
            }

            // Populate model root selector
            this.modelRootSelect.innerHTML = rootsData.roots.map(root => 
                `<option value="${root}">${root}</option>`
            ).join('');

            // Set default root if available
            const settingsKey = `default_${currentPageType.slice(0, -1)}_root`; // Remove 's' from plural
            const defaultRoot = getStorageItem('settings', {})[settingsKey];
            if (defaultRoot && rootsData.roots.includes(defaultRoot)) {
                this.modelRootSelect.value = defaultRoot;
            }

            // Fetch folders dynamically
            const foldersData = await apiClient.fetchModelFolders();
            
            // Update folder browser with dynamic content
            this.folderBrowser.innerHTML = foldersData.folders.map(folder => 
                `<div class="folder-item" data-folder="${folder}">${folder}</div>`
            ).join('');

            this.updatePathPreview();
            modalManager.showModal('moveModal');
            
        } catch (error) {
            console.error(`Error fetching ${modelConfig.displayName.toLowerCase()} roots or folders:`, error);
            showToast(error.message, 'error');
        }
    }

    updatePathPreview() {
        const selectedRoot = this.modelRootSelect.value;
        const selectedFolder = this.folderBrowser.querySelector('.folder-item.selected')?.dataset.folder || '';
        const newFolder = this.newFolderInput.value.trim();

        let targetPath = selectedRoot;
        if (selectedFolder) {
            targetPath = `${targetPath}/${selectedFolder}`;
        }
        if (newFolder) {
            targetPath = `${targetPath}/${newFolder}`;
        }

        this.pathDisplay.querySelector('.path-text').textContent = targetPath;
    }

    async moveModel() {
        const selectedRoot = this.modelRootSelect.value;
        const selectedFolder = this.folderBrowser.querySelector('.folder-item.selected')?.dataset.folder || '';
        const newFolder = this.newFolderInput.value.trim();

        let targetPath = selectedRoot;
        if (selectedFolder) {
            targetPath = `${targetPath}/${selectedFolder}`;
        }
        if (newFolder) {
            targetPath = `${targetPath}/${newFolder}`;
        }

        const apiClient = getModelApiClient();

        try {
            if (this.bulkFilePaths) {
                // Bulk move mode
                const movedFilePaths = await apiClient.moveBulkModels(this.bulkFilePaths, targetPath);

                // Update virtual scroller if in active folder view
                const pageState = getCurrentPageState();
                if (pageState.activeFolder !== null && state.virtualScroller) {
                    // Remove only successfully moved items
                    movedFilePaths.forEach(newFilePath => {
                        // Find original filePath by matching filename
                        const filename = newFilePath.substring(newFilePath.lastIndexOf('/') + 1);
                        const originalFilePath = this.bulkFilePaths.find(fp => fp.endsWith('/' + filename));
                        if (originalFilePath) {
                            state.virtualScroller.removeItemByFilePath(originalFilePath);
                        }
                    });
                } else {
                    // Update the model cards' filepath in the DOM
                    movedFilePaths.forEach(newFilePath => {
                        const filename = newFilePath.substring(newFilePath.lastIndexOf('/') + 1);
                        const originalFilePath = this.bulkFilePaths.find(fp => fp.endsWith('/' + filename));
                        if (originalFilePath) {
                            state.virtualScroller.updateSingleItem(originalFilePath, {file_path: newFilePath});
                        }
                    });
                }
            } else {
                // Single move mode
                const newFilePath = await apiClient.moveSingleModel(this.currentFilePath, targetPath);

                const pageState = getCurrentPageState();
                if (newFilePath) {
                    if (pageState.activeFolder !== null && state.virtualScroller) {
                        state.virtualScroller.removeItemByFilePath(this.currentFilePath);
                    } else {
                        state.virtualScroller.updateSingleItem(this.currentFilePath, {file_path: newFilePath});
                    }
                }
            }

            // Refresh folder tags after successful move
            try {
                const foldersData = await apiClient.fetchModelFolders();
                updateFolderTags(foldersData.folders);
            } catch (error) {
                console.error('Error refreshing folder tags:', error);
            }

            modalManager.closeModal('moveModal');
            
            // If we were in bulk mode, exit it after successful move
            if (this.bulkFilePaths && state.bulkMode) {
                bulkManager.toggleBulkMode();
            }

        } catch (error) {
            console.error('Error moving model(s):', error);
            showToast('Failed to move model(s): ' + error.message, 'error');
        }
    }
}

export const moveManager = new MoveManager();
