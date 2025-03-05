import { BASE_MODELS, BASE_MODEL_CLASSES } from '../utils/constants.js';
import { state } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { resetAndReload } from '../api/loraApi.js';

export class FilterManager {
    constructor() {
        this.filters = {
            baseModel: []
        };
        
        this.filterPanel = document.getElementById('filterPanel');
        this.filterButton = document.getElementById('filterButton');
        this.activeFiltersCount = document.getElementById('activeFiltersCount');
        
        this.initialize();
    }
    
    initialize() {
        // Create base model filter tags
        this.createBaseModelTags();
        
        // Close filter panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.filterPanel.contains(e.target) && 
                e.target !== this.filterButton &&
                !this.filterButton.contains(e.target) &&
                !this.filterPanel.classList.contains('hidden')) {
                this.closeFilterPanel();
            }
        });
        
        // Initialize active filters from localStorage if available
        this.loadFiltersFromStorage();
    }
    
    createBaseModelTags() {
        const baseModelTagsContainer = document.getElementById('baseModelTags');
        if (!baseModelTagsContainer) return;
        
        baseModelTagsContainer.innerHTML = '';
        
        Object.entries(BASE_MODELS).forEach(([key, value]) => {
            const tag = document.createElement('div');
            tag.className = `filter-tag base-model-tag ${BASE_MODEL_CLASSES[value]}`;
            tag.dataset.baseModel = value;
            tag.innerHTML = value;
            
            // Add click handler to toggle selection and automatically apply
            tag.addEventListener('click', async () => {
                tag.classList.toggle('active');
                
                if (tag.classList.contains('active')) {
                    if (!this.filters.baseModel.includes(value)) {
                        this.filters.baseModel.push(value);
                    }
                } else {
                    this.filters.baseModel = this.filters.baseModel.filter(model => model !== value);
                }
                
                this.updateActiveFiltersCount();
                
                // Auto-apply filter when tag is clicked
                await this.applyFilters(false);
            });
            
            baseModelTagsContainer.appendChild(tag);
        });
    }
    
    toggleFilterPanel() {
        this.filterPanel.classList.toggle('hidden');
        
        // Mark selected filters
        if (!this.filterPanel.classList.contains('hidden')) {
            this.updateTagSelections();
        }
    }
    
    closeFilterPanel() {
        this.filterPanel.classList.add('hidden');
    }
    
    updateTagSelections() {
        // Update base model tags
        const baseModelTags = document.querySelectorAll('.base-model-tag');
        baseModelTags.forEach(tag => {
            const baseModel = tag.dataset.baseModel;
            if (this.filters.baseModel.includes(baseModel)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
    }
    
    updateActiveFiltersCount() {
        const totalActiveFilters = this.filters.baseModel.length;
        
        if (totalActiveFilters > 0) {
            this.activeFiltersCount.textContent = totalActiveFilters;
            this.activeFiltersCount.style.display = 'inline-flex';
        } else {
            this.activeFiltersCount.style.display = 'none';
        }
    }
    
    async applyFilters(showToastNotification = true) {
        // Save filters to localStorage
        localStorage.setItem('loraFilters', JSON.stringify(this.filters));
        
        // Update state with current filters
        state.filters = { ...this.filters };
        
        // Reload loras with filters applied
        await resetAndReload();
        
        // Update filter button to show active state
        if (this.hasActiveFilters()) {
            this.filterButton.classList.add('active');
            if (showToastNotification) {
                showToast(`Filtering by ${this.filters.baseModel.length} base models`, 'success');
            }
        } else {
            this.filterButton.classList.remove('active');
            if (showToastNotification) {
                showToast('Filters cleared', 'info');
            }
        }
    }
    
    async clearFilters() {
        // Clear all filters
        this.filters = {
            baseModel: []
        };
        
        // Update state
        state.filters = { ...this.filters };
        
        // Update UI
        this.updateTagSelections();
        this.updateActiveFiltersCount();
        
        // Remove from localStorage
        localStorage.removeItem('loraFilters');
        
        // Update UI and reload data
        this.filterButton.classList.remove('active');
        await resetAndReload();
    }
    
    loadFiltersFromStorage() {
        const savedFilters = localStorage.getItem('loraFilters');
        if (savedFilters) {
            try {
                this.filters = JSON.parse(savedFilters);
                this.updateTagSelections();
                this.updateActiveFiltersCount();
                
                if (this.hasActiveFilters()) {
                    this.filterButton.classList.add('active');
                }
            } catch (error) {
                console.error('Error loading filters from storage:', error);
            }
        }
    }
    
    hasActiveFilters() {
        return this.filters.baseModel.length > 0;
    }
}
