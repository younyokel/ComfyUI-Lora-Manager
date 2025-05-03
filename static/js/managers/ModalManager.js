export class ModalManager {
    constructor() {
        this.modals = new Map();
        this.scrollPosition = 0;
        this.currentOpenModal = null; // Track currently open modal
    }

    initialize() {
        if (this.initialized) return;
        
        this.boundHandleEscape = this.handleEscape.bind(this);
        
        // Register all modals - only if they exist in the current page
        const loraModal = document.getElementById('loraModal');
        if (loraModal) {
            this.registerModal('loraModal', {
                element: loraModal,
                onClose: () => {
                    this.getModal('loraModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                },
                closeOnOutsideClick: true
            });
        }
        
        // Add checkpointModal registration
        const checkpointModal = document.getElementById('checkpointModal');
        if (checkpointModal) {
            this.registerModal('checkpointModal', {
                element: checkpointModal,
                onClose: () => {
                    this.getModal('checkpointModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                },
                closeOnOutsideClick: true
            });
        }

        // Add checkpointDownloadModal registration
        const checkpointDownloadModal = document.getElementById('checkpointDownloadModal');
        if (checkpointDownloadModal) {
            this.registerModal('checkpointDownloadModal', {
                element: checkpointDownloadModal,
                onClose: () => {
                    this.getModal('checkpointDownloadModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                },
                closeOnOutsideClick: true
            });
        }
        
        const deleteModal = document.getElementById('deleteModal');
        if (deleteModal) {
            this.registerModal('deleteModal', {
                element: deleteModal,
                onClose: () => {
                    this.getModal('deleteModal').element.classList.remove('show');
                    document.body.classList.remove('modal-open');
                }
            });
        }
        
        // Add excludeModal registration
        const excludeModal = document.getElementById('excludeModal');
        if (excludeModal) {
            this.registerModal('excludeModal', {
                element: excludeModal,
                onClose: () => {
                    this.getModal('excludeModal').element.classList.remove('show');
                    document.body.classList.remove('modal-open');
                },
                closeOnOutsideClick: true
            });
        }

        // Add downloadModal registration
        const downloadModal = document.getElementById('downloadModal');
        if (downloadModal) {
            this.registerModal('downloadModal', {
                element: downloadModal,
                onClose: () => {
                    this.getModal('downloadModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                }
            });
        }

        // Add settingsModal registration
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            this.registerModal('settingsModal', {
                element: settingsModal,
                onClose: () => {
                    this.getModal('settingsModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                }
            });
        }

        // Add moveModal registration
        const moveModal = document.getElementById('moveModal');
        if (moveModal) {
            this.registerModal('moveModal', {
                element: moveModal,
                onClose: () => {
                    this.getModal('moveModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                }
            });
        }
        
        // Add supportModal registration
        const supportModal = document.getElementById('supportModal');
        if (supportModal) {
            this.registerModal('supportModal', {
                element: supportModal,
                onClose: () => {
                    this.getModal('supportModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                }
            });
        }

        // Add updateModal registration
        const updateModal = document.getElementById('updateModal');
        if (updateModal) {
            this.registerModal('updateModal', {
                element: updateModal,
                onClose: () => {
                    this.getModal('updateModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                }
            });
        }

        // Add importModal registration
        const importModal = document.getElementById('importModal');
        if (importModal) {
            this.registerModal('importModal', {
                element: importModal,
                onClose: () => {
                    this.getModal('importModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');   
                }
            });
        }

        // Add recipeModal registration
        const recipeModal = document.getElementById('recipeModal');
        if (recipeModal) {
            this.registerModal('recipeModal', {
                element: recipeModal,
                onClose: () => {
                    this.getModal('recipeModal').element.style.display = 'none';
                    document.body.classList.remove('modal-open');
                },
                closeOnOutsideClick: true
            });
        }

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

        // Add click outside handler if specified in config
        if (config.closeOnOutsideClick) {
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

        if (id === 'deleteModal' || id === 'excludeModal') {
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