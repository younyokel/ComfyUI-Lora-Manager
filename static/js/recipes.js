// Recipe manager module
import { appCore } from './core.js';
import { ImportManager } from './managers/ImportManager.js';
import { RecipeCard } from './components/RecipeCard.js';
import { RecipeModal } from './components/RecipeModal.js';
import { getCurrentPageState } from './state/index.js';
import { toggleApiKeyVisibility } from './managers/SettingsManager.js';
import { getSessionItem, removeSessionItem } from './utils/storageHelpers.js';

class RecipeManager {
    constructor() {
        // Get page state
        this.pageState = getCurrentPageState();
        
        // Initialize ImportManager
        this.importManager = new ImportManager();
        
        // Initialize RecipeModal
        this.recipeModal = new RecipeModal();
        
        // Add state tracking for infinite scroll
        this.pageState.isLoading = false;
        this.pageState.hasMore = true;
        
        // Custom filter state
        this.customFilter = {
            active: false,
            loraName: null,
            loraHash: null,
            recipeId: null
        };
    }
    
    async initialize() {
        // Initialize event listeners
        this.initEventListeners();
        
        // Set default search options if not already defined
        this._initSearchOptions();
        
        // Check for custom filter parameters in session storage
        this._checkCustomFilter();
        
        // Load initial set of recipes
        await this.loadRecipes();
        
        // Expose necessary functions to the page
        this._exposeGlobalFunctions();
        
        // Initialize common page features (lazy loading, infinite scroll)
        appCore.initializePageFeatures();
    }
    
    _initSearchOptions() {
        // Ensure recipes search options are properly initialized
        if (!this.pageState.searchOptions) {
            this.pageState.searchOptions = {
                title: true,       // Recipe title
                tags: true,        // Recipe tags
                loraName: true,    // LoRA file name
                loraModel: true    // LoRA model name
            };
        }
    }
    
    _exposeGlobalFunctions() {
        // Only expose what's needed for the page
        window.recipeManager = this;
        window.importManager = this.importManager;
        window.toggleApiKeyVisibility = toggleApiKeyVisibility;
    }
    
    _checkCustomFilter() {
        // Check for Lora filter
        const filterLoraName = getSessionItem('lora_to_recipe_filterLoraName');
        const filterLoraHash = getSessionItem('lora_to_recipe_filterLoraHash');
        
        // Check for specific recipe ID
        const viewRecipeId = getSessionItem('viewRecipeId');
        
        // Set custom filter if any parameter is present
        if (filterLoraName || filterLoraHash || viewRecipeId) {
            this.customFilter = {
                active: true,
                loraName: filterLoraName,
                loraHash: filterLoraHash,
                recipeId: viewRecipeId
            };
            
            // Show custom filter indicator
            this._showCustomFilterIndicator();
        }
    }
    
    _showCustomFilterIndicator() {
        const indicator = document.getElementById('customFilterIndicator');
        const textElement = document.getElementById('customFilterText');
        
        if (!indicator || !textElement) return;
        
        // Update text based on filter type
        let filterText = '';
        
        if (this.customFilter.recipeId) {
            filterText = 'Viewing specific recipe';
        } else if (this.customFilter.loraName) {
            // Format with Lora name
            const loraName = this.customFilter.loraName;
            const displayName = loraName.length > 25 ? 
                loraName.substring(0, 22) + '...' : 
                loraName;
                
            filterText = `<span>Recipes using: <span class="lora-name">${displayName}</span></span>`;
        } else {
            filterText = 'Filtered recipes';
        }
        
        // Update indicator text and show it
        textElement.innerHTML = filterText;
        // Add title attribute to show the lora name as a tooltip
        if (this.customFilter.loraName) {
            textElement.setAttribute('title', this.customFilter.loraName);
        }
        indicator.classList.remove('hidden');
        
        // Add pulse animation
        const filterElement = indicator.querySelector('.filter-active');
        if (filterElement) {
            filterElement.classList.add('animate');
            setTimeout(() => filterElement.classList.remove('animate'), 600);
        }
        
        // Add click handler for clear filter button
        const clearFilterBtn = indicator.querySelector('.clear-filter');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();  // Prevent button click from triggering
                this._clearCustomFilter();
            });
        }
    }
    
    _clearCustomFilter() {
        // Reset custom filter
        this.customFilter = {
            active: false,
            loraName: null,
            loraHash: null,
            recipeId: null
        };
        
        // Hide indicator
        const indicator = document.getElementById('customFilterIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
        
        // Clear any session storage items
        removeSessionItem('lora_to_recipe_filterLoraName');
        removeSessionItem('lora_to_recipe_filterLoraHash');
        removeSessionItem('viewRecipeId');
        
        // Reload recipes without custom filter
        this.loadRecipes();
    }
    
    initEventListeners() {
        // Sort select
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.pageState.sortBy = sortSelect.value;
                this.loadRecipes();
            });
        }
    }
    
    async loadRecipes(resetPage = true) {
        try {
            // Show loading indicator
            document.body.classList.add('loading');
            this.pageState.isLoading = true;
            
            // Reset to first page if requested
            if (resetPage) {
                this.pageState.currentPage = 1;
                // Clear grid if resetting
                const grid = document.getElementById('recipeGrid');
                if (grid) grid.innerHTML = '';
            }
            
            // If we have a specific recipe ID to load
            if (this.customFilter.active && this.customFilter.recipeId) {
                await this._loadSpecificRecipe(this.customFilter.recipeId);
                return;
            }
            
            // Build query parameters
            const params = new URLSearchParams({
                page: this.pageState.currentPage,
                page_size: this.pageState.pageSize || 20,
                sort_by: this.pageState.sortBy
            });
            
            // Add custom filter for Lora if present
            if (this.customFilter.active && this.customFilter.loraHash) {
                params.append('lora_hash', this.customFilter.loraHash);
                
                // Skip other filters when using custom filter
                params.append('bypass_filters', 'true');
            } else {
                // Normal filtering logic
                
                // Add search filter if present
                if (this.pageState.filters.search) {
                    params.append('search', this.pageState.filters.search);
                    
                    // Add search option parameters
                    if (this.pageState.searchOptions) {
                        params.append('search_title', this.pageState.searchOptions.title.toString());
                        params.append('search_tags', this.pageState.searchOptions.tags.toString());
                        params.append('search_lora_name', this.pageState.searchOptions.loraName.toString());
                        params.append('search_lora_model', this.pageState.searchOptions.loraModel.toString());
                        params.append('fuzzy', 'true');
                    }
                }
                
                // Add base model filters
                if (this.pageState.filters.baseModel && this.pageState.filters.baseModel.length) {
                    params.append('base_models', this.pageState.filters.baseModel.join(','));
                }
                
                // Add tag filters
                if (this.pageState.filters.tags && this.pageState.filters.tags.length) {
                    params.append('tags', this.pageState.filters.tags.join(','));
                }
            }

            // Fetch recipes
            const response = await fetch(`/api/recipes?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load recipes: ${response.statusText}`);
            }
            
            const data = await response.json();

            // Update recipes grid
            this.updateRecipesGrid(data, resetPage);
            
            // Update pagination state based on current page and total pages
            this.pageState.hasMore = data.page < data.total_pages;
            
        } catch (error) {
            console.error('Error loading recipes:', error);
            appCore.showToast('Failed to load recipes', 'error');
        } finally {
            // Hide loading indicator
            document.body.classList.remove('loading');
            this.pageState.isLoading = false;
        }
    }
    
    async _loadSpecificRecipe(recipeId) {
        try {
            // Fetch specific recipe by ID
            const response = await fetch(`/api/recipe/${recipeId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load recipe: ${response.statusText}`);
            }
            
            const recipe = await response.json();
            
            // Create a data structure that matches the expected format
            const recipeData = {
                items: [recipe],
                total: 1,
                page: 1,
                page_size: 1,
                total_pages: 1
            };
            
            // Update grid with single recipe
            this.updateRecipesGrid(recipeData, true);
            
            // Pagination not needed for single recipe
            this.pageState.hasMore = false;
            
            // Show recipe details modal
            setTimeout(() => {
                this.showRecipeDetails(recipe);
            }, 300);
            
        } catch (error) {
            console.error('Error loading specific recipe:', error);
            appCore.showToast('Failed to load recipe details', 'error');
            
            // Clear the filter and show all recipes
            this._clearCustomFilter();
        }
    }
    
    updateRecipesGrid(data, resetGrid = true) {
        const grid = document.getElementById('recipeGrid');
        if (!grid) return;
        
        // Check if data exists and has items
        if (!data.items || data.items.length === 0) {
            if (resetGrid) {
                grid.innerHTML = `
                    <div class="placeholder-message">
                        <p>No recipes found</p>
                        <p>Add recipe images to your recipes folder to see them here.</p>
                    </div>
                `;
            }
            return;
        }
        
        // Clear grid if resetting
        if (resetGrid) {
            grid.innerHTML = '';
        }
        
        // Create recipe cards
        data.items.forEach(recipe => {
            const recipeCard = new RecipeCard(recipe, (recipe) => this.showRecipeDetails(recipe));
            grid.appendChild(recipeCard.element);
        });
    }
    
    showRecipeDetails(recipe) {
        this.recipeModal.showRecipeDetails(recipe);
    }
}

// Initialize components
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize core application
    await appCore.initialize();
    
    // Initialize recipe manager
    const recipeManager = new RecipeManager();
    await recipeManager.initialize();
});

// Export for use in other modules
export { RecipeManager };