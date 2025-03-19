import { BASE_MODELS, BASE_MODEL_CLASSES } from '../utils/constants.js';
import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from '../utils/uiHelpers.js';
import { resetAndReload } from '../api/loraApi.js';

export class FilterManager {
    constructor() {
        const pageState = getCurrentPageState();
        this.filters = pageState.filters || {
            baseModel: [],
            tags: []
        };
        
        this.filterPanel = document.getElementById('filterPanel');
        this.filterButton = document.getElementById('filterButton');
        this.activeFiltersCount = document.getElementById('activeFiltersCount');
        this.tagsLoaded = false;
        
        this.initialize();
    }
    
    initialize() {
        // Create base model filter tags
        this.createBaseModelTags();

        // Add click handler for filter button
        if (this.filterButton) {
            this.filterButton.addEventListener('click', () => {
                this.toggleFilterPanel();
            });
        }
        
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
    
    async loadTopTags() {
        try {
            // Show loading state
            const tagsContainer = document.getElementById('modelTagsFilter');
            if (tagsContainer) {
                tagsContainer.innerHTML = '<div class="tags-loading">Loading tags...</div>';
            }
            
            const response = await fetch('/api/top-tags?limit=20');
            if (!response.ok) throw new Error('Failed to fetch tags');
            
            const data = await response.json();
            console.log('Top tags:', data);
            if (data.success && data.tags) {
                this.createTagFilterElements(data.tags);
                
                // After creating tag elements, mark any previously selected ones
                this.updateTagSelections();
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error loading top tags:', error);
            const tagsContainer = document.getElementById('modelTagsFilter');
            if (tagsContainer) {
                tagsContainer.innerHTML = '<div class="tags-error">Failed to load tags</div>';
            }
        }
    }
    
    createTagFilterElements(tags) {
        const tagsContainer = document.getElementById('modelTagsFilter');
        if (!tagsContainer) return;
        
        tagsContainer.innerHTML = '';
        
        if (!tags.length) {
            tagsContainer.innerHTML = '<div class="no-tags">No tags available</div>';
            return;
        }
        
        tags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = 'filter-tag tag-filter';
            // {tag: "name", count: number}
            const tagName = tag.tag;
            tagEl.dataset.tag = tagName;
            tagEl.innerHTML = `${tagName} <span class="tag-count">${tag.count}</span>`;
            
            // Add click handler to toggle selection and automatically apply
            tagEl.addEventListener('click', async () => {
                tagEl.classList.toggle('active');
                
                if (tagEl.classList.contains('active')) {
                    if (!this.filters.tags.includes(tagName)) {
                        this.filters.tags.push(tagName);
                    }
                } else {
                    this.filters.tags = this.filters.tags.filter(t => t !== tagName);
                }
                
                this.updateActiveFiltersCount();
                
                // Auto-apply filter when tag is clicked
                await this.applyFilters(false);
            });
            
            tagsContainer.appendChild(tagEl);
        });
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
        if (this.filterPanel) {
            const isHidden = this.filterPanel.classList.contains('hidden');
            
            if (isHidden) {
                // Update panel positions before showing
                if (window.searchManager && typeof window.searchManager.updatePanelPositions === 'function') {
                    window.searchManager.updatePanelPositions();
                } else if (typeof updatePanelPositions === 'function') {
                    updatePanelPositions();
                }
                
                this.filterPanel.classList.remove('hidden');
                this.filterButton.classList.add('active');
                
                // Load tags if they haven't been loaded yet
                if (!this.tagsLoaded) {
                    this.loadTopTags();
                    this.tagsLoaded = true;
                }
            } else {
                this.closeFilterPanel();
            }
        }
    }
    
    closeFilterPanel() {
        this.filterPanel.classList.add('hidden');
        this.filterButton.classList.remove('active');
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
        
        // Update model tags
        const modelTags = document.querySelectorAll('.tag-filter');
        modelTags.forEach(tag => {
            const tagName = tag.dataset.tag;
            if (this.filters.tags.includes(tagName)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
    }
    
    updateActiveFiltersCount() {
        const totalActiveFilters = this.filters.baseModel.length + this.filters.tags.length;
        
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
        const pageState = getCurrentPageState();
        pageState.filters = { ...this.filters };
        
        // Reload loras with filters applied
        await resetAndReload();
        
        // Update filter button to show active state
        if (this.hasActiveFilters()) {
            this.filterButton.classList.add('active');
            if (showToastNotification) {
                const baseModelCount = this.filters.baseModel.length;
                const tagsCount = this.filters.tags.length;
                
                let message = '';
                if (baseModelCount > 0 && tagsCount > 0) {
                    message = `Filtering by ${baseModelCount} base model${baseModelCount > 1 ? 's' : ''} and ${tagsCount} tag${tagsCount > 1 ? 's' : ''}`;
                } else if (baseModelCount > 0) {
                    message = `Filtering by ${baseModelCount} base model${baseModelCount > 1 ? 's' : ''}`;
                } else if (tagsCount > 0) {
                    message = `Filtering by ${tagsCount} tag${tagsCount > 1 ? 's' : ''}`;
                }
                
                showToast(message, 'success');
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
            baseModel: [],
            tags: []
        };
        
        // Update state
        const pageState = getCurrentPageState();
        pageState.filters = { ...this.filters };
        
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
                const parsedFilters = JSON.parse(savedFilters);
                
                // Ensure backward compatibility with older filter format
                this.filters = {
                    baseModel: parsedFilters.baseModel || [],
                    tags: parsedFilters.tags || []
                };
                
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
        return this.filters.baseModel.length > 0 || this.filters.tags.length > 0;
    }
}
