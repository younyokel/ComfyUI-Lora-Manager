// Legacy CheckpointCard.js - now using shared ModelCard component
import { 
    createModelCard, 
    setupModelCardEventDelegation 
} from './shared/ModelCard.js';

// Re-export functions with original names for backwards compatibility
export function createCheckpointCard(checkpoint) {
    return createModelCard(checkpoint, 'checkpoint');
}

export function setupCheckpointCardEventDelegation() {
    setupModelCardEventDelegation('checkpoint');
}