/**
 * CheckpointSearchManager - Specialized search manager for the Checkpoints page
 * Extends the base SearchManager with checkpoint-specific functionality
 */
import { SearchManager } from './SearchManager.js';
import { state } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';

export class CheckpointSearchManager extends SearchManager {
  constructor(options = {}) {
    super({
      page: 'checkpoints',
      ...options
    });
    
    this.currentSearchTerm = '';
    
    // Store this instance in the state
    if (state) {
      state.searchManager = this;
    }
  }
  
  async performSearch() {
    const searchTerm = this.searchInput.value.trim().toLowerCase();
    
    if (searchTerm === this.currentSearchTerm && !this.isSearching) {
      return; // Avoid duplicate searches
    }
    
    this.currentSearchTerm = searchTerm;
    
    const grid = document.getElementById('checkpointGrid');
    
    if (!searchTerm) {
      if (state) {
        state.currentPage = 1;
      }
      this.resetAndReloadCheckpoints();
      return;
    }

    try {
      this.isSearching = true;
      if (state && state.loadingManager) {
        state.loadingManager.showSimpleLoading('Searching checkpoints...');
      }

      // Store current scroll position
      const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      
      if (state) {
        state.currentPage = 1;
        state.hasMore = true;
      }

      const url = new URL('/api/checkpoints', window.location.origin);
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', '20');
      url.searchParams.set('sort_by', state ? state.sortBy : 'name');
      url.searchParams.set('search', searchTerm);
      url.searchParams.set('fuzzy', 'true');
      
      // Add search options
      const searchOptions = this.getActiveSearchOptions();
      url.searchParams.set('search_filename', searchOptions.filename.toString());
      url.searchParams.set('search_modelname', searchOptions.modelname.toString());

      // Always send folder parameter if there is an active folder
      if (state && state.activeFolder) {
        url.searchParams.set('folder', state.activeFolder);
        // Add recursive parameter when recursive search is enabled
        const recursive = this.recursiveSearchToggle ? this.recursiveSearchToggle.checked : false;
        url.searchParams.set('recursive', recursive.toString());
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      if (searchTerm === this.currentSearchTerm && grid) {
        grid.innerHTML = '';
        
        if (data.items.length === 0) {
          grid.innerHTML = '<div class="no-results">No matching checkpoints found</div>';
          if (state) {
            state.hasMore = false;
          }
        } else {
          this.appendCheckpointCards(data.items);
          if (state) {
            state.hasMore = state.currentPage < data.total_pages;
            state.currentPage++;
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
      console.error('Checkpoint search error:', error);
      showToast('Checkpoint search failed', 'error');
    } finally {
      this.isSearching = false;
      if (state && state.loadingManager) {
        state.loadingManager.hide();
      }
    }
  }
  
  resetAndReloadCheckpoints() {
    // This function would be implemented in the checkpoints page
    if (typeof window.loadCheckpoints === 'function') {
      window.loadCheckpoints();
    } else {
      // Fallback to reloading the page
      window.location.reload();
    }
  }
  
  appendCheckpointCards(checkpoints) {
    // This function would be implemented in the checkpoints page
    const grid = document.getElementById('checkpointGrid');
    if (!grid) return;
    
    if (typeof window.appendCheckpointCards === 'function') {
      window.appendCheckpointCards(checkpoints);
    } else {
      // Fallback implementation
      checkpoints.forEach(checkpoint => {
        const card = document.createElement('div');
        card.className = 'checkpoint-card';
        card.innerHTML = `
          <h3>${checkpoint.name}</h3>
          <p>${checkpoint.filename || 'No filename'}</p>
        `;
        grid.appendChild(card);
      });
    }
  }
} 