import { updateService } from '../managers/UpdateService.js';
import { toggleTheme } from '../utils/uiHelpers.js';
import { SearchManager } from '../managers/SearchManager.js';
import { FilterManager } from '../managers/FilterManager.js';

/**
 * Header.js - Manages the application header behavior across different pages
 * Handles initialization of appropriate search and filter managers based on current page
 */
export class HeaderManager {
    constructor() {
      this.currentPage = this.detectCurrentPage();
      this.searchManager = null;
      this.filterManager = null;
      
      // Initialize appropriate managers based on current page
      this.initializeManagers();
      
      // Set up common header functionality
      this.initializeCommonElements();
    }
    
    detectCurrentPage() {
      const path = window.location.pathname;
      if (path.includes('/loras/recipes')) return 'recipes';
      if (path.includes('/checkpoints')) return 'checkpoints';
      if (path.includes('/loras')) return 'loras';
      return 'unknown';
    }
    
    initializeManagers() {
      // Initialize SearchManager for all page types
      this.searchManager = new SearchManager({ page: this.currentPage });
      window.searchManager = this.searchManager;
      
      // Initialize FilterManager for all page types that have filters
      if (document.getElementById('filterButton')) {
        this.filterManager = new FilterManager({ page: this.currentPage });
        window.filterManager = this.filterManager;
      }
    }
    
    initializeCommonElements() {
      // Handle theme toggle
      const themeToggle = document.querySelector('.theme-toggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', () => {
          if (typeof toggleTheme === 'function') {
            toggleTheme();
          }
        });
      }
      
      // Handle settings toggle
      const settingsToggle = document.querySelector('.settings-toggle');
      if (settingsToggle) {
        settingsToggle.addEventListener('click', () => {
          if (window.settingsManager) {
            window.settingsManager.toggleSettings();
          }
        });
      }
      
      // Handle update toggle
      const updateToggle = document.getElementById('updateToggleBtn');
      if (updateToggle) {
        updateToggle.addEventListener('click', () => {
          updateService.toggleUpdateModal();
        });
      }
      
      // Handle support toggle
      const supportToggle = document.getElementById('supportToggleBtn');
      if (supportToggle) {
        supportToggle.addEventListener('click', () => {
          // Handle support panel logic
        });
      }
    }
}
