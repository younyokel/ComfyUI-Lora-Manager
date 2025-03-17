/**
 * SearchManager - Handles search functionality across different pages
 * Each page can extend or customize this base functionality
 */
export class SearchManager {
    constructor(options = {}) {
      this.options = {
        searchDelay: 300,
        minSearchLength: 2,
        ...options
      };
      
      this.searchInput = document.getElementById('searchInput');
      this.searchOptionsToggle = document.getElementById('searchOptionsToggle');
      this.searchOptionsPanel = document.getElementById('searchOptionsPanel');
      this.closeSearchOptions = document.getElementById('closeSearchOptions');
      this.searchOptionTags = document.querySelectorAll('.search-option-tag');
      this.recursiveSearchToggle = document.getElementById('recursiveSearchToggle');
      
      this.searchTimeout = null;
      this.currentPage = document.body.dataset.page || 'loras';
      
      this.initEventListeners();
      this.loadSearchPreferences();
    }
    
    initEventListeners() {
      // Search input event
      if (this.searchInput) {
        this.searchInput.addEventListener('input', () => {
          clearTimeout(this.searchTimeout);
          this.searchTimeout = setTimeout(() => this.performSearch(), this.options.searchDelay);
        });
        
        // Clear search with Escape key
        this.searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            this.searchInput.value = '';
            this.performSearch();
          }
        });
      }
      
      // Search options toggle
      if (this.searchOptionsToggle) {
        this.searchOptionsToggle.addEventListener('click', () => {
          this.searchOptionsPanel.classList.toggle('hidden');
        });
      }
      
      // Close search options
      if (this.closeSearchOptions) {
        this.closeSearchOptions.addEventListener('click', () => {
          this.searchOptionsPanel.classList.add('hidden');
        });
      }
      
      // Search option tags
      if (this.searchOptionTags) {
        this.searchOptionTags.forEach(tag => {
          tag.addEventListener('click', () => {
            tag.classList.toggle('active');
            this.saveSearchPreferences();
            this.performSearch();
          });
        });
      }
      
      // Recursive search toggle
      if (this.recursiveSearchToggle) {
        this.recursiveSearchToggle.addEventListener('change', () => {
          this.saveSearchPreferences();
          this.performSearch();
        });
      }
    }
    
    loadSearchPreferences() {
      try {
        const preferences = JSON.parse(localStorage.getItem(`${this.currentPage}_search_prefs`)) || {};
        
        // Apply search options
        if (preferences.options) {
          this.searchOptionTags.forEach(tag => {
            const option = tag.dataset.option;
            if (preferences.options[option] !== undefined) {
              tag.classList.toggle('active', preferences.options[option]);
            }
          });
        }
        
        // Apply recursive search
        if (this.recursiveSearchToggle && preferences.recursive !== undefined) {
          this.recursiveSearchToggle.checked = preferences.recursive;
        }
      } catch (error) {
        console.error('Error loading search preferences:', error);
      }
    }
    
    saveSearchPreferences() {
      try {
        const options = {};
        this.searchOptionTags.forEach(tag => {
          options[tag.dataset.option] = tag.classList.contains('active');
        });
        
        const preferences = {
          options,
          recursive: this.recursiveSearchToggle ? this.recursiveSearchToggle.checked : false
        };
        
        localStorage.setItem(`${this.currentPage}_search_prefs`, JSON.stringify(preferences));
      } catch (error) {
        console.error('Error saving search preferences:', error);
      }
    }
    
    getActiveSearchOptions() {
      const options = [];
      this.searchOptionTags.forEach(tag => {
        if (tag.classList.contains('active')) {
          options.push(tag.dataset.option);
        }
      });
      return options;
    }
    
    performSearch() {
      const query = this.searchInput.value.trim();
      const options = this.getActiveSearchOptions();
      const recursive = this.recursiveSearchToggle ? this.recursiveSearchToggle.checked : false;
      
      // This is a base implementation - each page should override this method
      console.log('Performing search:', {
        query,
        options,
        recursive,
        page: this.currentPage
      });
      
      // Dispatch a custom event that page-specific code can listen for
      const searchEvent = new CustomEvent('app:search', {
        detail: {
          query,
          options,
          recursive,
          page: this.currentPage
        }
      });
      
      document.dispatchEvent(searchEvent);
    }
  }