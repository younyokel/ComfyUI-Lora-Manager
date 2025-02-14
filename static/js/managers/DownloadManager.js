import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';

export class DownloadManager {
    constructor() {
        this.currentVersion = null;
        this.versions = [];
        this.modelInfo = null;
        this.modelVersionId = null; // Add new property for initial version ID
        
        // Add initialization check
        this.initialized = false;
        this.selectedFolder = '';
    }

    showDownloadModal() {
        console.log('Showing download modal...'); // Add debug log
        if (!this.initialized) {
            // Check if modal exists
            const modal = document.getElementById('downloadModal');
            if (!modal) {
                console.error('Download modal element not found');
                return;
            }
            this.initialized = true;
        }
        
        modalManager.showModal('downloadModal');
        this.resetSteps();
    }

    resetSteps() {
        document.querySelectorAll('.download-step').forEach(step => step.style.display = 'none');
        document.getElementById('urlStep').style.display = 'block';
        document.getElementById('loraUrl').value = '';
        document.getElementById('urlError').textContent = '';
        this.currentVersion = null;
        this.versions = [];
        this.modelInfo = null;
        this.modelVersionId = null;
    }

    async validateAndFetchVersions() {
        const url = document.getElementById('loraUrl').value.trim();
        const errorElement = document.getElementById('urlError');
        
        try {
            const modelId = this.extractModelId(url);
            if (!modelId) {
                throw new Error('Invalid Civitai URL format');
            }

            const response = await fetch(`/api/civitai/versions/${modelId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch model versions');
            }
            
            this.versions = await response.json();
            if (!this.versions.length) {
                throw new Error('No versions available for this model');
            }
            
            // If we have a version ID from URL, pre-select it
            if (this.modelVersionId) {
                this.currentVersion = this.versions.find(v => v.id.toString() === this.modelVersionId);
            }
            
            this.showVersionStep();
        } catch (error) {
            errorElement.textContent = error.message;
        }
    }

    extractModelId(url) {
        const modelMatch = url.match(/civitai\.com\/models\/(\d+)/);
        const versionMatch = url.match(/modelVersionId=(\d+)/);
        
        if (modelMatch) {
            this.modelVersionId = versionMatch ? versionMatch[1] : null;
            return modelMatch[1];
        }
        return null;
    }

    showVersionStep() {
        document.getElementById('urlStep').style.display = 'none';
        document.getElementById('versionStep').style.display = 'block';
        
        const versionList = document.getElementById('versionList');
        versionList.innerHTML = this.versions.map(version => `
            <div class="version-item ${this.currentVersion?.id === version.id ? 'selected' : ''}"
                 onclick="downloadManager.selectVersion('${version.id}')">
                <h3>${version.name}</h3>
                <div class="version-info">
                    ${version.baseModel ? `<div class="base-model">${version.baseModel}</div>` : ''}
                    <div class="version-date">${new Date(version.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
        `).join('');
    }

    selectVersion(versionId) {
        this.currentVersion = this.versions.find(v => v.id.toString() === versionId.toString());
        if (!this.currentVersion) return;

        document.querySelectorAll('.version-item').forEach(item => {
            item.classList.toggle('selected', item.querySelector('h3').textContent === this.currentVersion.name);
        });
    }

    async proceedToLocation() {
        if (!this.currentVersion) {
            showToast('Please select a version', 'error');
            return;
        }

        document.getElementById('versionStep').style.display = 'none';
        document.getElementById('locationStep').style.display = 'block';
        
        try {
            const response = await fetch('/api/lora-roots');
            if (!response.ok) {
                throw new Error('Failed to fetch LoRA roots');
            }
            
            const data = await response.json();
            const loraRoot = document.getElementById('loraRoot');
            loraRoot.innerHTML = data.roots.map(root => 
                `<option value="${root}">${root}</option>`
            ).join('');

            // Initialize folder browser after loading roots
            this.initializeFolderBrowser();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    backToUrl() {
        document.getElementById('versionStep').style.display = 'none';
        document.getElementById('urlStep').style.display = 'block';
    }

    backToVersions() {
        document.getElementById('locationStep').style.display = 'none';
        document.getElementById('versionStep').style.display = 'block';
    }

    async startDownload() {
        const loraRoot = document.getElementById('loraRoot').value;
        const newFolder = document.getElementById('newFolder').value.trim();
        
        if (!loraRoot) {
            showToast('Please select a LoRA root directory', 'error');
            return;
        }

        console.log('Selected folder:', this.selectedFolder); // Log selected folder
        console.log('New folder:', newFolder); // Log new folder

        // Construct relative path
        let relativePath = '';
        if (this.selectedFolder) {
            relativePath = this.selectedFolder;
        }
        if (newFolder) {
            relativePath = relativePath ? 
                `${relativePath}/${newFolder}` : newFolder;
        }

        try {
            const downloadUrl = this.currentVersion.downloadUrl;
            if (!downloadUrl) {
                throw new Error('No download URL available');
            }

            // 只传递必要参数
            const response = await fetch('/api/download-lora', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    download_url: downloadUrl,
                    lora_root: loraRoot,
                    relative_path: relativePath
                })
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result = await response.json();
            showToast('Download completed successfully', 'success');
            modalManager.closeModal('downloadModal');
            
            // Refresh the grid to show new model
            window.refreshLoras(false);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    // Add new method to handle folder selection
    initializeFolderBrowser() {
        // Update folder selection handling
        const folderBrowser = document.getElementById('folderBrowser');
        if (!folderBrowser) return;

        // Update folder selection event handling
        folderBrowser.addEventListener('click', (event) => {
            const folderItem = event.target.closest('.folder-item');
            if (!folderItem) return;

            // Remove previous selection
            folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                f.classList.remove('selected'));
            
            // Add selection to clicked folder
            folderItem.classList.add('selected');
            this.selectedFolder = folderItem.dataset.folder;
        });
    }
}
