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
      this.currentPage = options.page || document.body.dataset.page || 'loras';
      this.isSearching = false;
      
      // Create clear button for search input
      this.createClearButton();
      
      this.initEventListeners();
      this.loadSearchPreferences();
      
      // Initialize panel positions
      this.updatePanelPositions();
      
      // Add resize listener
      window.addEventListener('resize', this.updatePanelPositions.bind(this));
    }
    
    initEventListeners() {
      // Search input event
      if (this.searchInput) {
        this.searchInput.addEventListener('input', () => {
          clearTimeout(this.searchTimeout);
          this.searchTimeout = setTimeout(() => this.performSearch(), this.options.searchDelay);
          this.updateClearButtonVisibility();
        });
        
        // Clear search with Escape key
        this.searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            this.searchInput.value = '';
            this.updateClearButtonVisibility();
            this.performSearch();
          }
        });
      }
      
      // Search options toggle
      if (this.searchOptionsToggle) {
        this.searchOptionsToggle.addEventListener('click', () => {
          this.toggleSearchOptionsPanel();
        });
      }
      
      // Close search options
      if (this.closeSearchOptions) {
        this.closeSearchOptions.addEventListener('click', () => {
          this.closeSearchOptionsPanel();
        });
      }
      
      // Search option tags
      if (this.searchOptionTags) {
        this.searchOptionTags.forEach(tag => {
          tag.addEventListener('click', () => {
            // Check if clicking would deselect the last active option
            const activeOptions = document.querySelectorAll('.search-option-tag.active');
            if (activeOptions.length === 1 && activeOptions[0] === tag) {
              // Don't allow deselecting the last option
              if (typeof showToast === 'function') {
                showToast('At least one search option must be selected', 'info');
              }
              return;
            }
            
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
      
      // Add global click handler to close panels when clicking outside
      document.addEventListener('click', (e) => {
        // Close search options panel when clicking outside
        if (this.searchOptionsPanel && 
            !this.searchOptionsPanel.contains(e.target) && 
            e.target !== this.searchOptionsToggle &&
            !this.searchOptionsToggle.contains(e.target)) {
          this.closeSearchOptionsPanel();
        }
        
        // Close filter panel when clicking outside (if filterManager exists)
        const filterPanel = document.getElementById('filterPanel');
        const filterButton = document.getElementById('filterButton');
        if (filterPanel && 
            !filterPanel.contains(e.target) && 
            e.target !== filterButton &&
            !filterButton.contains(e.target) &&
            window.filterManager) {
          window.filterManager.closeFilterPanel();
        }
      });
    }
    
    createClearButton() {
      // Create clear button if it doesn't exist
      if (!this.searchInput) return;
      
      // Check if clear button already exists
      let clearButton = this.searchInput.parentNode.querySelector('.search-clear');
      
      if (!clearButton) {
        // Create clear button
        clearButton = document.createElement('button');
        clearButton.className = 'search-clear';
        clearButton.innerHTML = '<i class="fas fa-times"></i>';
        clearButton.title = 'Clear search';
        
        // Add click handler
        clearButton.addEventListener('click', () => {
          this.searchInput.value = '';
          this.updateClearButtonVisibility();
          this.performSearch();
        });
        
        // Insert after search input
        this.searchInput.parentNode.appendChild(clearButton);
      }
      
      this.clearButton = clearButton;
      
      // Set initial visibility
      this.updateClearButtonVisibility();
    }
    
    updateClearButtonVisibility() {
      if (this.clearButton) {
        this.clearButton.classList.toggle('visible', this.searchInput.value.length > 0);
      }
    }
    
    toggleSearchOptionsPanel() {
      if (this.searchOptionsPanel) {
        const isHidden = this.searchOptionsPanel.classList.contains('hidden');
        if (isHidden) {
          // Update position before showing
          this.updatePanelPositions();
          this.searchOptionsPanel.classList.remove('hidden');
          this.searchOptionsToggle.classList.add('active');
          
          // Ensure the panel is visible
          this.searchOptionsPanel.style.display = 'block';
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
        
        // Apply recursive search - only if the toggle exists
        if (this.recursiveSearchToggle && preferences.recursive !== undefined) {
          this.recursiveSearchToggle.checked = preferences.recursive;
        }
        
        // Ensure at least one search option is selected
        this.validateSearchOptions();
      } catch (error) {
        console.error('Error loading search preferences:', error);
        // Set default options if loading fails
        this.setDefaultSearchOptions();
      }
    }
    
    validateSearchOptions() {
      // Check if at least one search option is active
      const hasActiveOption = Array.from(this.searchOptionTags).some(tag => 
        tag.classList.contains('active')
      );
      
      // If no search options are active, activate default options
      if (!hasActiveOption) {
        this.setDefaultSearchOptions();
      }
    }
    
    setDefaultSearchOptions() {
      // Default to filename search option if available
      const filenameOption = Array.from(this.searchOptionTags).find(tag => 
        tag.dataset.option === 'filename'
      );
      
      if (filenameOption) {
        filenameOption.classList.add('active');
      } else if (this.searchOptionTags.length > 0) {
        // Otherwise, select the first option
        this.searchOptionTags[0].classList.add('active');
      }
      
      // Save the default preferences
      this.saveSearchPreferences();
    }
    
    saveSearchPreferences() {
      try {
        const options = {};
        this.searchOptionTags.forEach(tag => {
          options[tag.dataset.option] = tag.classList.contains('active');
        });
        
        const preferences = {
          options
        };
        
        // Only add recursive option if the toggle exists
        if (this.recursiveSearchToggle) {
          preferences.recursive = this.recursiveSearchToggle.checked;
        }
        
        localStorage.setItem(`${this.currentPage}_search_prefs`, JSON.stringify(preferences));
      } catch (error) {
        console.error('Error saving search preferences:', error);
      }
    }
    
    getActiveSearchOptions() {
      const options = {};
      this.searchOptionTags.forEach(tag => {
        options[tag.dataset.option] = tag.classList.contains('active');
      });
      return options;
    }
    
    updatePanelPositions() {
      const searchOptionsPanel = document.getElementById('searchOptionsPanel');
      const filterPanel = document.getElementById('filterPanel');
      
      if (!searchOptionsPanel && !filterPanel) return;
      
      // Get the header element
      const header = document.querySelector('.app-header');
      if (!header) return;
      
      // Calculate the position based on the bottom of the header
      const headerRect = header.getBoundingClientRect();
      const topPosition = headerRect.bottom + 5; // Add 5px padding
      
      // Set the positions
      if (searchOptionsPanel) {
        searchOptionsPanel.style.top = `${topPosition}px`;
        
        // Make sure the panel is visible when positioned
        if (!searchOptionsPanel.classList.contains('hidden') && 
            window.getComputedStyle(searchOptionsPanel).display === 'none') {
          searchOptionsPanel.style.display = 'block';
        }
      }
      
      if (filterPanel) {
        filterPanel.style.top = `${topPosition}px`;
      }
      
      // Adjust panel horizontal position based on the search container
      const searchContainer = document.querySelector('.header-search');
      if (searchContainer) {
        const searchRect = searchContainer.getBoundingClientRect();
        
        // Position the search options panel aligned with the search container
        if (searchOptionsPanel) {
          searchOptionsPanel.style.right = `${window.innerWidth - searchRect.right}px`;
        }
        
        // Position the filter panel aligned with the filter button
        if (filterPanel) {
          const filterButton = document.getElementById('filterButton');
          if (filterButton) {
            const filterRect = filterButton.getBoundingClientRect();
            filterPanel.style.right = `${window.innerWidth - filterRect.right}px`;
          }
        }
      }
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