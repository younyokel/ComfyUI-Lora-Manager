// CheckpointsControls.js - Specific implementation for the Checkpoints page
import { PageControls } from './PageControls.js';
import { loadMoreCheckpoints, refreshCheckpoints, fetchCivitai } from '../../api/checkpointApi.js';
import { resetAndReload } from '../../api/baseModelApi.js';
import { showToast } from '../../utils/uiHelpers.js';
import { downloadManager } from '../../managers/DownloadManager.js';

/**
 * CheckpointsControls class - Extends PageControls for Checkpoint-specific functionality
 */
export class CheckpointsControls extends PageControls {
    constructor() {
        // Initialize with 'checkpoints' page type
        super('checkpoints');
        
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
            
            refreshModels: async (fullRebuild = false) => {
                return await refreshCheckpoints(fullRebuild);
            },
            
            // Add fetch from Civitai functionality for checkpoints
            fetchFromCivitai: async () => {
                return await fetchCivitai();
            },
            
            // Add show download modal functionality
            showDownloadModal: () => {
                downloadManager.showDownloadModal();
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