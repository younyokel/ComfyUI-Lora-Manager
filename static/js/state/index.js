export const state = {
    currentPage: 1,
    isLoading: false,
    hasMore: true,
    sortBy: 'name',
    activeFolder: null,
    loadingManager: null,
    observer: null,
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
    settings: {
        blurMatureContent: true,
        show_only_sfw: false
    }
};

// Initialize settings from localStorage if available
export function initSettings() {
    try {
        const savedSettings = localStorage.getItem('loraManagerSettings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            state.settings = { ...state.settings, ...parsedSettings };
        }
    } catch (error) {
        console.error('Error loading settings from localStorage:', error);
    }
}

// Save settings to localStorage
export function saveSettings() {
    try {
        localStorage.setItem('loraManagerSettings', JSON.stringify(state.settings));
    } catch (error) {
        console.error('Error saving settings to localStorage:', error);
    }
}

// Initialize settings on load
initSettings();