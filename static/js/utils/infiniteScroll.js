import { state, getCurrentPageState } from '../state/index.js';
import { loadMoreLoras } from '../api/loraApi.js';
import { loadMoreCheckpoints } from '../api/checkpointApi.js';
import { debounce } from './debounce.js';

export function initializeInfiniteScroll(pageType = 'loras') {
    if (state.observer) {
        state.observer.disconnect();
    }

    // Set the current page type
    state.currentPageType = pageType;
    
    // Get the current page state
    const pageState = getCurrentPageState();

    // Determine the load more function and grid ID based on page type
    let loadMoreFunction;
    let gridId;
    
    switch (pageType) {
        case 'recipes':
            loadMoreFunction = () => {
                if (!pageState.isLoading && pageState.hasMore) {
                    window.recipeManager.loadRecipes(false); // false to not reset pagination
                }
            };
            gridId = 'recipeGrid';
            break;
        case 'checkpoints':
            loadMoreFunction = () => {
                if (!pageState.isLoading && pageState.hasMore) {
                    loadMoreCheckpoints(false); // false to not reset
                }
            };
            gridId = 'checkpointGrid';
            break;
        case 'loras':
        default:
            loadMoreFunction = () => {
                if (!pageState.isLoading && pageState.hasMore) {
                    loadMoreLoras(false); // false to not reset
                }
            };
            gridId = 'loraGrid';
            break;
    }

    const debouncedLoadMore = debounce(loadMoreFunction, 100);

    state.observer = new IntersectionObserver(
        (entries) => {
            const target = entries[0];
            if (target.isIntersecting && !pageState.isLoading && pageState.hasMore) {
                debouncedLoadMore();
            }
        },
        { threshold: 0.1 }
    );

    const grid = document.getElementById(gridId);
    if (!grid) {
        console.warn(`Grid with ID "${gridId}" not found for infinite scroll`);
        return;
    }

    const existingSentinel = document.getElementById('scroll-sentinel');
    if (existingSentinel) {
        state.observer.observe(existingSentinel);
    } else {
        // Create a wrapper div that will be placed after the grid
        const sentinelWrapper = document.createElement('div');
        sentinelWrapper.style.width = '100%';
        sentinelWrapper.style.height = '10px';
        sentinelWrapper.style.margin = '0';
        sentinelWrapper.style.padding = '0';
        
        // Create the actual sentinel element
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '10px';
        
        // Add the sentinel to the wrapper
        sentinelWrapper.appendChild(sentinel);
        
        // Insert the wrapper after the grid instead of inside it
        grid.parentNode.insertBefore(sentinelWrapper, grid.nextSibling);
        
        state.observer.observe(sentinel);
    }
}