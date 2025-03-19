/**
 * RecipeSearchManager - Specialized search manager for the Recipes page
 * Extends the base SearchManager with recipe-specific functionality
 */
import { SearchManager } from './SearchManager.js';
import { state } from '../state/index.js';
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
      state.searchManager = this;
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
      if (state) {
        state.currentPage = 1;
      }
      this.resetAndReloadRecipes();
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
        state.currentPage = 1;
        state.hasMore = true;
      }

      const url = new URL('/api/recipes', window.location.origin);
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', '20');
      url.searchParams.set('sort_by', state ? state.sortBy : 'name');
      url.searchParams.set('search', searchTerm);
      url.searchParams.set('fuzzy', 'true');
      
      // Add search options
      const searchOptions = this.getActiveSearchOptions();
      url.searchParams.set('search_name', searchOptions.modelname.toString());
      url.searchParams.set('search_tags', searchOptions.tags.toString());
      url.searchParams.set('search_loras', searchOptions.loras.toString());

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
            state.hasMore = false;
          }
        } else {
          this.appendRecipeCards(data.items);
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
      console.error('Recipe search error:', error);
      showToast('Recipe search failed', 'error');
    } finally {
      this.isSearching = false;
      if (state && state.loadingManager) {
        state.loadingManager.hide();
      }
    }
  }
  
  resetAndReloadRecipes() {
    if (window.recipeManager && typeof window.recipeManager.loadRecipes === 'function') {
      window.recipeManager.loadRecipes();
    } else {
      // Fallback to reloading the page
      window.location.reload(); 
    }
  }
  
  appendRecipeCards(recipes) {
    // This function would be implemented in the recipes page
    // Similar to appendLoraCards for loras
    const grid = document.getElementById('recipeGrid');
    if (!grid) return;
    
    if (typeof window.appendRecipeCards === 'function') {
      window.appendRecipeCards(recipes);
    } else {
      // Fallback implementation
      recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
          <h3>${recipe.name}</h3>
          <p>${recipe.description || 'No description'}</p>
        `;
        grid.appendChild(card);
      });
    }
  }
} 