// Recipe manager module
import { appCore } from './core.js';
import { ImportManager } from './managers/ImportManager.js';
import { RecipeCard } from './components/RecipeCard.js';
import { RecipeModal } from './components/RecipeModal.js';
import { state, getCurrentPageState, setCurrentPageType, initPageState } from './state/index.js';

class RecipeManager {
    constructor() {
        // Initialize recipe page state
        initPageState('recipes');
        
        // Get page state
        this.pageState = getCurrentPageState();
        
        // Initialize ImportManager
        this.importManager = new ImportManager();
        
        // Initialize RecipeModal
        this.recipeModal = new RecipeModal();
        
        // Add state tracking for infinite scroll
        this.pageState.isLoading = false;
        this.pageState.hasMore = true;
    }
    
    async initialize() {
        // Initialize event listeners
        this.initEventListeners();
        
        // Set default search options if not already defined
        this._initSearchOptions();
        
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
            
            // Build query parameters
            const params = new URLSearchParams({
                page: this.pageState.currentPage,
                page_size: this.pageState.pageSize || 20,
                sort_by: this.pageState.sortBy
            });
            
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

            console.log('Loading recipes with params:', params.toString());
            
            // Fetch recipes
            const response = await fetch(`/api/recipes?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load recipes: ${response.statusText}`);
            }
            
            const data = await response.json();

            console.log('Recipes data:', data);
            
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
        
        // Add sentinel for infinite scroll if needed
        if (this.pageState.hasMore) {
            let sentinel = document.getElementById('scroll-sentinel');
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.id = 'scroll-sentinel';
                sentinel.style.height = '10px';
                grid.appendChild(sentinel);
                
                // Re-observe the sentinel if we have an observer
                if (state && state.observer) {
                    state.observer.observe(sentinel);
                }
            }
        }
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