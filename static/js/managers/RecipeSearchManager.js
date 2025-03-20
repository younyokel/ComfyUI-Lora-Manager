/**
 * RecipeSearchManager - Specialized search manager for the Recipes page
 * Extends the base SearchManager with recipe-specific functionality
 */
import { SearchManager } from './SearchManager.js';
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';

export class RecipeSearchManager extends SearchManager {
  constructor(options = {}) {
    super({
      page: 'recipes',
      ...options
    });
    
    this.currentSearchTerm = '';
    
    // Store this instance in the state
    if (state) {
      state.pages.recipes.searchManager = this;
    }
  }
  
  async performSearch() {
    const searchTerm = this.searchInput.value.trim().toLowerCase();
    
    if (searchTerm === this.currentSearchTerm && !this.isSearching) {
      return; // Avoid duplicate searches
    }
    
    this.currentSearchTerm = searchTerm;
    
    const grid = document.getElementById('recipeGrid');
    
    if (!searchTerm) {
      window.recipeManager.loadRecipes();
      return;
    }

    try {
      this.isSearching = true;
      if (state && state.loadingManager) {
        state.loadingManager.showSimpleLoading('Searching recipes...');
      }

      // Store current scroll position
      const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      
      if (state) {
        state.pages.recipes.currentPage = 1;
        state.pages.recipes.hasMore = true;
      }

      const url = new URL('/api/recipes', window.location.origin);
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', '20');
      url.searchParams.set('sort_by', state ? state.pages.recipes.sortBy : 'name');
      url.searchParams.set('search', searchTerm);
      url.searchParams.set('fuzzy', 'true');
      
      // Add search options
      const recipeState = getCurrentPageState();
      const searchOptions = recipeState.searchOptions;
      url.searchParams.set('search_title', searchOptions.title.toString());
      url.searchParams.set('search_tags', searchOptions.tags.toString());
      url.searchParams.set('search_lora_name', searchOptions.loraName.toString());
      url.searchParams.set('search_lora_model', searchOptions.loraModel.toString());

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      if (searchTerm === this.currentSearchTerm && grid) {
        grid.innerHTML = '';
        
        if (data.items.length === 0) {
          grid.innerHTML = '<div class="no-results">No matching recipes found</div>';
          if (state) {
            state.pages.recipes.hasMore = false;
          }
        } else {
          this.appendRecipeCards(data.items);
          if (state) {
            state.pages.recipes.hasMore = state.pages.recipes.currentPage < data.total_pages;
            state.pages.recipes.currentPage++;
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
      console.error('Recipe search error:', error);
      showToast('Recipe search failed', 'error');
    } finally {
      this.isSearching = false;
      if (state && state.loadingManager) {
        state.loadingManager.hide();
      }
    }
  }
  
  appendRecipeCards(recipes) {
    const grid = document.getElementById('recipeGrid');
    if (!grid) return;
    
    // Create data object in the format expected by the RecipeManager
    const data = { items: recipes, has_more: false };
    window.recipeManager.updateRecipesGrid(data, false);
  }
} 