import { appendLoraCards } from '../api/loraApi.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';
import { showToast } from './uiHelpers.js';

export class SearchManager {
    constructor() {
        // Initialize search manager
        this.searchInput = document.getElementById('searchInput');
        this.searchOptionsToggle = document.getElementById('searchOptionsToggle');
        this.searchOptionsPanel = document.getElementById('searchOptionsPanel');
        this.recursiveSearchToggle = document.getElementById('recursiveSearchToggle');
        this.searchDebounceTimeout = null;
        this.currentSearchTerm = '';
        this.isSearching = false;
        
        // Add clear button
        this.createClearButton();
        
        // Add this instance to state
        state.searchManager = this;
        
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
            // Update clear button visibility on input
            this.searchInput.addEventListener('input', () => {
                this.updateClearButtonVisibility();
            });
        }

        // Initialize search options
        this.initSearchOptions();
    }

    initSearchOptions() {
        // Load recursive search state from localStorage
        state.searchOptions.recursive = localStorage.getItem('recursiveSearch') === 'true';
        
        if (this.recursiveSearchToggle) {
            this.recursiveSearchToggle.checked = state.searchOptions.recursive;
            this.recursiveSearchToggle.addEventListener('change', (e) => {
                state.searchOptions.recursive = e.target.checked;
                localStorage.setItem('recursiveSearch', state.searchOptions.recursive);
                
                // Rerun search if there's an active search term
                if (this.currentSearchTerm) {
                    this.performSearch(this.currentSearchTerm);
                }
            });
        }
        
        // Setup search options toggle
        if (this.searchOptionsToggle) {
            this.searchOptionsToggle.addEventListener('click', () => {
                this.toggleSearchOptionsPanel();
            });
        }
        
        // Close button for search options panel
        const closeButton = document.getElementById('closeSearchOptions');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.closeSearchOptionsPanel();
            });
        }
        
        // Setup search option tags
        const optionTags = document.querySelectorAll('.search-option-tag');
        optionTags.forEach(tag => {
            const option = tag.dataset.option;
            
            // Initialize tag state from state
            tag.classList.toggle('active', state.searchOptions[option]);
            
            tag.addEventListener('click', () => {
                // Check if clicking would deselect the last active option
                const activeOptions = document.querySelectorAll('.search-option-tag.active');
                if (activeOptions.length === 1 && activeOptions[0] === tag) {
                    // Don't allow deselecting the last option and show toast
                    showToast('At least one search option must be selected', 'info');
                    return;
                }
                
                tag.classList.toggle('active');
                state.searchOptions[option] = tag.classList.contains('active');
                
                // Save to localStorage
                localStorage.setItem(`searchOption_${option}`, state.searchOptions[option]);
                
                // Rerun search if there's an active search term
                if (this.currentSearchTerm) {
                    this.performSearch(this.currentSearchTerm);
                }
            });
            
            // Load option state from localStorage or use default
            const savedState = localStorage.getItem(`searchOption_${option}`);
            if (savedState !== null) {
                state.searchOptions[option] = savedState === 'true';
                tag.classList.toggle('active', state.searchOptions[option]);
            }
        });
        
        // Ensure at least one search option is selected
        this.validateSearchOptions();
        
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (this.searchOptionsPanel && 
                !this.searchOptionsPanel.contains(e.target) && 
                e.target !== this.searchOptionsToggle &&
                !this.searchOptionsToggle.contains(e.target)) {
                this.closeSearchOptionsPanel();
            }
        });
    }
    
    // Add method to validate search options
    validateSearchOptions() {
        const hasActiveOption = Object.values(state.searchOptions)
            .some(value => value === true && value !== state.searchOptions.recursive);
        
        // If no search options are active, activate at least one default option
        if (!hasActiveOption) {
            state.searchOptions.filename = true;
            localStorage.setItem('searchOption_filename', 'true');
            
            // Update UI to match
            const fileNameTag = document.querySelector('.search-option-tag[data-option="filename"]');
            if (fileNameTag) {
                fileNameTag.classList.add('active');
            }
        }
    }
    
    toggleSearchOptionsPanel() {
        if (this.searchOptionsPanel) {
            const isHidden = this.searchOptionsPanel.classList.contains('hidden');
            if (isHidden) {
                this.searchOptionsPanel.classList.remove('hidden');
                this.searchOptionsToggle.classList.add('active');
            } else {
                this.closeSearchOptionsPanel();
            }
        }
    }
    
    closeSearchOptionsPanel() {
        if (this.searchOptionsPanel) {
            this.searchOptionsPanel.classList.add('hidden');
            this.searchOptionsToggle.classList.remove('active');
        }
    }

    createClearButton() {
        // Create clear button
        const clearButton = document.createElement('button');
        clearButton.className = 'search-clear';
        clearButton.innerHTML = '<i class="fas fa-times"></i>';
        clearButton.title = 'Clear search';
        
        // Add click handler
        clearButton.addEventListener('click', () => {
            this.searchInput.value = '';
            this.currentSearchTerm = '';
            this.updateClearButtonVisibility();
            resetAndReload();
        });
        
        // Insert after search input
        this.searchInput.parentNode.appendChild(clearButton);
        this.clearButton = clearButton;
        
        // Set initial visibility
        this.updateClearButtonVisibility();
    }

    updateClearButtonVisibility() {
        if (this.clearButton) {
            this.clearButton.classList.toggle('visible', this.searchInput.value.length > 0);
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
            
            // Add search options
            url.searchParams.set('search_filename', state.searchOptions.filename.toString());
            url.searchParams.set('search_modelname', state.searchOptions.modelname.toString());
            url.searchParams.set('search_tags', state.searchOptions.tags.toString());

            // Always send folder parameter if there is an active folder
            if (state.activeFolder) {
                url.searchParams.set('folder', state.activeFolder);
                // Add recursive parameter when recursive search is enabled
                url.searchParams.set('recursive', state.searchOptions.recursive.toString());
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