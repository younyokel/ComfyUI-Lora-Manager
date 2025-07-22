// Legacy LoraCard.js - now using shared ModelCard component
import { 
    createModelCard, 
    setupModelCardEventDelegation, 
    updateCardsForBulkMode 
} from './shared/ModelCard.js';

// Re-export functions with original names for backwards compatibility
export function createLoraCard(lora) {
    return createModelCard(lora, 'lora');
}

export function setupLoraCardEventDelegation() {
    setupModelCardEventDelegation('lora');
}

export { updateCardsForBulkMode };