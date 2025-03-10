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
    filters: {
        baseModel: [],
        tags: []  // Make sure tags are included in state
    },
    bulkMode: false,
    selectedLoras: new Set(),
    loraMetadataCache: new Map()
};