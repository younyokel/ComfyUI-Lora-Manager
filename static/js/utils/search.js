import { appendLoraCards } from '../api/loraApi.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { showToast } from './uiHelpers.js';

export class SearchManager {
    constructor() {
        // Initialize search manager
        this.searchInput = document.getElementById('searchInput');
        this.searchModeToggle = document.getElementById('searchModeToggle');
        this.searchDebounceTimeout = null;
        this.currentSearchTerm = '';
        this.isSearching = false;
        this.isRecursiveSearch = false;
        
        // Add this instance to state
        state.searchManager = this;
        
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
        }

        if (this.searchModeToggle) {
            // Initialize toggle state from localStorage or default to false
            this.isRecursiveSearch = localStorage.getItem('recursiveSearch') === 'true';
            this.updateToggleUI();

            this.searchModeToggle.addEventListener('click', () => {
                this.isRecursiveSearch = !this.isRecursiveSearch;
                localStorage.setItem('recursiveSearch', this.isRecursiveSearch);
                this.updateToggleUI();
                
                // Rerun search if there's an active search term
                if (this.currentSearchTerm) {
                    this.performSearch(this.currentSearchTerm);
                }
            });
        }
    }

    updateToggleUI() {
        if (this.searchModeToggle) {
            this.searchModeToggle.classList.toggle('active', this.isRecursiveSearch);
            this.searchModeToggle.title = this.isRecursiveSearch 
                ? 'Recursive folder search (including subfolders)' 
                : 'Current folder search only';
            
            // Update the icon to indicate the mode
            const icon = this.searchModeToggle.querySelector('i');
            if (icon) {
                icon.className = this.isRecursiveSearch ? 'fas fa-folder-tree' : 'fas fa-folder';
            }
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

            // Always send folder parameter if there is an active folder
            if (state.activeFolder) {
                url.searchParams.set('folder', state.activeFolder);
                // Add recursive parameter when recursive search is enabled
                url.searchParams.set('recursive', this.isRecursiveSearch.toString());
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