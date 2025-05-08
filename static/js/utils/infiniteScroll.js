import { state, getCurrentPageState } from '../state/index.js';
import { loadMoreLoras } from '../api/loraApi.js';
import { loadMoreCheckpoints } from '../api/checkpointApi.js';
import { debounce } from './debounce.js';

export function initializeInfiniteScroll(pageType = 'loras') {
    // Clean up any existing observer
    if (state.observer) {
        state.observer.disconnect();
    }

    // Set the current page type
    state.currentPageType = pageType;
    
    // Get the current page state
    const pageState = getCurrentPageState();
    
    // Skip initializing if in duplicates mode (for recipes page)
    if (pageType === 'recipes' && pageState.duplicatesMode) {
        return;
    }

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
    
    const grid = document.getElementById(gridId);
    if (!grid) {
        console.warn(`Grid with ID "${gridId}" not found for infinite scroll`);
        return;
    }
    
    // Remove any existing sentinel
    const existingSentinel = document.getElementById('scroll-sentinel');
    if (existingSentinel) {
        existingSentinel.remove();
    }
    
    // Create a sentinel element after the grid (not inside it)
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.width = '100%';
    sentinel.style.height = '20px';
    sentinel.style.visibility = 'hidden'; // Make it invisible but still affect layout
    
    // Insert after grid instead of inside
    grid.parentNode.insertBefore(sentinel, grid.nextSibling);
    
    // Create observer with appropriate settings, slightly different for checkpoints page
    const observerOptions = {
        threshold: 0.1,
        rootMargin: pageType === 'checkpoints' ? '0px 0px 200px 0px' : '0px 0px 100px 0px'
    };
    
    // Initialize the observer
    state.observer = new IntersectionObserver((entries) => {
        const target = entries[0];
        if (target.isIntersecting && !pageState.isLoading && pageState.hasMore) {
            debouncedLoadMore();
        }
    }, observerOptions);
    
    // Start observing
    state.observer.observe(sentinel);
    
    // Clean up any existing scroll event listener
    if (state.scrollHandler) {
        window.removeEventListener('scroll', state.scrollHandler);
        state.scrollHandler = null;
    }
    
    // Add a simple backup scroll handler
    const handleScroll = debounce(() => {
        if (pageState.isLoading || !pageState.hasMore) return;
        
        const sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) return;
        
        const rect = sentinel.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        
        if (rect.top < windowHeight + 200) {
            debouncedLoadMore();
        }
    }, 200);
    
    state.scrollHandler = handleScroll;
    window.addEventListener('scroll', state.scrollHandler);
    
    // Clear any existing interval
    if (state.scrollCheckInterval) {
        clearInterval(state.scrollCheckInterval);
        state.scrollCheckInterval = null;
    }
}