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
        sentinel.style.height = '20px'; // Increase height a bit
        sentinel.style.width = '100%';  // Ensure full width
        sentinel.style.position = 'relative'; // Ensure it's in the normal flow
        document.getElementById('loraGrid').appendChild(sentinel);
        state.observer.observe(sentinel);
    }

    // Force layout recalculation
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 100);
}