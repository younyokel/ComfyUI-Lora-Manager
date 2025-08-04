import { showToast, updateFolderTags } from '../utils/uiHelpers.js';
import { state, getCurrentPageState } from '../state/index.js';
import { modalManager } from './ModalManager.js';
import { getStorageItem } from '../utils/storageHelpers.js';
import { getModelApiClient } from '../api/modelApiFactory.js';

class MoveManager {
    constructor() {
        this.currentFilePath = null;
        this.bulkFilePaths = null;
        this.modal = document.getElementById('moveModal');
        this.loraRootSelect = document.getElementById('moveLoraRoot');
        this.folderBrowser = document.getElementById('moveFolderBrowser');
        this.newFolderInput = document.getElementById('moveNewFolder');
        this.pathDisplay = document.getElementById('moveTargetPathDisplay');
        this.modalTitle = document.getElementById('moveModalTitle');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 初始化LoRA根目录选择器
        this.loraRootSelect.addEventListener('change', () => this.updatePathPreview());

        // 文件夹选择事件
        this.folderBrowser.addEventListener('click', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) return;

            // 如果点击已选中的文件夹，则取消选择
            if (folderItem.classList.contains('selected')) {
                folderItem.classList.remove('selected');
            } else {
                // 取消其他选中状态
                this.folderBrowser.querySelectorAll('.folder-item').forEach(item => {
                    item.classList.remove('selected');
                });
                // 设置当前选中状态
                folderItem.classList.add('selected');
            }
            
            this.updatePathPreview();
        });

        // 新文件夹输入事件
        this.newFolderInput.addEventListener('input', () => this.updatePathPreview());
    }

    async showMoveModal(filePath) {
        // Reset state
        this.currentFilePath = null;
        this.bulkFilePaths = null;
        
        // Handle bulk mode
        if (filePath === 'bulk') {
            const selectedPaths = Array.from(state.selectedLoras);
            if (selectedPaths.length === 0) {
                showToast('No LoRAs selected', 'warning');
                return;
            }
            this.bulkFilePaths = selectedPaths;
            this.modalTitle.textContent = `Move ${selectedPaths.length} LoRAs`;
        } else {
            // Single file mode
            this.currentFilePath = filePath;
            this.modalTitle.textContent = "Move Model";
        }
        
        // 清除之前的选择
        this.folderBrowser.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.newFolderInput.value = '';

        try {
            // Fetch LoRA roots
            const rootsResponse = await fetch('/api/loras/roots');
            if (!rootsResponse.ok) {
                throw new Error('Failed to fetch LoRA roots');
            }
            
            const rootsData = await rootsResponse.json();
            if (!rootsData.roots || rootsData.roots.length === 0) {
                throw new Error('No LoRA roots found');
            }

            // 填充LoRA根目录选择器
            this.loraRootSelect.innerHTML = rootsData.roots.map(root => 
                `<option value="${root}">${root}</option>`
            ).join('');

            // Set default lora root if available
            const defaultRoot = getStorageItem('settings', {}).default_lora_root;
            if (defaultRoot && rootsData.roots.includes(defaultRoot)) {
                this.loraRootSelect.value = defaultRoot;
            }

            // Fetch folders dynamically
            const foldersResponse = await fetch('/api/loras/folders');
            if (!foldersResponse.ok) {
                throw new Error('Failed to fetch folders');
            }
            
            const foldersData = await foldersResponse.json();
            
            // Update folder browser with dynamic content
            this.folderBrowser.innerHTML = foldersData.folders.map(folder => 
                `<div class="folder-item" data-folder="${folder}">${folder}</div>`
            ).join('');

            this.updatePathPreview();
            modalManager.showModal('moveModal');
            
        } catch (error) {
            console.error('Error fetching LoRA roots or folders:', error);
            showToast(error.message, 'error');
        }
    }

    updatePathPreview() {
        const selectedRoot = this.loraRootSelect.value;
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
        const selectedRoot = this.loraRootSelect.value;
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
                const foldersResponse = await fetch('/api/loras/folders');
                if (foldersResponse.ok) {
                    const foldersData = await foldersResponse.json();
                    updateFolderTags(foldersData.folders);
                }
            } catch (error) {
                console.error('Error refreshing folder tags:', error);
            }

            modalManager.closeModal('moveModal');
            
            // If we were in bulk mode, exit it after successful move
            if (this.bulkFilePaths && state.bulkMode) {
                toggleBulkMode();
            }

        } catch (error) {
            console.error('Error moving model(s):', error);
            showToast('Failed to move model(s): ' + error.message, 'error');
        }
    }
}

export const moveManager = new MoveManager();
