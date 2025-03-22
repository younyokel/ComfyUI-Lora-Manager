// Create the new hierarchical state structure
import { getStorageItem } from '../utils/storageHelpers.js';

// Load settings from localStorage or use defaults
const savedSettings = getStorageItem('settings', {
    blurMatureContent: true,
    show_only_sfw: false
});

export const state = {
    // Global state
    global: {
        settings: savedSettings,
        loadingManager: null,
        observer: null,
    },
    
    // Page-specific states
    pages: {
        loras: {
            currentPage: 1,
            isLoading: false,
            hasMore: true,
            sortBy: 'name',
            activeFolder: null,
            previewVersions: new Map(),
            searchManager: null,
            searchOptions: {
                filename: true,
                modelname: true,
                tags: false,
                recursive: false
            },
            filters: {
                baseModel: [],
                tags: []
            },
            bulkMode: false,
            selectedLoras: new Set(),
            loraMetadataCache: new Map(),
        },
        
        recipes: {
            currentPage: 1,
            isLoading: false,
            hasMore: true,
            sortBy: 'date',
            searchManager: null,
            searchOptions: {
                title: true,
                tags: true,
                loraName: true,
                loraModel: true
            },
            filters: {
                baseModel: [],
                tags: [],
                search: ''
            },
            pageSize: 20
        },
        
        checkpoints: {
            currentPage: 1,
            isLoading: false,
            hasMore: true,
            sortBy: 'name',
            activeFolder: null,
            searchManager: null,
            searchOptions: {
                filename: true,
                modelname: true,
                recursive: false
            },
            filters: {
                baseModel: [],
                tags: []
            }
        }
    },
    
    // Current active page
    currentPageType: 'loras',
    
    // Backward compatibility - proxy properties
    get currentPage() { return this.pages[this.currentPageType].currentPage; },
    set currentPage(value) { this.pages[this.currentPageType].currentPage = value; },
    
    get isLoading() { return this.pages[this.currentPageType].isLoading; },
    set isLoading(value) { this.pages[this.currentPageType].isLoading = value; },
    
    get hasMore() { return this.pages[this.currentPageType].hasMore; },
    set hasMore(value) { this.pages[this.currentPageType].hasMore = value; },
    
    get sortBy() { return this.pages[this.currentPageType].sortBy; },
    set sortBy(value) { this.pages[this.currentPageType].sortBy = value; },
    
    get activeFolder() { return this.pages[this.currentPageType].activeFolder; },
    set activeFolder(value) { this.pages[this.currentPageType].activeFolder = value; },
    
    get loadingManager() { return this.global.loadingManager; },
    set loadingManager(value) { this.global.loadingManager = value; },
    
    get observer() { return this.global.observer; },
    set observer(value) { this.global.observer = value; },
    
    get previewVersions() { return this.pages.loras.previewVersions; },
    set previewVersions(value) { this.pages.loras.previewVersions = value; },
    
    get searchManager() { return this.pages[this.currentPageType].searchManager; },
    set searchManager(value) { this.pages[this.currentPageType].searchManager = value; },
    
    get searchOptions() { return this.pages[this.currentPageType].searchOptions; },
    set searchOptions(value) { this.pages[this.currentPageType].searchOptions = value; },
    
    get filters() { return this.pages[this.currentPageType].filters; },
    set filters(value) { this.pages[this.currentPageType].filters = value; },
    
    get bulkMode() { return this.pages.loras.bulkMode; },
    set bulkMode(value) { this.pages.loras.bulkMode = value; },
    
    get selectedLoras() { return this.pages.loras.selectedLoras; },
    set selectedLoras(value) { this.pages.loras.selectedLoras = value; },
    
    get loraMetadataCache() { return this.pages.loras.loraMetadataCache; },
    set loraMetadataCache(value) { this.pages.loras.loraMetadataCache = value; },
    
    get settings() { return this.global.settings; },
    set settings(value) { this.global.settings = value; }
};

// Get the current page state
export function getCurrentPageState() {
    return state.pages[state.currentPageType];
}

// Set the current page type
export function setCurrentPageType(pageType) {
    if (state.pages[pageType]) {
        state.currentPageType = pageType;
        return true;
    }
    console.warn(`Unknown page type: ${pageType}`);
    return false;
}

// Initialize page state when a page loads
export function initPageState(pageType) {
    if (setCurrentPageType(pageType)) {
        console.log(`Initialized state for page: ${pageType}`);
        return getCurrentPageState();
    }
    return null;
}