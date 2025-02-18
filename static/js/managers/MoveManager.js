import { showToast } from '../utils/uiHelpers.js';
import { resetAndReload } from '../api/loraApi.js';
import { modalManager } from './ModalManager.js';

class MoveManager {
    constructor() {
        this.currentFilePath = null;
        this.modal = document.getElementById('moveModal');
        this.loraRootSelect = document.getElementById('moveLoraRoot');
        this.folderBrowser = document.getElementById('moveFolderBrowser');
        this.newFolderInput = document.getElementById('moveNewFolder');
        this.pathDisplay = document.getElementById('moveTargetPathDisplay');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 初始化LoRA根目录选择器
        this.loraRootSelect.addEventListener('change', () => this.updatePathPreview());

        // 文件夹选择事件
        this.folderBrowser.addEventListener('click', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) return;

            // 取消其他选中状态
            this.folderBrowser.querySelectorAll('.folder-item').forEach(item => {
                item.classList.remove('selected');
            });

            // 设置当前选中状态
            folderItem.classList.add('selected');
            this.updatePathPreview();
        });

        // 新文件夹输入事件
        this.newFolderInput.addEventListener('input', () => this.updatePathPreview());
    }

    async showMoveModal(filePath) {
        this.currentFilePath = filePath;
        
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

        // show toast if current path is same as target path
        if (this.currentFilePath.substring(0, this.currentFilePath.lastIndexOf('/')) === targetPath) {
            showToast('Model is already in the selected folder', 'info');
            return;
        }

        try {
            const response = await fetch('/api/move_model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: this.currentFilePath,
                    target_path: targetPath
                })
            });

            if (!response.ok) {
                throw new Error('Failed to move model');
            }

            showToast('Model moved successfully', 'success');
            modalManager.closeModal('moveModal');
            await resetAndReload(true);

        } catch (error) {
            console.error('Error moving model:', error);
            showToast('Failed to move model: ' + error.message, 'error');
        }
    }
}

export const moveManager = new MoveManager();
