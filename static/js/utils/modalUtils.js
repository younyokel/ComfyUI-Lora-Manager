import { modalManager } from '../managers/ModalManager.js';

let pendingDeletePath = null;
let pendingModelType = null;

export function showDeleteModal(filePath, modelType = 'lora') {
    // event.stopPropagation();
    pendingDeletePath = filePath;
    pendingModelType = modelType;
    
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
    
    const card = document.querySelector(`.lora-card[data-filepath="${pendingDeletePath}"]`);
    
    try {
        // Use the appropriate endpoint based on model type
        const endpoint = pendingModelType === 'checkpoint' ? 
            '/api/checkpoints/delete' : 
            '/api/delete_model';
        
        const response = await fetch(endpoint, {
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
    pendingDeletePath = null;
    pendingModelType = null;
}