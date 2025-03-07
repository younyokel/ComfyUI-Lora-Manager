import { state } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { updateCardsForBulkMode } from '../components/LoraCard.js';

export class BulkManager {
    constructor() {
        this.bulkBtn = document.getElementById('bulkOperationsBtn');
        this.bulkPanel = document.getElementById('bulkOperationsPanel');
        
        // Initialize selected loras set in state if not already there
        if (!state.selectedLoras) {
            state.selectedLoras = new Set();
        }
    }

    initialize() {
        // Add event listeners if needed
        // (Already handled via onclick attributes in HTML, but could be moved here)
    }

    toggleBulkMode() {
        // Toggle the state
        state.bulkMode = !state.bulkMode;
        
        // Update UI
        this.bulkBtn.classList.toggle('active', state.bulkMode);
        
        // Important: Remove the hidden class when entering bulk mode
        if (state.bulkMode) {
            this.bulkPanel.classList.remove('hidden');
            // Use setTimeout to ensure the DOM updates before adding visible class
            // This helps with the transition animation
            setTimeout(() => {
                this.bulkPanel.classList.add('visible');
            }, 10);
        } else {
            this.bulkPanel.classList.remove('visible');
            // Add hidden class back after transition completes
            setTimeout(() => {
                this.bulkPanel.classList.add('hidden');
            }, 400); // Match this with the transition duration in CSS
        }
        
        // Update all cards
        updateCardsForBulkMode(state.bulkMode);
        
        // Clear selection if exiting bulk mode
        if (!state.bulkMode) {
            this.clearSelection();
        }
    }

    clearSelection() {
        document.querySelectorAll('.lora-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        state.selectedLoras.clear();
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const countElement = document.getElementById('selectedCount');
        
        if (countElement) {
            countElement.textContent = `${state.selectedLoras.size} selected`;
        }
    }

    toggleCardSelection(card) {
        const filepath = card.dataset.filepath;
        
        if (card.classList.contains('selected')) {
            card.classList.remove('selected');
            state.selectedLoras.delete(filepath);
        } else {
            card.classList.add('selected');
            state.selectedLoras.add(filepath);
        }
        
        this.updateSelectedCount();
    }

    // Apply selection state to cards after they are refreshed
    applySelectionState() {
        if (!state.bulkMode) return;
        
        document.querySelectorAll('.lora-card').forEach(card => {
            const filepath = card.dataset.filepath;
            if (state.selectedLoras.has(filepath)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        
        this.updateSelectedCount();
    }

    async copyAllLorasSyntax() {
        if (state.selectedLoras.size === 0) {
            showToast('No LoRAs selected', 'warning');
            return;
        }
        
        const loraSyntaxes = [];
        document.querySelectorAll('.lora-card').forEach(card => {
            if (state.selectedLoras.has(card.dataset.filepath)) {
                const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
                const strength = usageTips.strength || 1;
                loraSyntaxes.push(`<lora:${card.dataset.file_name}:${strength}>`);
            }
        });
        
        try {
            await navigator.clipboard.writeText(loraSyntaxes.join(', '));
            showToast(`Copied ${state.selectedLoras.size} LoRA syntaxes to clipboard`, 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Copy failed', 'error');
        }
    }
}

// Create a singleton instance
export const bulkManager = new BulkManager(); 