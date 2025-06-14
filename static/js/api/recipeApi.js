import { RecipeCard } from '../components/RecipeCard.js';
import {
    resetAndReloadWithVirtualScroll,
    loadMoreWithVirtualScroll
} from './baseModelApi.js';
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';

/**
 * Fetch recipes with pagination for virtual scrolling
 * @param {number} page - Page number to fetch
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Object>} Object containing items, total count, and pagination info
 */
export async function fetchRecipesPage(page = 1, pageSize = 100) {
    const pageState = getCurrentPageState();
    
    try {
        const params = new URLSearchParams({
            page: page,
            page_size: pageSize || pageState.pageSize || 20,
            sort_by: pageState.sortBy
        });
        
        // If we have a specific recipe ID to load
        if (pageState.customFilter?.active && pageState.customFilter?.recipeId) {
            // Special case: load specific recipe
            const response = await fetch(`/api/recipe/${pageState.customFilter.recipeId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load recipe: ${response.statusText}`);
            }
            
            const recipe = await response.json();
            
            // Return in expected format
            return {
                items: [recipe],
                totalItems: 1,
                totalPages: 1,
                currentPage: 1,
                hasMore: false
            };
        }
        
        // Add custom filter for Lora if present
        if (pageState.customFilter?.active && pageState.customFilter?.loraHash) {
            params.append('lora_hash', pageState.customFilter.loraHash);
            params.append('bypass_filters', 'true');
        } else {
            // Normal filtering logic
            
            // Add search filter if present
            if (pageState.filters?.search) {
                params.append('search', pageState.filters.search);
                
                // Add search option parameters
                if (pageState.searchOptions) {
                    params.append('search_title', pageState.searchOptions.title.toString());
                    params.append('search_tags', pageState.searchOptions.tags.toString());
                    params.append('search_lora_name', pageState.searchOptions.loraName.toString());
                    params.append('search_lora_model', pageState.searchOptions.loraModel.toString());
                    params.append('fuzzy', 'true');
                }
            }
            
            // Add base model filters
            if (pageState.filters?.baseModel && pageState.filters.baseModel.length) {
                params.append('base_models', pageState.filters.baseModel.join(','));
            }
            
            // Add tag filters
            if (pageState.filters?.tags && pageState.filters.tags.length) {
                params.append('tags', pageState.filters.tags.join(','));
            }
        }

        // Fetch recipes
        const response = await fetch(`/api/recipes?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load recipes: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
            items: data.items,
            totalItems: data.total,
            totalPages: data.total_pages,
            currentPage: page,
            hasMore: page < data.total_pages
        };
    } catch (error) {
        console.error('Error fetching recipes:', error);
        showToast(`Failed to fetch recipes: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Reset and reload recipes using virtual scrolling
 * @param {boolean} updateFolders - Whether to update folder tags
 * @returns {Promise<Object>} The fetch result
 */
export async function resetAndReload(updateFolders = false) {
    return resetAndReloadWithVirtualScroll({
        modelType: 'recipe',
        updateFolders,
        fetchPageFunction: fetchRecipesPage
    });
}

/**
 * Refreshes the recipe list by first rebuilding the cache and then loading recipes
 */
export async function refreshRecipes() {
    try {
        state.loadingManager.showSimpleLoading('Refreshing recipes...');
        
        // Call the API endpoint to rebuild the recipe cache
        const response = await fetch('/api/recipes/scan');
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to refresh recipe cache');
        }
        
        // After successful cache rebuild, reload the recipes
        await resetAndReload();
        
        showToast('Refresh complete', 'success');
    } catch (error) {
        console.error('Error refreshing recipes:', error);
        showToast(error.message || 'Failed to refresh recipes', 'error');
    } finally {
        state.loadingManager.hide();
        state.loadingManager.restoreProgressBar();
    }
}

/**
 * Load more recipes with pagination - updated to work with VirtualScroller
 * @param {boolean} resetPage - Whether to reset to the first page
 * @returns {Promise<void>}
 */
export async function loadMoreRecipes(resetPage = false) {
    const pageState = getCurrentPageState();
    
    // Use virtual scroller if available
    if (state.virtualScroller) {
        return loadMoreWithVirtualScroll({
            modelType: 'recipe',
            resetPage,
            updateFolders: false,
            fetchPageFunction: fetchRecipesPage
        });
    }
}

/**
 * Create a recipe card instance from recipe data
 * @param {Object} recipe - Recipe data
 * @returns {HTMLElement} Recipe card DOM element
 */
export function createRecipeCard(recipe) {
    const recipeCard = new RecipeCard(recipe, (recipe) => {
        if (window.recipeManager) {
            window.recipeManager.showRecipeDetails(recipe);
        }
    });
    return recipeCard.element;
}
