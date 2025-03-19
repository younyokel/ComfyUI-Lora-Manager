/**
 * LoraSearchManager - Specialized search manager for the LoRAs page
 * Extends the base SearchManager with LoRA-specific functionality
 */
import { SearchManager } from './SearchManager.js';
import { appendLoraCards } from '../api/loraApi.js';
import { resetAndReload } from '../api/loraApi.js';
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';

export class LoraSearchManager extends SearchManager {
  constructor(options = {}) {
    super({
      page: 'loras',
      ...options
    });
    
    this.currentSearchTerm = '';
    
    // Store this instance in the state
    if (state) {
      const pageState = getCurrentPageState();
      pageState.searchManager = this;
    }
  }
  
  async performSearch() {
    const searchTerm = this.searchInput.value.trim().toLowerCase();
    const pageState = getCurrentPageState();
    
    // Log the search attempt for debugging
    console.log('LoraSearchManager performSearch called with:', searchTerm);
    
    if (searchTerm === this.currentSearchTerm && !this.isSearching) {
      return; // Avoid duplicate searches
    }
    
    this.currentSearchTerm = searchTerm;
    
    const grid = document.getElementById('loraGrid');
    if (!grid) {
      console.error('Error: Could not find loraGrid element');
      return;
    }
    
    if (!searchTerm) {
      if (pageState) {
        pageState.currentPage = 1;
      }
      await resetAndReload();
      return;
    }

    try {
      this.isSearching = true;
      if (state && state.loadingManager) {
        state.loadingManager.showSimpleLoading('Searching...');
      }

      // Store current scroll position
      const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      
      if (pageState) {
        pageState.currentPage = 1;
        pageState.hasMore = true;
      }

      const url = new URL('/api/loras', window.location.origin);
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', '20');
      url.searchParams.set('sort_by', pageState ? pageState.sortBy : 'name');
      url.searchParams.set('search', searchTerm);
      url.searchParams.set('fuzzy', 'true');
      
      // Add search options
      const searchOptions = this.getActiveSearchOptions();
      console.log('Active search options:', searchOptions);
      
      // Make sure we're sending boolean values as strings
      url.searchParams.set('search_filename', searchOptions.filename ? 'true' : 'false');
      url.searchParams.set('search_modelname', searchOptions.modelname ? 'true' : 'false');
      url.searchParams.set('search_tags', searchOptions.tags ? 'true' : 'false');

      // Always send folder parameter if there is an active folder
      if (pageState && pageState.activeFolder) {
        url.searchParams.set('folder', pageState.activeFolder);
        // Add recursive parameter when recursive search is enabled
        const recursive = this.recursiveSearchToggle ? this.recursiveSearchToggle.checked : false;
        url.searchParams.set('recursive', recursive.toString());
      }

      console.log('Search URL:', url.toString());
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Search results:', data);
      
      if (searchTerm === this.currentSearchTerm) {
        grid.innerHTML = '';
        
        if (data.items.length === 0) {
          grid.innerHTML = '<div class="no-results">No matching loras found</div>';
          if (pageState) {
            pageState.hasMore = false;
          }
        } else {
          appendLoraCards(data.items);
          if (pageState) {
            pageState.hasMore = pageState.currentPage < data.total_pages;
            pageState.currentPage++;
          }
        }
        
        // Restore scroll position after content is loaded
        setTimeout(() => {
          window.scrollTo({
            top: scrollPosition,
            behavior: 'instant' // Use 'instant' to prevent animation
          });
        }, 10);
      }
    } catch (error) {
      console.error('Search error:', error);
      showToast('Search failed', 'error');
    } finally {
      this.isSearching = false;
      if (state && state.loadingManager) {
        state.loadingManager.hide();
      }
    }
  }
} 