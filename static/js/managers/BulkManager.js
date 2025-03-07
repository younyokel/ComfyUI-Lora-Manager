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
        
        // Cache for lora metadata to handle non-visible selected loras
        if (!state.loraMetadataCache) {
            state.loraMetadataCache = new Map();
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
            
            // Cache the metadata for this lora
            state.loraMetadataCache.set(filepath, {
                fileName: card.dataset.file_name,
                usageTips: card.dataset.usage_tips
            });
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
                
                // Update the cache with latest data
                state.loraMetadataCache.set(filepath, {
                    fileName: card.dataset.file_name,
                    usageTips: card.dataset.usage_tips
                });
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
        const missingLoras = [];
        
        // Process all selected loras using our metadata cache
        for (const filepath of state.selectedLoras) {
            const metadata = state.loraMetadataCache.get(filepath);
            
            if (metadata) {
                const usageTips = JSON.parse(metadata.usageTips || '{}');
                const strength = usageTips.strength || 1;
                loraSyntaxes.push(`<lora:${metadata.fileName}:${strength}>`);
            } else {
                // If we don't have metadata, this is an error case
                missingLoras.push(filepath);
            }
        }
        
        // Handle any loras with missing metadata
        if (missingLoras.length > 0) {
            console.warn('Missing metadata for some selected loras:', missingLoras);
            showToast(`Missing data for ${missingLoras.length} LoRAs`, 'warning');
        }
        
        if (loraSyntaxes.length === 0) {
            showToast('No valid LoRAs to copy', 'error');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(loraSyntaxes.join(', '));
            showToast(`Copied ${loraSyntaxes.length} LoRA syntaxes to clipboard`, 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Copy failed', 'error');
        }
    }
}

// Create a singleton instance
export const bulkManager = new BulkManager(); 