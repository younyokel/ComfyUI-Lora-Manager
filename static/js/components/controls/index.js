// Controls components index file
import { PageControls } from './PageControls.js';
import { LorasControls } from './LorasControls.js';
import { CheckpointsControls } from './CheckpointsControls.js';
import { refreshVirtualScroll } from '../../utils/infiniteScroll.js';

// Export the classes
export { PageControls, LorasControls, CheckpointsControls };

/**
 * Factory function to create the appropriate controls based on page type
 * @param {string} pageType - The type of page ('loras' or 'checkpoints')
 * @returns {PageControls} - The appropriate controls instance
 */
export function createPageControls(pageType) {
    if (pageType === 'loras') {
        return new LorasControls();
    } else if (pageType === 'checkpoints') {
        return new CheckpointsControls();
    } else {
        console.error(`Unknown page type: ${pageType}`);
        return null;
    }
}

// Example for a filter method:
function applyFilter(filterType, value) {
    // ...existing filter logic...
    
    // After filters are applied, refresh the virtual scroll if it exists
    if (state.virtualScroller) {
        refreshVirtualScroll();
    } else {
        // Fall back to existing reset and reload logic
        resetAndReload(true);
    }
}