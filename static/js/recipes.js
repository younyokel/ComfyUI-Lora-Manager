// Recipe manager module
import { appCore } from './core.js';
import { ImportManager } from './managers/ImportManager.js';
import { RecipeCard } from './components/RecipeCard.js';
import { RecipeModal } from './components/RecipeModal.js';

class RecipeManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 20;
        this.sortBy = 'date';
        this.filterParams = {};
        
        // Initialize ImportManager
        this.importManager = new ImportManager();
        
        // Initialize RecipeModal
        this.recipeModal = new RecipeModal();
        
        // Add state tracking for infinite scroll
        this.isLoading = false;
        this.hasMore = true;
    }
    
    async initialize() {
        // Initialize event listeners
        this.initEventListeners();
        
        // Load initial set of recipes
        await this.loadRecipes();
        
        // Expose necessary functions to the page
        this._exposeGlobalFunctions();
        
        // Initialize common page features (lazy loading, infinite scroll)
        appCore.initializePageFeatures();
    }
    
    _exposeGlobalFunctions() {
        // Only expose what's needed for the page
        window.recipeManager = this;
        window.importRecipes = () => this.importRecipes();
        window.importManager = this.importManager;
        window.loadMoreRecipes = () => this.loadMoreRecipes();
    }
    
    initEventListeners() {
        // Sort select
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.sortBy = sortSelect.value;
                this.loadRecipes();
            });
        }
        
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let debounceTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    this.filterParams.search = searchInput.value;
                    this.loadRecipes();
                }, 300);
            });
        }
        
        // Import button
        const importButton = document.querySelector('button[onclick="importRecipes()"]');
        if (importButton) {
            importButton.onclick = (e) => {
                e.preventDefault();
                this.importManager.showImportModal();
            };
        }
    }
    
    async loadRecipes(resetPage = true) {
        try {
            // Show loading indicator
            document.body.classList.add('loading');
            this.isLoading = true;
            
            // Reset to first page if requested
            if (resetPage) {
                this.currentPage = 1;
                // Clear grid if resetting
                const grid = document.getElementById('recipeGrid');
                if (grid) grid.innerHTML = '';
            }
            
            // Build query parameters
            const params = new URLSearchParams({
                page: this.currentPage,
                page_size: this.pageSize,
                sort_by: this.sortBy
            });
            
            // Add search filter if present
            if (this.filterParams.search) {
                params.append('search', this.filterParams.search);
            }
            
            // Add other filters
            if (this.filterParams.baseModels && this.filterParams.baseModels.length) {
                params.append('base_models', this.filterParams.baseModels.join(','));
            }
            
            // Fetch recipes
            const response = await fetch(`/api/recipes?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load recipes: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update recipes grid
            this.updateRecipesGrid(data, resetPage);
            
            // Update pagination state
            this.hasMore = data.has_more || false;
            
        } catch (error) {
            console.error('Error loading recipes:', error);
            appCore.showToast('Failed to load recipes', 'error');
        } finally {
            // Hide loading indicator
            document.body.classList.remove('loading');
            this.isLoading = false;
        }
    }
    
    // Load more recipes for infinite scroll
    async loadMoreRecipes() {
        if (this.isLoading || !this.hasMore) return;
        
        this.currentPage++;
        await this.loadRecipes(false);
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
        if (this.hasMore) {
            let sentinel = document.getElementById('scroll-sentinel');
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.id = 'scroll-sentinel';
                sentinel.style.height = '10px';
                grid.appendChild(sentinel);
                
                // Re-observe the sentinel if we have an observer
                if (window.state && window.state.observer) {
                    window.state.observer.observe(sentinel);
                }
            }
        }
    }
    
    showRecipeDetails(recipe) {
        this.recipeModal.showRecipeDetails(recipe);
    }
    
    // Add a method to handle recipe import
    importRecipes() {
        this.importManager.showImportModal();
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