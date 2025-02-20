import { refreshSingleLoraMetadata } from '../api/loraApi.js';

export class LoraContextMenu {
    constructor() {
        this.menu = document.getElementById('loraContextMenu');
        this.currentCard = null;
        this.init();
    }

    init() {
        document.addEventListener('click', () => this.hideMenu());
        document.addEventListener('contextmenu', (e) => {
            const card = e.target.closest('.lora-card');
            if (!card) {
                this.hideMenu();
                return;
            }
            e.preventDefault();
            this.showMenu(e.clientX, e.clientY, card);
        });

        this.menu.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.context-menu-item');
            if (!menuItem || !this.currentCard) return;

            const action = menuItem.dataset.action;
            if (!action) return;
            
            switch(action) {
                case 'detail':
                    // Trigger the main card click which shows the modal
                    this.currentCard.click();
                    break;
                case 'civitai':
                    // Only trigger if the card is from civitai
                    if (this.currentCard.dataset.from_civitai === 'true') {
                        if (this.currentCard.dataset.meta === '{}') {
                            showToast('Please fetch metadata from CivitAI first', 'info');
                        } else {
                            this.currentCard.querySelector('.fa-globe')?.click();
                        }
                    } else {
                        showToast('No CivitAI information available', 'info');
                    }
                    break;
                case 'copyname':
                    this.currentCard.querySelector('.fa-copy')?.click();
                    break;
                case 'preview':
                    this.currentCard.querySelector('.fa-image')?.click();
                    break;
                case 'delete':
                    this.currentCard.querySelector('.fa-trash')?.click();
                    break;
                case 'move':
                    moveManager.showMoveModal(this.currentCard.dataset.filepath);
                    break;
                case 'refresh-metadata':
                    refreshSingleLoraMetadata(this.currentCard.dataset.filepath);
                    break;
                case 'copy-to-stack':
                    this.copyToLoraStack();
                    break;
            }
            
            this.hideMenu();
        });
    }

    showMenu(x, y, card) {
        this.currentCard = card;
        this.menu.style.display = 'block';

        // 获取菜单尺寸
        const menuRect = this.menu.getBoundingClientRect();
        
        // 获取视口尺寸
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        
        // 计算最终位置 - 使用 clientX/Y，不需要考虑滚动偏移
        let finalX = x;
        let finalY = y;
        
        // 确保菜单不会超出右侧边界
        if (x + menuRect.width > viewportWidth) {
            finalX = x - menuRect.width;
        }
        
        // 确保菜单不会超出底部边界
        if (y + menuRect.height > viewportHeight) {
            finalY = y - menuRect.height;
        }
        
        // 直接设置位置，因为 position: fixed 是相对于视口定位的
        this.menu.style.left = `${finalX}px`;
        this.menu.style.top = `${finalY}px`;
    }

    hideMenu() {
        this.menu.style.display = 'none';
        this.currentCard = null;
    }

    copyToLoraStack() {
        if (!this.currentCard) return;

        const loraStackNode = {
            "id": crypto.randomUUID(),
            "type": "LoRAStack",
            "inputs": {
                "enabled": true,
                "lora_name": this.currentCard.dataset.filepath,
                "model_strength": 1.0,  
            },
            "class_type": "LoRAStack",
            "_meta": {
                "title": `LoRA Stack (${this.currentCard.dataset.file_name})`,
            }
        };

        // Convert to ComfyUI workflow format
        const workflow = {
            "last_node_id": 1,
            "last_link_id": 0,
            "nodes": [loraStackNode],
            "links": [],
        };

        // Copy to clipboard
        navigator.clipboard.writeText(JSON.stringify(workflow))
            .then(() => {
                showToast('LoRA Stack copied to clipboard', 'success');
            })
            .catch(err => {
                console.error('Failed to copy:', err);
                showToast('Failed to copy LoRA Stack', 'error');
            });
    }
}