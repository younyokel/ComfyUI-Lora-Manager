export class ModalManager {
    constructor() {
        this.modals = new Map();
        this.scrollPosition = 0;
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
        
        // Initialize corner controls
        this.initCornerControls();
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

    // Keep only the corner controls initialization
    initCornerControls() {
        const cornerControls = document.querySelector('.corner-controls');
        const cornerControlsToggle = document.querySelector('.corner-controls-toggle');
        
        if(cornerControls && cornerControlsToggle) {
            // Toggle corner controls visibility
            cornerControlsToggle.addEventListener('click', () => {
                cornerControls.classList.toggle('expanded');
            });
        }
    }
}

// Create and export a singleton instance
export const modalManager = new ModalManager();