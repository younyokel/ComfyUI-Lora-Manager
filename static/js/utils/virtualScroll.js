import { state, getCurrentPageState } from '../state/index.js';
import { loadMoreLoras } from '../api/loraApi.js';
import { loadMoreCheckpoints } from '../api/checkpointApi.js';
import { debounce } from './debounce.js';
import { createLoraCard } from '../components/LoraCard.js';

export function initializeVirtualScroll(pageType = 'loras') {
    // Clean up any existing observer or handler
    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }
    if (state.scrollHandler) {
        window.removeEventListener('scroll', state.scrollHandler);
        state.scrollHandler = null;
    }
    if (state.scrollCheckInterval) {
        clearInterval(state.scrollCheckInterval);
        state.scrollCheckInterval = null;
    }

    // Set the current page type
    state.currentPageType = pageType;
    
    // Get the current page state
    const pageState = getCurrentPageState();
    
    // Skip initializing if in duplicates mode (for recipes page)
    if (pageType === 'recipes' && pageState.duplicatesMode) {
        return;
    }

    // Determine the grid element and fetch function based on page type
    let gridId;
    let fetchMoreItems;
    let createCardFunction;
    
    switch (pageType) {
        case 'recipes':
            fetchMoreItems = async () => {
                if (!pageState.isLoading && pageState.hasMore) {
                    await window.recipeManager.loadRecipes(false);
                    return pageState.items;
                }
                return [];
            };
            gridId = 'recipeGrid';
            createCardFunction = window.recipeManager?.createRecipeCard;
            break;
        case 'checkpoints':
            fetchMoreItems = async () => {
                if (!pageState.isLoading && pageState.hasMore) {
                    await loadMoreCheckpoints(false);
                    return pageState.items;
                }
                return [];
            };
            gridId = 'checkpointGrid';
            createCardFunction = window.createCheckpointCard;
            break;
        case 'loras':
        default:
            fetchMoreItems = async () => {
                if (!pageState.isLoading && pageState.hasMore) {
                    await loadMoreLoras(false);
                    return pageState.items;
                }
                return [];
            };
            gridId = 'loraGrid';
            createCardFunction = createLoraCard;
            break;
    }

    // Get the grid container
    const gridContainer = document.getElementById(gridId);
    if (!gridContainer) {
        console.warn(`Grid with ID "${gridId}" not found for virtual scroll`);
        return;
    }
    
    // Get the scrollable container
    const scrollContainer = document.querySelector('.page-content');
    if (!scrollContainer) {
        console.warn('Scrollable container not found for virtual scroll');
        return;
    }
    
    // Initialize the virtual scroll state
    const virtualScroll = {
        itemHeight: 350, // Starting estimate for card height
        bufferSize: 10,  // Extra items to render above/below viewport
        visibleItems: new Map(), // Track rendered items by file_path
        allItems: pageState.items || [], // All data items that have been loaded
        containerHeight: 0, // Will be updated to show proper scrollbar
        containerElement: document.createElement('div'), // Virtual container
        gridElement: gridContainer,
        itemMeasurements: new Map(), // Map of measured item heights
        isUpdating: false
    };
    
    // Create a container for the virtualized content with proper height
    virtualScroll.containerElement.className = 'virtual-scroll-container';
    virtualScroll.containerElement.style.position = 'relative';
    virtualScroll.containerElement.style.width = '100%';
    virtualScroll.containerElement.style.height = '0px'; // Will be updated
    
    gridContainer.innerHTML = ''; // Clear existing content
    gridContainer.appendChild(virtualScroll.containerElement);
    
    // Store the virtual scroll state in the global state
    state.virtualScroll = virtualScroll;
    
    // Function to measure a rendered card's height
    function measureCardHeight(card) {
        if (!card) return virtualScroll.itemHeight;
        const height = card.offsetHeight;
        return height > 0 ? height : virtualScroll.itemHeight;
    }
    
    // Calculate estimated total height for proper scrollbar
    function updateContainerHeight() {
        if (virtualScroll.allItems.length === 0) return;
        
        // If we've measured some items, use average height
        let totalMeasuredHeight = 0;
        let measuredCount = 0;
        
        virtualScroll.itemMeasurements.forEach(height => {
            totalMeasuredHeight += height;
            measuredCount++;
        });
        
        const avgHeight = measuredCount > 0 
            ? totalMeasuredHeight / measuredCount 
            : virtualScroll.itemHeight;
        
        virtualScroll.itemHeight = avgHeight;
        virtualScroll.containerHeight = virtualScroll.allItems.length * avgHeight;
        virtualScroll.containerElement.style.height = `${virtualScroll.containerHeight}px`;
    }
    
    // Function to get visible range of items
    function getVisibleRange() {
        const scrollTop = scrollContainer.scrollTop;
        const viewportHeight = scrollContainer.clientHeight;
        
        // Calculate visible range with buffer
        const startIndex = Math.max(0, Math.floor(scrollTop / virtualScroll.itemHeight) - virtualScroll.bufferSize);
        const endIndex = Math.min(
            virtualScroll.allItems.length - 1, 
            Math.ceil((scrollTop + viewportHeight) / virtualScroll.itemHeight) + virtualScroll.bufferSize
        );
        
        return { startIndex, endIndex };
    }
    
    // Update visible items based on scroll position
    async function updateVisibleItems() {
        if (virtualScroll.isUpdating) return;
        virtualScroll.isUpdating = true;
        
        // Get current visible range
        const { startIndex, endIndex } = getVisibleRange();
        
        // Set of items that should be visible
        const shouldBeVisible = new Set();
        
        // Track total height for accurate positioning
        let currentOffset = 0;
        let needHeightUpdate = false;
        
        // Create or update visible items
        for (let i = 0; i < virtualScroll.allItems.length; i++) {
            const item = virtualScroll.allItems[i];
            if (!item || !item.file_path) continue;
            
            const itemId = item.file_path;
            const knownHeight = virtualScroll.itemMeasurements.get(itemId) || virtualScroll.itemHeight;
            
            // Update position based on known measurements
            if (i > 0) {
                currentOffset += knownHeight;
            }
            
            // Only create/position items in the visible range
            if (i >= startIndex && i <= endIndex) {
                shouldBeVisible.add(itemId);
                
                // Create item if it doesn't exist
                if (!virtualScroll.visibleItems.has(itemId)) {
                    const card = createCardFunction(item);
                    card.style.position = 'absolute';
                    card.style.top = `${currentOffset}px`;
                    card.style.left = '0';
                    card.style.right = '0';
                    card.style.width = '100%';
                    
                    virtualScroll.containerElement.appendChild(card);
                    virtualScroll.visibleItems.set(itemId, card);
                    
                    // Measure actual height after rendering
                    setTimeout(() => {
                        const actualHeight = measureCardHeight(card);
                        if (actualHeight !== knownHeight) {
                            virtualScroll.itemMeasurements.set(itemId, actualHeight);
                            needHeightUpdate = true;
                            window.requestAnimationFrame(updateVisibleItems);
                        }
                    }, 0);
                } else {
                    // Update position of existing item
                    const card = virtualScroll.visibleItems.get(itemId);
                    card.style.top = `${currentOffset}px`;
                }
            }
        }
        
        // Remove items that shouldn't be visible anymore
        for (const [itemId, element] of virtualScroll.visibleItems.entries()) {
            if (!shouldBeVisible.has(itemId)) {
                // Clean up resources like videos
                const video = element.querySelector('video');
                if (video) {
                    video.pause();
                    video.src = '';
                    video.load();
                }
                
                element.remove();
                virtualScroll.visibleItems.delete(itemId);
            }
        }
        
        // Update container height if needed
        if (needHeightUpdate) {
            updateContainerHeight();
        }
        
        // Check if we're near the end and need to load more
        if (endIndex >= virtualScroll.allItems.length - 15 && !pageState.isLoading && pageState.hasMore) {
            fetchMoreItems().then(newItems => {
                virtualScroll.allItems = pageState.items || [];
                updateContainerHeight();
                updateVisibleItems();
            });
        }
        
        virtualScroll.isUpdating = false;
    }
    
    // Debounced scroll handler
    const handleScroll = debounce(() => {
        requestAnimationFrame(updateVisibleItems);
    }, 50);
    
    // Set up event listeners
    scrollContainer.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', debounce(() => {
        updateVisibleItems();
    }, 100));
    
    // Store the handler for cleanup
    state.scrollHandler = handleScroll;
    
    // Initial update
    updateContainerHeight();
    updateVisibleItems();
    
    // Run periodic updates to catch any rendering issues
    state.scrollCheckInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            updateVisibleItems();
        }
    }, 2000);
    
    return virtualScroll;
}

// Helper to clean up virtual scroll resources
export function cleanupVirtualScroll() {
    if (!state.virtualScroll) return;
    
    // Clean up visible items
    state.virtualScroll.visibleItems.forEach((element) => {
        const video = element.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
            video.load();
        }
        element.remove();
    });
    
    state.virtualScroll.visibleItems.clear();
    state.virtualScroll.containerElement.innerHTML = '';
    
    // Remove scroll handler
    if (state.scrollHandler) {
        document.querySelector('.page-content').removeEventListener('scroll', state.scrollHandler);
        state.scrollHandler = null;
    }
    
    // Clear interval
    if (state.scrollCheckInterval) {
        clearInterval(state.scrollCheckInterval);
        state.scrollCheckInterval = null;
    }
    
    // Clear the state
    state.virtualScroll = null;
}
