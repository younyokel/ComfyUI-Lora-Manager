import { state } from '../state/index.js';
import { loadMoreLoras } from '../api/loraApi.js';
import { debounce } from './debounce.js';

export function initializeInfiniteScroll(pageType = 'loras') {
    if (state.observer) {
        state.observer.disconnect();
    }

    // Determine the load more function and grid ID based on page type
    let loadMoreFunction;
    let gridId;
    
    switch (pageType) {
        case 'recipes':
            loadMoreFunction = window.recipeManager?.loadMoreRecipes || (() => console.warn('loadMoreRecipes not found'));
            gridId = 'recipeGrid';
            break;
        case 'checkpoints':
            loadMoreFunction = window.checkpointManager?.loadMoreCheckpoints || (() => console.warn('loadMoreCheckpoints not found'));
            gridId = 'checkpointGrid';
            break;
        case 'loras':
        default:
            loadMoreFunction = loadMoreLoras;
            gridId = 'loraGrid';
            break;
    }

    const debouncedLoadMore = debounce(loadMoreFunction, 200);

    state.observer = new IntersectionObserver(
        (entries) => {
            const target = entries[0];
            if (target.isIntersecting && !state.isLoading && state.hasMore) {
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
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '10px';
        grid.appendChild(sentinel);
        state.observer.observe(sentinel);
    }
} 