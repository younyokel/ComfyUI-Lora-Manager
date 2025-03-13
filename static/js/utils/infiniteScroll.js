import { state } from '../state/index.js';
import { loadMoreLoras } from '../api/loraApi.js';

export function initializeInfiniteScroll() {
    if (state.observer) {
        state.observer.disconnect();
    }

    state.observer = new IntersectionObserver(
        (entries) => {
            const target = entries[0];
            if (target.isIntersecting && !state.isLoading && state.hasMore) {
                loadMoreLoras();
            }
        },
        { threshold: 0.1 }
    );

    const existingSentinel = document.getElementById('scroll-sentinel');
    if (existingSentinel) {
        state.observer.observe(existingSentinel);
    } else {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '10px';
        document.getElementById('loraGrid').appendChild(sentinel);
        state.observer.observe(sentinel);
    }
} 