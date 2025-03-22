import { modalManager } from './ModalManager.js';
import { getStorageItem, setStorageItem } from '../utils/storageHelpers.js';

export class UpdateService {
    constructor() {
        this.updateCheckInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.currentVersion = "v0.0.0";  // Initialize with default values
        this.latestVersion = "v0.0.0";   // Initialize with default values
        this.updateInfo = null;
        this.updateAvailable = false;
        this.updateNotificationsEnabled = getStorageItem('show_update_notifications');
        this.lastCheckTime = parseInt(getStorageItem('last_update_check') || '0');
    }

    initialize() {
        // Register event listener for update notification toggle
        const updateCheckbox = document.getElementById('updateNotifications');
        if (updateCheckbox) {
            updateCheckbox.checked = this.updateNotificationsEnabled;
            updateCheckbox.addEventListener('change', (e) => {
                this.updateNotificationsEnabled = e.target.checked;
                setStorageItem('show_update_notifications', e.target.checked);
                this.updateBadgeVisibility();
            });
        }
        
        // Perform update check if needed
        this.checkForUpdates().then(() => {
            // Ensure badges are updated after checking
            this.updateBadgeVisibility();
        });
        
        // Set up event listener for update button
        // const updateToggle = document.getElementById('updateToggleBtn');
        // if (updateToggle) {
        //     updateToggle.addEventListener('click', () => this.toggleUpdateModal());
        // }

        // Immediately update modal content with current values (even if from default)
        this.updateModalContent();
    }
    
    async checkForUpdates() {
        // Check if we should perform an update check
        const now = Date.now();
        const forceCheck = this.lastCheckTime === 0;
        
        if (!forceCheck && now - this.lastCheckTime < this.updateCheckInterval) {
            // If we already have update info, just update the UI
            if (this.updateAvailable) {
                this.updateBadgeVisibility();
            }
            return;
        }
        
        try {
            // Call backend API to check for updates
            const response = await fetch('/loras/api/check-updates');
            const data = await response.json();
            
            if (data.success) {
                this.currentVersion = data.current_version || "v0.0.0";
                this.latestVersion = data.latest_version || "v0.0.0";
                this.updateInfo = data;
                
                // Explicitly set update availability based on version comparison
                this.updateAvailable = this.isNewerVersion(this.latestVersion, this.currentVersion);
                
                // Update last check time
                this.lastCheckTime = now;
                setStorageItem('last_update_check', now.toString());
                
                // Update UI
                this.updateBadgeVisibility();
                this.updateModalContent();

                console.log("Update check complete:", {
                    currentVersion: this.currentVersion,
                    latestVersion: this.latestVersion,
                    updateAvailable: this.updateAvailable
                });
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    }
    
    // Helper method to compare version strings
    isNewerVersion(latestVersion, currentVersion) {
        if (!latestVersion || !currentVersion) return false;
        
        // Remove 'v' prefix if present
        const latest = latestVersion.replace(/^v/, '');
        const current = currentVersion.replace(/^v/, '');
        
        // Split version strings into components
        const latestParts = latest.split(/[-\.]/);
        const currentParts = current.split(/[-\.]/);
        
        // Compare major, minor, patch versions
        for (let i = 0; i < 3; i++) {
            const latestNum = parseInt(latestParts[i] || '0', 10);
            const currentNum = parseInt(currentParts[i] || '0', 10);
            
            if (latestNum > currentNum) return true;
            if (latestNum < currentNum) return false;
        }
        
        // If numeric versions are the same, check for beta/alpha status
        const latestIsBeta = latest.includes('beta') || latest.includes('alpha');
        const currentIsBeta = current.includes('beta') || current.includes('alpha');
        
        // Release version is newer than beta/alpha
        if (!latestIsBeta && currentIsBeta) return true;
        
        return false;
    }
    
    updateBadgeVisibility() {
        const updateToggle = document.querySelector('.update-toggle');
        const updateBadge = document.querySelector('.update-toggle .update-badge');
        const cornerBadge = document.querySelector('.corner-badge');
        
        if (updateToggle) {
            updateToggle.title = this.updateNotificationsEnabled && this.updateAvailable 
                ? "Update Available" 
                : "Check Updates";
        }
        
        // Force updating badges visibility based on current state
        const shouldShow = this.updateNotificationsEnabled && this.updateAvailable;
        
        if (updateBadge) {
            updateBadge.classList.toggle('hidden', !shouldShow);
            console.log("Update badge visibility:", !shouldShow ? "hidden" : "visible");
        }
        
        if (cornerBadge) {
            cornerBadge.classList.toggle('hidden', !shouldShow);
            console.log("Corner badge visibility:", !shouldShow ? "hidden" : "visible");
        }
    }
    
    updateModalContent() {
        const modal = document.getElementById('updateModal');
        if (!modal) return;
        
        // Update title based on update availability
        const headerTitle = modal.querySelector('.update-header h2');
        if (headerTitle) {
            headerTitle.textContent = this.updateAvailable ? "Update Available" : "Check for Updates";
        }
        
        // Always update version information, even if updateInfo is null
        const currentVersionEl = modal.querySelector('.current-version .version-number');
        const newVersionEl = modal.querySelector('.new-version .version-number');
        
        if (currentVersionEl) currentVersionEl.textContent = this.currentVersion;
        if (newVersionEl) newVersionEl.textContent = this.latestVersion;
        
        // Update changelog content if available
        if (this.updateInfo && this.updateInfo.changelog) {
            const changelogContent = modal.querySelector('.changelog-content');
            if (changelogContent) {
                changelogContent.innerHTML = ''; // Clear existing content
                
                // Create changelog item
                const changelogItem = document.createElement('div');
                changelogItem.className = 'changelog-item';
                
                const versionHeader = document.createElement('h4');
                versionHeader.textContent = `Version ${this.latestVersion}`;
                changelogItem.appendChild(versionHeader);
                
                // Create changelog list
                const changelogList = document.createElement('ul');
                
                if (this.updateInfo.changelog && this.updateInfo.changelog.length > 0) {
                    this.updateInfo.changelog.forEach(item => {
                        const listItem = document.createElement('li');
                        listItem.textContent = item;
                        changelogList.appendChild(listItem);
                    });
                } else {
                    // If no changelog items available
                    const listItem = document.createElement('li');
                    listItem.textContent = "No detailed changelog available. Check GitHub for more information.";
                    changelogList.appendChild(listItem);
                }
                
                changelogItem.appendChild(changelogList);
                changelogContent.appendChild(changelogItem);
            }
        }
        
        // Update GitHub link to point to the specific release if available
        const githubLink = modal.querySelector('.update-link');
        if (githubLink && this.latestVersion) {
            const versionTag = this.latestVersion.replace(/^v/, '');
            githubLink.href = `https://github.com/willmiao/ComfyUI-Lora-Manager/releases/tag/v${versionTag}`;
        }
    }
    
    toggleUpdateModal() {
        const updateModal = modalManager.getModal('updateModal');
        
        // If modal is already open, just close it
        if (updateModal && updateModal.isOpen) {
            modalManager.closeModal('updateModal');
            return;
        }
        
        // Update the modal content immediately with current data
        this.updateModalContent();
        
        // Show the modal with current data
        modalManager.showModal('updateModal');
        
        // Then check for updates in the background
        this.manualCheckForUpdates().then(() => {
            // Update the modal content again after the check completes
            this.updateModalContent();
        });
    }
    
    async manualCheckForUpdates() {
        this.lastCheckTime = 0; // Reset last check time to force check
        await this.checkForUpdates();
        // Ensure badge visibility is updated after manual check
        this.updateBadgeVisibility();
    }
}

// Create and export singleton instance
export const updateService = new UpdateService();
