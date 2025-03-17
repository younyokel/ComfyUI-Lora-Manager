// Recipe manager module
import { showToast } from './utils/uiHelpers.js';
import { state } from './state/index.js';
import { initializeCommonComponents } from './common.js';
import { ImportManager } from './managers/ImportManager.js';
import { RecipeCard } from './components/RecipeCard.js';
import { RecipeModal } from './components/RecipeModal.js';
import { SearchManager } from './managers/SearchManager.js';
import { HeaderManager } from './components/Header.js';

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
        
        this.init();
    }
    
    init() {
        // Initialize event listeners
        this.initEventListeners();
        
        // Load initial set of recipes
        this.loadRecipes();

        // Initialize search manager with Recipe-specific options
        const recipeSearchManager = new SearchManager({
            searchCallback: (query, options, recursive) => {
            // Recipe-specific search implementation
            fetchRecipes({
                search: query,
                search_options: options,
                recursive: recursive
            });
            }
        });
  
        // Set the current page for proper context
        document.body.dataset.page = 'recipes';
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
    
    async loadRecipes() {
        try {
            // Show loading indicator
            document.body.classList.add('loading');
            
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
            this.updateRecipesGrid(data);
            
        } catch (error) {
            console.error('Error loading recipes:', error);
            showToast('Failed to load recipes', 'error');
        } finally {
            // Hide loading indicator
            document.body.classList.remove('loading');
        }
    }
    
    updateRecipesGrid(data) {
        const grid = document.getElementById('recipeGrid');
        if (!grid) return;
        
        // Check if data exists and has items
        if (!data.items || data.items.length === 0) {
            grid.innerHTML = `
                <div class="placeholder-message">
                    <p>No recipes found</p>
                    <p>Add recipe images to your recipes folder to see them here.</p>
                </div>
            `;
            return;
        }
        
        // Clear grid
        grid.innerHTML = '';
        
        // Create recipe cards
        data.items.forEach(recipe => {
            const recipeCard = new RecipeCard(recipe, (recipe) => this.showRecipeDetails(recipe));
            grid.appendChild(recipeCard.element);
        });
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
document.addEventListener('DOMContentLoaded', () => {
    initializeCommonComponents();
    window.recipeManager = new RecipeManager();
    
    // Make importRecipes function available globally
    window.importRecipes = () => {
        window.recipeManager.importRecipes();
    };

    // Expose ImportManager instance globally for the import modal event handlers
    window.importManager = window.recipeManager.importManager;
});

// Export for use in other modules
export { RecipeManager };