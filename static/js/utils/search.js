import { appendLoraCards } from '../api/loraApi.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { showToast } from './uiHelpers.js';

export class SearchManager {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.searchDebounceTimeout = null;
        this.currentSearchTerm = '';
        this.isSearching = false;
        
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
        }
    }

    handleSearch(event) {
        if (this.searchDebounceTimeout) {
            clearTimeout(this.searchDebounceTimeout);
        }

        this.searchDebounceTimeout = setTimeout(async () => {
            const searchTerm = event.target.value.trim().toLowerCase();
            
            if (searchTerm !== this.currentSearchTerm && !this.isSearching) {
                this.currentSearchTerm = searchTerm;
                await this.performSearch(searchTerm);
            }
        }, 250);
    }

    async performSearch(searchTerm) {
        const grid = document.getElementById('loraGrid');
        
        if (!searchTerm) {
            state.currentPage = 1;
            await resetAndReload();
            return;
        }

        try {
            this.isSearching = true;
            state.loadingManager.showSimpleLoading('Searching...');

            state.currentPage = 1;
            state.hasMore = true;

            const url = new URL('/api/loras', window.location.origin);
            url.searchParams.set('page', '1');
            url.searchParams.set('page_size', '20');
            url.searchParams.set('sort_by', state.sortBy);
            url.searchParams.set('search', searchTerm);
            url.searchParams.set('fuzzy', 'true');

            if (state.activeFolder) {
                url.searchParams.set('folder', state.activeFolder);
            }

            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            
            if (searchTerm === this.currentSearchTerm) {
                grid.innerHTML = '';
                
                if (data.items.length === 0) {
                    grid.innerHTML = '<div class="no-results">No matching loras found</div>';
                    state.hasMore = false;
                } else {
                    appendLoraCards(data.items);
                    state.hasMore = state.currentPage < data.total_pages;
                    state.currentPage++;
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            showToast('Search failed', 'error');
        } finally {
            this.isSearching = false;
            state.loadingManager.hide();
        }
    }
} 