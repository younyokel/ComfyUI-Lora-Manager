export class ModalManager {
    constructor() {
        this.modals = new Map();
        this.scrollPosition = 0;
        this.updateAvailable = false;
    }

    initialize() {
        if (this.initialized) return;
        
        this.boundHandleEscape = this.handleEscape.bind(this);
        
        // Register all modals
        this.registerModal('loraModal', {
            element: document.getElementById('loraModal'),
            onClose: () => {
                this.getModal('loraModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });
        
        this.registerModal('deleteModal', {
            element: document.getElementById('deleteModal'),
            onClose: () => {
                this.getModal('deleteModal').element.classList.remove('show');
                document.body.classList.remove('modal-open');
            }
        });

        // Add downloadModal registration
        this.registerModal('downloadModal', {
            element: document.getElementById('downloadModal'),
            onClose: () => {
                this.getModal('downloadModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });

        // Add settingsModal registration
        this.registerModal('settingsModal', {
            element: document.getElementById('settingsModal'),
            onClose: () => {
                this.getModal('settingsModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });

        // Add moveModal registration
        this.registerModal('moveModal', {
            element: document.getElementById('moveModal'),
            onClose: () => {
                this.getModal('moveModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });
        
        // Add supportModal registration
        this.registerModal('supportModal', {
            element: document.getElementById('supportModal'),
            onClose: () => {
                this.getModal('supportModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });

        // Add updateModal registration
        this.registerModal('updateModal', {
            element: document.getElementById('updateModal'),
            onClose: () => {
                this.getModal('updateModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });

        document.addEventListener('keydown', this.boundHandleEscape);
        this.initialized = true;
        
        // Initialize corner controls and update modal
        this.initCornerControls();
        this.initUpdateModal();
    }

    registerModal(id, config) {
        this.modals.set(id, {
            element: config.element,
            onClose: config.onClose,
            isOpen: false
        });

        // Only add click outside handler if it's the lora modal
        if (id == 'loraModal') {
            config.element.addEventListener('click', (e) => {
                if (e.target === config.element) {
                    this.closeModal(id);
                }
            });
        }
    }

    getModal(id) {
        return this.modals.get(id);
    }

    showModal(id, content = null, onCloseCallback = null) {
        const modal = this.getModal(id);
        if (!modal) return;

        if (content) {
            modal.element.innerHTML = content;
        }

        // Store callback
        if (onCloseCallback) {
            modal.onCloseCallback = onCloseCallback;
        }

        // Store current scroll position before showing modal
        this.scrollPosition = window.scrollY;

        if (id === 'deleteModal') {
            modal.element.classList.add('show');
        } else {
            modal.element.style.display = 'block';
        }

        modal.isOpen = true;
        document.body.style.top = `-${this.scrollPosition}px`;
        document.body.classList.add('modal-open');
    }

    closeModal(id) {
        const modal = this.getModal(id);
        if (!modal) return;

        modal.onClose();
        modal.isOpen = false;

        // Remove fixed positioning and restore scroll position
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        window.scrollTo(0, this.scrollPosition);

        // Execute onClose callback if exists
        if (modal.onCloseCallback) {
            modal.onCloseCallback();
            modal.onCloseCallback = null;
        }
    }

    handleEscape(e) {
        if (e.key === 'Escape') {
            // Close the last opened modal
            for (const [id, modal] of this.modals) {
                if (modal.isOpen) {
                    this.closeModal(id);
                    break;
                }
            }
        }
    }

    // Add method to initialize corner controls behavior
    initCornerControls() {
        const cornerControls = document.querySelector('.corner-controls');
        const cornerControlsToggle = document.querySelector('.corner-controls-toggle');
        
        if(cornerControls && cornerControlsToggle) {
            // Check for updates (mock implementation)
            this.checkForUpdates();
            
            // Apply the initial badge state based on localStorage
            const showUpdates = localStorage.getItem('show_update_notifications');
            if (showUpdates === 'false') {
                this.updateBadgeVisibility(false);
            }
        }
    }
    
    // Modified update checker
    checkForUpdates() {
        // First check if user has disabled update notifications
        const showUpdates = localStorage.getItem('show_update_notifications');
        
        // For demo purposes, we'll simulate an update being available
        setTimeout(() => {
            // We have an update available (mock)
            this.updateAvailable = true;
            
            // Only show badges if notifications are enabled
            const shouldShow = showUpdates !== 'false';
            this.updateBadgeVisibility(shouldShow);
        }, 2000);
    }

    // Add method to initialize update modal
    initUpdateModal() {
        const updateModal = document.getElementById('updateModal');
        if (!updateModal) return;

        const checkbox = updateModal.querySelector('#updateNotifications');
        if (!checkbox) return;
        
        // Set initial state from localStorage or default to true
        const showUpdates = localStorage.getItem('show_update_notifications');
        checkbox.checked = showUpdates === null || showUpdates === 'true';
        
        // Apply the initial badge visibility based on checkbox state
        this.updateBadgeVisibility(checkbox.checked);
        
        // Add event listener for changes
        checkbox.addEventListener('change', (e) => {
            localStorage.setItem('show_update_notifications', e.target.checked);
            
            // Immediately update badge visibility based on the new setting
            this.updateBadgeVisibility(e.target.checked);
        });
    }
    
    // Enhanced helper method to update badge visibility
    updateBadgeVisibility(show) {
        const updateToggle = document.querySelector('.update-toggle');
        const updateBadge = document.querySelector('.update-toggle .update-badge');
        const cornerBadge = document.querySelector('.corner-badge');
        
        if (updateToggle) {
            updateToggle.title = show && this.updateAvailable ? "Update Available" : "Check Updates";
        }
        
        if (updateBadge) {
            updateBadge.classList.toggle('hidden', !(show && this.updateAvailable));
        }
        
        if (cornerBadge) {
            cornerBadge.classList.toggle('hidden', !(show && this.updateAvailable));
        }
    }
}

// Create and export a singleton instance
export const modalManager = new ModalManager();