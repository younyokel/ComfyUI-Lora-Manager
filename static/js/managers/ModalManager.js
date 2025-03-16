export class ModalManager {
    constructor() {
        this.modals = new Map();
        this.scrollPosition = 0;
        this.currentOpenModal = null; // Track currently open modal
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

        // Add importModal registration
        this.registerModal('importModal', {
            element: document.getElementById('importModal'),
            onClose: () => {
                this.getModal('importModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');   
            }
        });

        // Add recipeModal registration
        this.registerModal('recipeModal', {
            element: document.getElementById('recipeModal'),
            onClose: () => {
                this.getModal('recipeModal').element.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        });

        // Set up event listeners for modal toggles
        const supportToggle = document.getElementById('supportToggleBtn');
        if (supportToggle) {
            supportToggle.addEventListener('click', () => this.toggleModal('supportModal'));
        }

        document.addEventListener('keydown', this.boundHandleEscape);
        this.initialized = true;
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

    // Check if any modal is currently open
    isAnyModalOpen() {
        for (const [id, modal] of this.modals) {
            if (modal.isOpen) {
                return id;
            }
        }
        return null;
    }

    showModal(id, content = null, onCloseCallback = null) {
        const modal = this.getModal(id);
        if (!modal) return;

        // Close any open modal before showing the new one
        const openModalId = this.isAnyModalOpen();
        if (openModalId && openModalId !== id) {
            this.closeModal(openModalId);
        }

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
        this.currentOpenModal = id; // Update currently open modal
        document.body.style.top = `-${this.scrollPosition}px`;
        document.body.classList.add('modal-open');
    }

    closeModal(id) {
        const modal = this.getModal(id);
        if (!modal) return;

        modal.onClose();
        modal.isOpen = false;

        // Clear current open modal if this is the one being closed
        if (this.currentOpenModal === id) {
            this.currentOpenModal = null;
        }

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
            // Close the current open modal if it exists
            if (this.currentOpenModal) {
                this.closeModal(this.currentOpenModal);
            }
        }
    }

    toggleModal(id, content = null, onCloseCallback = null) {
        const modal = this.getModal(id);
        if (!modal) return;
        
        // If this modal is already open, close it
        if (modal.isOpen) {
            this.closeModal(id);
            return;
        }
        
        // Otherwise, show the modal
        this.showModal(id, content, onCloseCallback);
    }
}

// Create and export a singleton instance
export const modalManager = new ModalManager();