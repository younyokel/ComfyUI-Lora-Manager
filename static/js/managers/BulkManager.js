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
        const selectedCards = document.querySelectorAll('.lora-card.selected');
        const countElement = document.getElementById('selectedCount');
        
        if (countElement) {
            countElement.textContent = `${selectedCards.length} selected`;
        }
        
        // Update state with selected loras
        state.selectedLoras.clear();
        selectedCards.forEach(card => {
            state.selectedLoras.add(card.dataset.filepath);
        });
    }

    toggleCardSelection(card) {
        card.classList.toggle('selected');
        this.updateSelectedCount();
    }

    async copyAllLorasSyntax() {
        const selectedCards = document.querySelectorAll('.lora-card.selected');
        if (selectedCards.length === 0) {
            showToast('No LoRAs selected', 'warning');
            return;
        }
        
        const loraSyntaxes = [];
        selectedCards.forEach(card => {
            const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
            const strength = usageTips.strength || 1;
            loraSyntaxes.push(`<lora:${card.dataset.file_name}:${strength}>`);
        });
        
        try {
            await navigator.clipboard.writeText(loraSyntaxes.join(', '));
            showToast(`Copied ${selectedCards.length} LoRA syntaxes to clipboard`, 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Copy failed', 'error');
        }
    }
}

// Create a singleton instance
export const bulkManager = new BulkManager(); 