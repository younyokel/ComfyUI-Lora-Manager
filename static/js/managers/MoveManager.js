import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { modalManager } from './ModalManager.js';

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
            const response = await fetch('/api/lora-roots');
            if (!response.ok) {
                throw new Error('Failed to fetch LoRA roots');
            }
            
            const data = await response.json();
            if (!data.roots || data.roots.length === 0) {
                throw new Error('No LoRA roots found');
            }

            // 填充LoRA根目录选择器
            this.loraRootSelect.innerHTML = data.roots.map(root => 
                `<option value="${root}">${root}</option>`
            ).join('');

            this.updatePathPreview();
            modalManager.showModal('moveModal');
            
        } catch (error) {
            console.error('Error fetching LoRA roots:', error);
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

        try {
            if (this.bulkFilePaths) {
                // Bulk move mode
                await this.moveBulkModels(this.bulkFilePaths, targetPath);
            } else {
                // Single move mode
                await this.moveSingleModel(this.currentFilePath, targetPath);
            }

            modalManager.closeModal('moveModal');
            await resetAndReload(true);
            
            // If we were in bulk mode, exit it after successful move
            if (this.bulkFilePaths && state.bulkMode) {
                toggleBulkMode();
            }

        } catch (error) {
            console.error('Error moving model(s):', error);
            showToast('Failed to move model(s): ' + error.message, 'error');
        }
    }
    
    async moveSingleModel(filePath, targetPath) {
        // show toast if current path is same as target path
        if (filePath.substring(0, filePath.lastIndexOf('/')) === targetPath) {
            showToast('Model is already in the selected folder', 'info');
            return;
        }

        const response = await fetch('/api/move_model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_path: filePath,
                target_path: targetPath
            })
        });

        if (!response.ok) {
            throw new Error('Failed to move model');
        }

        showToast('Model moved successfully', 'success');
    }
    
    async moveBulkModels(filePaths, targetPath) {
        // Filter out models already in the target path
        const movedPaths = filePaths.filter(path => {
            return path.substring(0, path.lastIndexOf('/')) !== targetPath;
        });
        
        if (movedPaths.length === 0) {
            showToast('All selected models are already in the target folder', 'info');
            return;
        }

        const response = await fetch('/api/move_models_bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_paths: movedPaths,
                target_path: targetPath
            })
        });

        if (!response.ok) {
            throw new Error('Failed to move models');
        }

        showToast(`Successfully moved ${movedPaths.length} models`, 'success');
    }
}

export const moveManager = new MoveManager();
