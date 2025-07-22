// Legacy LoraModal - now using shared ModelModal component
import { showModelModal } from '../shared/ModelModal.js';

// Re-export function with original name for backwards compatibility
export function showLoraModal(lora) {
    return showModelModal(lora, 'lora');
}