import { modalManager } from '../managers/ModalManager.js';

let pendingDeletePath = null;

export function showDeleteModal(filePath) {
    event.stopPropagation();
    pendingDeletePath = filePath;
    
    const card = document.querySelector(`.lora-card[data-filepath="${filePath}"]`);
    const modelName = card.dataset.name;
    const modal = modalManager.getModal('deleteModal').element;
    const modelInfo = modal.querySelector('.delete-model-info');
    
    modelInfo.innerHTML = `
        <strong>Model:</strong> ${modelName}
        <br>
        <strong>File:</strong> ${filePath}
    `;
    
    modalManager.showModal('deleteModal');
}

export async function confirmDelete() {
    if (!pendingDeletePath) return;
    
    const modal = document.getElementById('deleteModal');
    const card = document.querySelector(`.lora-card[data-filepath="${pendingDeletePath}"]`);
    
    try {
        const response = await fetch('/api/delete_model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                file_path: pendingDeletePath
            })
        });

        if (response.ok) {
            if (card) {
                card.remove();
            }
            closeDeleteModal();
        } else {
            const error = await response.text();
            alert(`Failed to delete model: ${error}`);
        }
    } catch (error) {
        alert(`Error deleting model: ${error}`);
    }
}

export function closeDeleteModal() {
    modalManager.closeModal('deleteModal');
} 