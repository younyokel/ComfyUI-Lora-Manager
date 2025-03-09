// Recipe manager module
import { showToast } from './utils/uiHelpers.js';
import { state } from './state/index.js';

class RecipeManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 20;
        this.sortBy = 'date';
        this.filterParams = {};
        
        this.init();
    }
    
    init() {
        // Initialize event listeners
        this.initEventListeners();
        
        // Load initial set of recipes
        this.loadRecipes();
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
            const card = this.createRecipeCard(recipe);
            grid.appendChild(card);
        });
    }
    
    createRecipeCard(recipe) {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.filePath = recipe.file_path;
        card.dataset.title = recipe.title;
        card.dataset.created = recipe.created_date;

        console.log(recipe);
        
        // 获取 base model
        const baseModel = recipe.base_model || '';
        
        // 确保 loras 数组存在
        const lorasCount = recipe.loras ? recipe.loras.length : 0;
        
        // Ensure file_url exists, fallback to file_path if needed
        const imageUrl = recipe.file_url || 
                         (recipe.file_path ? `/loras_static/root1/preview/${recipe.file_path.split('/').pop()}` : 
                         '/loras_static/images/no-preview.png');

        card.innerHTML = `
            <div class="recipe-indicator" title="Recipe">R</div>
            <div class="card-preview">
                <img src="${imageUrl}" alt="${recipe.title}">
                <div class="card-header">
                    <div class="base-model-wrapper">
                        ${baseModel ? `<span class="base-model-label" title="${baseModel}">${baseModel}</span>` : ''}
                    </div>
                    <div class="card-actions">
                        <i class="fas fa-share-alt" title="Share Recipe"></i>
                        <i class="fas fa-copy" title="Copy Recipe"></i>
                        <i class="fas fa-trash" title="Delete Recipe"></i>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="model-info">
                        <span class="model-name">${recipe.title}</span>
                    </div>
                    <div class="lora-count" title="Number of LoRAs in this recipe">
                        <i class="fas fa-layer-group"></i> ${lorasCount}
                    </div>
                </div>
            </div>
        `;
        
        // Recipe card click event
        card.addEventListener('click', () => {
            this.showRecipeDetails(recipe);
        });
        
        // Share button click event - prevent propagation to card
        card.querySelector('.fa-share-alt')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // TODO: Implement share functionality
            showToast('Share functionality will be implemented later', 'info');
        });
        
        // Copy button click event - prevent propagation to card
        card.querySelector('.fa-copy')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // TODO: Implement copy functionality
            showToast('Copy functionality will be implemented later', 'info');
        });
        
        // Delete button click event - prevent propagation to card
        card.querySelector('.fa-trash')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // TODO: Implement delete functionality
            showToast('Delete functionality will be implemented later', 'info');
        });
        
        return card;
    }
    
    // Add a placeholder for recipe details method
    showRecipeDetails(recipe) {
        // TODO: Implement recipe details view
        console.log('Recipe details:', recipe);
        showToast(`Viewing ${recipe.title}`, 'info');
    }
    
    // Will be implemented later:
    // - Recipe details view
    // - Recipe tag filtering
    // - Recipe search and filters
}

// Initialize recipe manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.recipeManager = new RecipeManager();
});

// Export for use in other modules
export { RecipeManager }; 