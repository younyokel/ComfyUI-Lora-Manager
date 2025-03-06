import { modalManager } from './ModalManager.js';

export class UpdateService {
    constructor() {
        this.updateCheckInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.currentVersion = "v0.0.0";  // Initialize with default values
        this.latestVersion = "v0.0.0";   // Initialize with default values
        this.updateInfo = null;
        this.updateAvailable = false;
        this.updateNotificationsEnabled = localStorage.getItem('show_update_notifications') !== 'false';
        this.lastCheckTime = parseInt(localStorage.getItem('last_update_check') || '0');
    }

    initialize() {
        // Initialize update preferences from localStorage
        const showUpdates = localStorage.getItem('show_update_notifications');
        this.updateNotificationsEnabled = showUpdates === null || showUpdates === 'true';
        
        // Register event listener for update notification toggle
        const updateCheckbox = document.getElementById('updateNotifications');
        if (updateCheckbox) {
            updateCheckbox.checked = this.updateNotificationsEnabled;
            updateCheckbox.addEventListener('change', (e) => {
                this.updateNotificationsEnabled = e.target.checked;
                localStorage.setItem('show_update_notifications', e.target.checked);
                this.updateBadgeVisibility();
            });
        }
        
        // Perform update check if needed
        this.checkForUpdates();
        
        // Set up event listener for update button
        const updateToggle = document.querySelector('.update-toggle');
        if (updateToggle) {
            updateToggle.addEventListener('click', () => this.showUpdateModal());
        }

        // Immediately update modal content with current values (even if from default)
        this.updateModalContent();
    }
    
    async checkForUpdates() {
        // Check if we should perform an update check
        const now = Date.now();
        if (now - this.lastCheckTime < this.updateCheckInterval) {
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
                
                // Determine if update is available
                this.updateAvailable = data.update_available;
                
                // Update last check time
                this.lastCheckTime = now;
                localStorage.setItem('last_update_check', now.toString());
                
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
    
    updateBadgeVisibility() {
        const updateToggle = document.querySelector('.update-toggle');
        const updateBadge = document.querySelector('.update-toggle .update-badge');
        const cornerBadge = document.querySelector('.corner-badge');
        
        if (updateToggle) {
            updateToggle.title = this.updateNotificationsEnabled && this.updateAvailable 
                ? "Update Available" 
                : "Check Updates";
        }
        
        if (updateBadge) {
            const shouldShow = this.updateNotificationsEnabled && this.updateAvailable;
            updateBadge.classList.toggle('hidden', !shouldShow);
        }
        
        if (cornerBadge) {
            const shouldShow = this.updateNotificationsEnabled && this.updateAvailable;
            cornerBadge.classList.toggle('hidden', !shouldShow);
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
    
    showUpdateModal() {
        // Force a check for updates when showing the modal
        this.manualCheckForUpdates().then(() => {
            // Show the modal after update check completes
            modalManager.showModal('updateModal');
        });
    }
    
    async manualCheckForUpdates() {
        this.lastCheckTime = 0; // Reset last check time to force check
        await this.checkForUpdates();
    }
}

// Create and export singleton instance
export const updateService = new UpdateService();
