import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { LoadingManager } from './LoadingManager.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';

export class DownloadManager {
    constructor() {
        this.currentVersion = null;
        this.versions = [];
        this.modelInfo = null;
        this.modelVersionId = null; // Add new property for initial version ID
        
        // Add initialization check
        this.initialized = false;
        this.selectedFolder = '';

        // Add LoadingManager instance
        this.loadingManager = new LoadingManager();
        this.folderClickHandler = null;  // Add this line
        this.updateTargetPath = this.updateTargetPath.bind(this);
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
        
        modalManager.showModal('downloadModal', null, () => {
            // Cleanup handler when modal closes
            this.cleanupFolderBrowser();
        });
        this.resetSteps();
    }

    resetSteps() {
        document.querySelectorAll('.download-step').forEach(step => step.style.display = 'none');
        document.getElementById('urlStep').style.display = 'block';
        document.getElementById('loraUrl').value = '';
        document.getElementById('urlError').textContent = '';
        
        // Clear new folder input
        const newFolderInput = document.getElementById('newFolder');
        if (newFolderInput) {
            newFolderInput.value = '';
        }
        
        this.currentVersion = null;
        this.versions = [];
        this.modelInfo = null;
        this.modelVersionId = null;
        
        // Clear selected folder and remove selection from UI
        this.selectedFolder = '';
        const folderBrowser = document.getElementById('folderBrowser');
        if (folderBrowser) {
            folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                f.classList.remove('selected'));
        }
    }

    async validateAndFetchVersions() {
        const url = document.getElementById('loraUrl').value.trim();
        const errorElement = document.getElementById('urlError');
        
        try {
            this.loadingManager.showSimpleLoading('Fetching model versions...');
            
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
        } finally {
            this.loadingManager.hide();
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
        versionList.innerHTML = this.versions.map(version => {
            const firstImage = version.images?.find(img => !img.url.endsWith('.mp4'));
            const thumbnailUrl = firstImage ? firstImage.url : '/loras_static/images/no-preview.png';
            const fileSize = (version.files[0]?.sizeKB / 1024).toFixed(2);
            
            const existsLocally = version.files[0]?.existsLocally;
            const localPath = version.files[0]?.localPath;
            
            // 更新本地状态指示器为badge样式
            const localStatus = existsLocally ? 
                `<div class="local-badge">
                    <i class="fas fa-check"></i> In Library
                    <div class="local-path">${localPath}</div>
                 </div>` : '';

            return `
                <div class="version-item ${this.currentVersion?.id === version.id ? 'selected' : ''} ${existsLocally ? 'exists-locally' : ''}"
                     onclick="downloadManager.selectVersion('${version.id}')">
                    <div class="version-thumbnail">
                        <img src="${thumbnailUrl}" alt="Version preview">
                    </div>
                    <div class="version-content">
                        <div class="version-header">
                            <h3>${version.name}</h3>
                            ${localStatus}
                        </div>
                        <div class="version-info">
                            ${version.baseModel ? `<div class="base-model">${version.baseModel}</div>` : ''}
                        </div>
                        <div class="version-meta">
                            <span><i class="fas fa-calendar"></i> ${new Date(version.createdAt).toLocaleDateString()}</span>
                            <span><i class="fas fa-file-archive"></i> ${fileSize} MB</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectVersion(versionId) {
        this.currentVersion = this.versions.find(v => v.id.toString() === versionId.toString());
        if (!this.currentVersion) return;

        // Check if version exists locally
        const existsLocally = this.currentVersion.files[0]?.existsLocally;
        if (existsLocally) {
            showToast('This version already exists in your library', 'info');
        }

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

        // Construct relative path
        let targetFolder = '';
        if (this.selectedFolder) {
            targetFolder = this.selectedFolder;
        }
        if (newFolder) {
            targetFolder = targetFolder ? 
                `${targetFolder}/${newFolder}` : newFolder;
        }

        try {
            const downloadUrl = this.currentVersion.downloadUrl;
            if (!downloadUrl) {
                throw new Error('No download URL available');
            }

            // Show loading with progress bar for download
            this.loadingManager.show('Downloading LoRA...', 0);

            // Setup WebSocket for progress updates
            const ws = new WebSocket(`ws://${window.location.host}/ws/fetch-progress`);
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.status === 'progress') {
                    this.loadingManager.setProgress(data.progress);
                    this.loadingManager.setStatus(`Downloading: ${data.progress}%`);
                }
            };

            // Start download
            const response = await fetch('/api/download-lora', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    download_url: downloadUrl,
                    lora_root: loraRoot,
                    relative_path: targetFolder
                })
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            showToast('Download completed successfully', 'success');
            modalManager.closeModal('downloadModal');
            
            // Update state and trigger reload with folder update
            state.activeFolder = targetFolder;
            await resetAndReload(true); // Pass true to update folders

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            this.loadingManager.hide();
        }
    }

    // Add new method to handle folder selection
    initializeFolderBrowser() {
        const folderBrowser = document.getElementById('folderBrowser');
        if (!folderBrowser) return;

        // Cleanup existing handler if any
        this.cleanupFolderBrowser();

        // Create new handler
        this.folderClickHandler = (event) => {
            const folderItem = event.target.closest('.folder-item');
            if (!folderItem) return;

            if (folderItem.classList.contains('selected')) {
                folderItem.classList.remove('selected');
                this.selectedFolder = '';
            } else {
                folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                    f.classList.remove('selected'));
                folderItem.classList.add('selected');
                this.selectedFolder = folderItem.dataset.folder;
            }
            
            // Update path display after folder selection
            this.updateTargetPath();
        };

        // Add the new handler
        folderBrowser.addEventListener('click', this.folderClickHandler);
        
        // Add event listeners for path updates
        const loraRoot = document.getElementById('loraRoot');
        const newFolder = document.getElementById('newFolder');
        
        loraRoot.addEventListener('change', this.updateTargetPath);
        newFolder.addEventListener('input', this.updateTargetPath);
        
        // Update initial path
        this.updateTargetPath();
    }

    cleanupFolderBrowser() {
        if (this.folderClickHandler) {
            const folderBrowser = document.getElementById('folderBrowser');
            if (folderBrowser) {
                folderBrowser.removeEventListener('click', this.folderClickHandler);
                this.folderClickHandler = null;
            }
        }
        
        // Remove path update listeners
        const loraRoot = document.getElementById('loraRoot');
        const newFolder = document.getElementById('newFolder');
        
        loraRoot.removeEventListener('change', this.updateTargetPath);
        newFolder.removeEventListener('input', this.updateTargetPath);
    }
    
    // Add new method to update target path
    updateTargetPath() {
        const pathDisplay = document.getElementById('targetPathDisplay');
        const loraRoot = document.getElementById('loraRoot').value;
        const newFolder = document.getElementById('newFolder').value.trim();
        
        let fullPath = loraRoot || 'Select a LoRA root directory';
        
        if (loraRoot) {
            if (this.selectedFolder) {
                fullPath += '/' + this.selectedFolder;
            }
            if (newFolder) {
                fullPath += '/' + newFolder;
            }
        }

        pathDisplay.innerHTML = `<span class="path-text">${fullPath}</span>`;
    }
}
