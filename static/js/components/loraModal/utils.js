/**
 * utils.js
 * LoraModal组件的辅助函数集合
 */
import { showToast } from '../../utils/uiHelpers.js';

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的文件大小
 */
export function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 渲染紧凑标签
 * @param {Array} tags - 标签数组
 * @returns {string} HTML内容
 */
export function renderCompactTags(tags) {
    if (!tags || tags.length === 0) return '';
    
    // Display up to 5 tags, with a tooltip indicator if there are more
    const visibleTags = tags.slice(0, 5);
    const remainingCount = Math.max(0, tags.length - 5);
    
    return `
        <div class="model-tags-container">
            <div class="model-tags-compact">
                ${visibleTags.map(tag => `<span class="model-tag-compact">${tag}</span>`).join('')}
                ${remainingCount > 0 ? 
                    `<span class="model-tag-more" data-count="${remainingCount}">+${remainingCount}</span>` : 
                    ''}
            </div>
            ${tags.length > 0 ? 
                `<div class="model-tags-tooltip">
                    <div class="tooltip-content">
                        ${tags.map(tag => `<span class="tooltip-tag">${tag}</span>`).join('')}
                    </div>
                </div>` : 
                ''}
        </div>
    `;
}

/**
 * 设置标签提示功能
 */
export function setupTagTooltip() {
    const tagsContainer = document.querySelector('.model-tags-container');
    const tooltip = document.querySelector('.model-tags-tooltip');
    
    if (tagsContainer && tooltip) {
        tagsContainer.addEventListener('mouseenter', () => {
            tooltip.classList.add('visible');
        });
        
        tagsContainer.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    }
}