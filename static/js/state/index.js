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
    loraMetadataCache: new Map()
};