// CheckpointsControls.js - Specific implementation for the Checkpoints page
import { PageControls } from './PageControls.js';
import { loadMoreCheckpoints, resetAndReload, refreshCheckpoints, fetchCivitai } from '../../api/checkpointApi.js';
import { showToast } from '../../utils/uiHelpers.js';
import { CheckpointDownloadManager } from '../../managers/CheckpointDownloadManager.js';

/**
 * CheckpointsControls class - Extends PageControls for Checkpoint-specific functionality
 */
export class CheckpointsControls extends PageControls {
    constructor() {
        // Initialize with 'checkpoints' page type
        super('checkpoints');
        
        // Initialize checkpoint download manager
        this.downloadManager = new CheckpointDownloadManager();
        
        // Register API methods specific to the Checkpoints page
        this.registerCheckpointsAPI();
    }
    
    /**
     * Register Checkpoint-specific API methods
     */
    registerCheckpointsAPI() {
        const checkpointsAPI = {
            // Core API functions
            loadMoreModels: async (resetPage = false, updateFolders = false) => {
                return await loadMoreCheckpoints(resetPage, updateFolders);
            },
            
            resetAndReload: async (updateFolders = false) => {
                return await resetAndReload(updateFolders);
            },
            
            refreshModels: async () => {
                return await refreshCheckpoints();
            },
            
            // Add fetch from Civitai functionality for checkpoints
            fetchFromCivitai: async () => {
                return await fetchCivitai();
            },
            
            // Add show download modal functionality
            showDownloadModal: () => {
                this.downloadManager.showDownloadModal();
            },
            
            // No clearCustomFilter implementation is needed for checkpoints
            // as custom filters are currently only used for LoRAs
            clearCustomFilter: async () => {
                showToast('No custom filter to clear', 'info');
            }
        };
        
        // Register the API
        this.registerAPI(checkpointsAPI);
    }
}