import { state, getCurrentPageState } from '../state/index.js';
import { showToast } from './uiHelpers.js';

export class VirtualScroller {
    constructor(options) {
        // Configuration
        this.gridElement = options.gridElement;
        this.createItemFn = options.createItemFn;
        this.fetchItemsFn = options.fetchItemsFn;
        this.overscan = options.overscan || 5; // Extra items to render above/below viewport
        this.containerElement = options.containerElement || this.gridElement.parentElement;
        this.batchSize = options.batchSize || 50;
        this.pageSize = options.pageSize || 100;
        this.itemAspectRatio = 896/1152; // Aspect ratio of cards

        // State
        this.items = []; // All items metadata
        this.renderedItems = new Map(); // Map of rendered DOM elements by index
        this.totalItems = 0;
        this.isLoading = false;
        this.hasMore = true;
        this.lastScrollTop = 0;
        this.scrollDirection = 'down';
        this.lastRenderRange = { start: 0, end: 0 };
        this.pendingScroll = null;
        this.resizeObserver = null;

        // Responsive layout state
        this.itemWidth = 0;
        this.itemHeight = 0;
        this.columnsCount = 0;
        this.gridPadding = 12; // Gap between cards
        this.columnGap = 12; // Horizontal gap

        // Initialize
        this.initializeContainer();
        this.setupEventListeners();
        this.calculateLayout();
    }

    initializeContainer() {
        // Add virtual scroll class to grid
        this.gridElement.classList.add('virtual-scroll');

        // Set the container to have relative positioning
        if (getComputedStyle(this.containerElement).position === 'static') {
            this.containerElement.style.position = 'relative';
        }

        // Create a spacer element with the total height
        this.spacerElement = document.createElement('div');
        this.spacerElement.className = 'virtual-scroll-spacer';
        this.spacerElement.style.width = '100%';
        this.spacerElement.style.height = '0px'; // Will be updated as items are loaded
        this.spacerElement.style.pointerEvents = 'none';
        
        // The grid will be used for the actual visible items
        this.gridElement.style.position = 'relative';
        this.gridElement.style.minHeight = '0';
        
        // Place the spacer inside the grid container
        this.gridElement.appendChild(this.spacerElement);
    }

    calculateLayout() {
        // Get container width
        const containerWidth = this.containerElement.clientWidth;
        
        // Calculate ideal card width based on breakpoints
        let baseCardWidth = 260; // Default for 1080p

        // Adjust card width based on screen width
        if (window.innerWidth >= 3000) { // 4K
            baseCardWidth = 280;
        } else if (window.innerWidth >= 2000) { // 2K/1440p
            baseCardWidth = 270;
        }

        // Calculate how many columns can fit
        const availableWidth = Math.min(
            containerWidth, 
            window.innerWidth >= 3000 ? 2400 : // 4K
            window.innerWidth >= 2000 ? 1800 : // 2K
            1400 // 1080p
        );
        
        // Calculate column count based on available width and card width
        this.columnsCount = Math.max(1, Math.floor((availableWidth + this.columnGap) / (baseCardWidth + this.columnGap)));
        
        // Calculate actual item width based on container and column count
        this.itemWidth = (availableWidth - (this.columnsCount - 1) * this.columnGap) / this.columnsCount;
        
        // Calculate height based on aspect ratio
        this.itemHeight = this.itemWidth / this.itemAspectRatio;
        
        // Calculate the left offset to center the grid
        this.leftOffset = Math.max(0, (containerWidth - availableWidth) / 2);
        
        // Log layout info
        console.log('Virtual Scroll Layout:', {
            containerWidth,
            availableWidth,
            columnsCount: this.columnsCount,
            itemWidth: this.itemWidth,
            itemHeight: this.itemHeight,
            leftOffset: this.leftOffset
        });

        // Update grid element max-width to match available width
        this.gridElement.style.maxWidth = `${availableWidth}px`;
        
        // Update spacer height
        this.updateSpacerHeight();
        
        // Re-render with new layout
        this.clearRenderedItems();
        this.scheduleRender();
        
        return true;
    }

    setupEventListeners() {
        // Debounced scroll handler
        this.scrollHandler = this.debounce(() => this.handleScroll(), 10);
        this.containerElement.addEventListener('scroll', this.scrollHandler);
        
        // Window resize handler for layout recalculation
        this.resizeHandler = this.debounce(() => {
            this.calculateLayout();
        }, 150);
        
        window.addEventListener('resize', this.resizeHandler);
        
        // Use ResizeObserver for more accurate container size detection
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.debounce(() => {
                this.calculateLayout();
            }, 150));
            
            this.resizeObserver.observe(this.containerElement);
        }
    }

    async initialize() {
        try {
            await this.loadInitialBatch();
            this.scheduleRender();
        } catch (err) {
            console.error('Failed to initialize virtual scroller:', err);
            showToast('Failed to load items', 'error');
        }
    }

    async loadInitialBatch() {
        const pageState = getCurrentPageState();
        if (this.isLoading) return;
        
        this.isLoading = true;
        try {
            const { items, totalItems, hasMore } = await this.fetchItemsFn(1, this.pageSize);
            this.items = items || [];
            this.totalItems = totalItems || 0;
            this.hasMore = hasMore;
            
            // Update the spacer height based on the total number of items
            this.updateSpacerHeight();
            
            // Reset page state to sync with our virtual scroller
            pageState.currentPage = 2; // Next page to load would be 2
            pageState.hasMore = this.hasMore;
            pageState.isLoading = false;
            
            return { items, totalItems, hasMore };
        } catch (err) {
            console.error('Failed to load initial batch:', err);
            this.isLoading = false;
            throw err;
        }
    }

    async loadMoreItems() {
        const pageState = getCurrentPageState();
        if (this.isLoading || !this.hasMore) return;
        
        this.isLoading = true;
        pageState.isLoading = true;
        
        try {
            const { items, hasMore } = await this.fetchItemsFn(pageState.currentPage, this.pageSize);
            
            if (items && items.length > 0) {
                this.items = [...this.items, ...items];
                this.hasMore = hasMore;
                pageState.hasMore = hasMore;
                
                // Update page for next request
                pageState.currentPage++;
                
                // Update the spacer height
                this.updateSpacerHeight();
                
                // Render the newly loaded items if they're in view
                this.scheduleRender();
            } else {
                this.hasMore = false;
                pageState.hasMore = false;
            }
            
            return items;
        } catch (err) {
            console.error('Failed to load more items:', err);
            showToast('Failed to load more items', 'error');
        } finally {
            this.isLoading = false;
            pageState.isLoading = false;
        }
    }

    updateSpacerHeight() {
        if (this.columnsCount === 0) return;
        
        // Calculate total rows needed based on total items and columns
        const totalRows = Math.ceil(this.totalItems / this.columnsCount);
        const totalHeight = totalRows * this.itemHeight;
        
        // Update spacer height to represent all items
        this.spacerElement.style.height = `${totalHeight}px`;
    }

    getVisibleRange() {
        const scrollTop = this.containerElement.scrollTop;
        const viewportHeight = this.containerElement.clientHeight;
        
        // Calculate the visible row range
        const startRow = Math.floor(scrollTop / this.itemHeight);
        const endRow = Math.ceil((scrollTop + viewportHeight) / this.itemHeight);
        
        // Add overscan for smoother scrolling
        const overscanRows = this.overscan;
        const firstRow = Math.max(0, startRow - overscanRows);
        const lastRow = Math.min(Math.ceil(this.totalItems / this.columnsCount), endRow + overscanRows);
        
        // Calculate item indices
        const firstIndex = firstRow * this.columnsCount;
        const lastIndex = Math.min(this.totalItems, lastRow * this.columnsCount);
        
        return { start: firstIndex, end: lastIndex };
    }

    scheduleRender() {
        if (this.renderScheduled) return;
        
        this.renderScheduled = true;
        requestAnimationFrame(() => {
            this.renderItems();
            this.renderScheduled = false;
        });
    }

    renderItems() {
        if (this.items.length === 0 || this.columnsCount === 0) return;
        
        const { start, end } = this.getVisibleRange();
        
        // Check if render range has significantly changed
        const isSameRange = 
            start >= this.lastRenderRange.start && 
            end <= this.lastRenderRange.end &&
            Math.abs(start - this.lastRenderRange.start) < 10;
            
        if (isSameRange) return;
        
        this.lastRenderRange = { start, end };
        
        // Determine which items need to be added and removed
        const currentIndices = new Set();
        for (let i = start; i < end && i < this.items.length; i++) {
            currentIndices.add(i);
        }
        
        // Remove items that are no longer visible
        for (const [index, element] of this.renderedItems.entries()) {
            if (!currentIndices.has(index)) {
                element.remove();
                this.renderedItems.delete(index);
            }
        }
        
        // Add new visible items
        for (let i = start; i < end && i < this.items.length; i++) {
            if (!this.renderedItems.has(i)) {
                const item = this.items[i];
                const element = this.createItemElement(item, i);
                this.gridElement.appendChild(element);
                this.renderedItems.set(i, element);
            }
        }
        
        // If we're close to the end and have more items to load, fetch them
        if (end > this.items.length - (this.columnsCount * 2) && this.hasMore && !this.isLoading) {
            this.loadMoreItems();
        }
    }

    clearRenderedItems() {
        this.renderedItems.forEach(element => element.remove());
        this.renderedItems.clear();
        this.lastRenderRange = { start: 0, end: 0 };
    }

    refreshWithData(items, totalItems, hasMore) {
        this.items = items || [];
        this.totalItems = totalItems || 0;
        this.hasMore = hasMore;
        this.updateSpacerHeight();
        
        // Clear all rendered items and redraw
        this.clearRenderedItems();
        this.scheduleRender();
    }

    createItemElement(item, index) {
        // Create the DOM element
        const element = this.createItemFn(item);
        
        // Add virtual scroll item class
        element.classList.add('virtual-scroll-item');
        
        // Calculate the position
        const row = Math.floor(index / this.columnsCount);
        const col = index % this.columnsCount;
        
        // Calculate precise positions
        const topPos = row * this.itemHeight;
        const leftPos = this.leftOffset + (col * (this.itemWidth + this.columnGap));
        
        // Position the element with absolute positioning
        element.style.position = 'absolute';
        element.style.left = `${leftPos}px`;
        element.style.top = `${topPos}px`;
        element.style.width = `${this.itemWidth}px`;
        element.style.height = `${this.itemHeight}px`;
        
        return element;
    }

    handleScroll() {
        // Determine scroll direction
        const scrollTop = this.containerElement.scrollTop;
        this.scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
        this.lastScrollTop = scrollTop;
        
        // Render visible items
        this.scheduleRender();
        
        // If we're near the bottom and have more items, load them
        const { clientHeight, scrollHeight } = this.containerElement;
        const scrollBottom = scrollTop + clientHeight;
        const scrollThreshold = scrollHeight - (this.itemHeight * this.overscan);
        
        if (scrollBottom >= scrollThreshold && this.hasMore && !this.isLoading) {
            this.loadMoreItems();
        }
    }

    reset() {
        // Remove all rendered items
        this.clearRenderedItems();
        
        // Reset state
        this.items = [];
        this.totalItems = 0;
        this.hasMore = true;
        
        // Reset spacer height
        this.spacerElement.style.height = '0px';
        
        // Schedule a re-render
        this.scheduleRender();
    }

    dispose() {
        // Remove event listeners
        this.containerElement.removeEventListener('scroll', this.scrollHandler);
        window.removeEventListener('resize', this.resizeHandler);
        
        // Clean up the resize observer if present
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        // Remove rendered elements
        this.clearRenderedItems();
        
        // Remove spacer
        this.spacerElement.remove();
        
        // Remove virtual scroll class
        this.gridElement.classList.remove('virtual-scroll');
    }

    // Utility method for debouncing
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
}
