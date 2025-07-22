/**
 * CheckpointModal - Main entry point
 * 
 * Legacy CheckpointModal - now using shared ModelModal component
 */
import { showModelModal } from '../shared/ModelModal.js';

// Re-export function with original name for backwards compatibility
export function showCheckpointModal(checkpoint) {
    return showModelModal(checkpoint, 'checkpoint');
}