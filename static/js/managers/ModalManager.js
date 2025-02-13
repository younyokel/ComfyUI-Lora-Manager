export class ModalManager {
    constructor() {
        this.modals = new Map();
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

        document.addEventListener('keydown', this.boundHandleEscape);
        this.initialized = true;
    }

    registerModal(id, config) {
        this.modals.set(id, {
            element: config.element,
            onClose: config.onClose,
            isOpen: false
        });

        // Add click outside to close for each modal
        config.element.addEventListener('click', (e) => {
            if (e.target === config.element) {
                this.closeModal(id);
            }
        });
    }

    getModal(id) {
        return this.modals.get(id);
    }

    showModal(id, content = null) {
        const modal = this.getModal(id);
        if (!modal) return;

        if (content) {
            modal.element.innerHTML = content;
        }

        // Update to handle different modal types
        if (id === 'deleteModal') {
            modal.element.classList.add('show');
        } else {
            // For loraModal and downloadModal
            modal.element.style.display = 'block';
        }

        modal.isOpen = true;
        document.body.classList.add('modal-open');
    }

    closeModal(id) {
        const modal = this.getModal(id);
        if (!modal) return;

        modal.onClose();
        modal.isOpen = false;
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
}

// Create and export a singleton instance
export const modalManager = new ModalManager();