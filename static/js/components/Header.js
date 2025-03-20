import { updateService } from '../managers/UpdateService.js';
import { toggleTheme } from '../utils/uiHelpers.js';

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
      // Import and initialize appropriate search manager based on page
      if (this.currentPage === 'loras') {
        import('../managers/LoraSearchManager.js').then(module => {
          const { LoraSearchManager } = module;
          this.searchManager = new LoraSearchManager();
          window.searchManager = this.searchManager;
        });
        
        import('../managers/FilterManager.js').then(module => {
          const { FilterManager } = module;
          this.filterManager = new FilterManager();
          window.filterManager = this.filterManager;
        });
      } else if (this.currentPage === 'recipes') {
        import('../managers/RecipeSearchManager.js').then(module => {
          const { RecipeSearchManager } = module;
          this.searchManager = new RecipeSearchManager();
          window.searchManager = this.searchManager;
        });
        
        import('../managers/RecipeFilterManager.js').then(module => {
          const { RecipeFilterManager } = module;
          this.filterManager = new RecipeFilterManager();
          window.filterManager = this.filterManager;
        });
      } else if (this.currentPage === 'checkpoints') {
        import('../managers/CheckpointSearchManager.js').then(module => {
          const { CheckpointSearchManager } = module;
          this.searchManager = new CheckpointSearchManager();
          window.searchManager = this.searchManager;
        });
        
        // Note: Checkpoints page might get its own filter manager in the future
        // For now, we can use a basic filter manager or none at all
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
