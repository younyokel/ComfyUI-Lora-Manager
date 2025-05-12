import { state, getCurrentPageState } from '../state/index.js';
import { debounce } from './debounce.js';
import { VirtualScroller } from './VirtualScroller.js';
import { createLoraCard } from '../components/LoraCard.js';
import { fetchLorasPage } from '../api/loraApi.js';
import { showToast } from './uiHelpers.js';

// Function to dynamically import the appropriate card creator based on page type
async function getCardCreator(pageType) {
    if (pageType === 'loras') {
        return createLoraCard;
    } else if (pageType === 'recipes') {
        try {
            const { createRecipeCard } = await import('../components/RecipeCard.js');
            return createRecipeCard;
        } catch (err) {
            console.error('Failed to load recipe card creator:', err);
            return null;
        }
    } else if (pageType === 'checkpoints') {
        try {
            const { createCheckpointCard } = await import('../components/CheckpointCard.js');
            return createCheckpointCard;
        } catch (err) {
            console.error('Failed to load checkpoint card creator:', err);
            return null;
        }
    }
    return null;
}

// Function to get the appropriate data fetcher based on page type
async function getDataFetcher(pageType) {
    if (pageType === 'loras') {
        return fetchLorasPage;
    } else if (pageType === 'recipes') {
        try {
            const { fetchRecipesPage } = await import('../api/recipeApi.js');
            return fetchRecipesPage;
        } catch (err) {
            console.error('Failed to load recipe data fetcher:', err);
            return null;
        }
    } else if (pageType === 'checkpoints') {
        try {
            const { fetchCheckpointsPage } = await import('../api/checkpointApi.js');
            return fetchCheckpointsPage;
        } catch (err) {
            console.error('Failed to load checkpoint data fetcher:', err);
            return null;
        }
    }
    return null;
}

export async function initializeInfiniteScroll(pageType = 'loras') {
    // Clean up any existing virtual scroller
    if (state.virtualScroller) {
        state.virtualScroller.dispose();
        state.virtualScroller = null;
    }

    // Set the current page type
    state.currentPageType = pageType;
    
    // Get the current page state
    const pageState = getCurrentPageState();
    
    // Skip initializing if in duplicates mode (for recipes page)
    if (pageType === 'recipes' && pageState.duplicatesMode) {
        return;
    }

    // Use virtual scrolling for all page types
    await initializeVirtualScroll(pageType);
}

async function initializeVirtualScroll(pageType) {
    // Determine the grid ID based on page type
    let gridId;
    
    switch (pageType) {
        case 'recipes':
            gridId = 'recipeGrid';
            break;
        case 'checkpoints':
            gridId = 'checkpointGrid';
            break;
        case 'loras':
        default:
            gridId = 'loraGrid';
            break;
    }

    const grid = document.getElementById(gridId);
    
    if (!grid) {
        console.warn(`Grid with ID "${gridId}" not found for virtual scroll`);
        return;
    }
    
    // Change this line to get the actual scrolling container
    const pageContainer = document.querySelector('.page-content');
    const pageContent = pageContainer.querySelector('.container');
    
    if (!pageContent) {
        console.warn('Page content element not found for virtual scroll');
        return;
    }
    
    try {
        // Get the card creator and data fetcher for this page type
        const createCardFn = await getCardCreator(pageType);
        const fetchDataFn = await getDataFetcher(pageType);
        
        if (!createCardFn || !fetchDataFn) {
            throw new Error(`Required components not available for ${pageType} page`);
        }
        
        // Pass the correct scrolling container
        state.virtualScroller = new VirtualScroller({
            gridElement: grid,
            containerElement: pageContent,
            scrollContainer: pageContainer, // Add this new parameter
            createItemFn: createCardFn,
            fetchItemsFn: fetchDataFn,
            pageSize: 100,
            rowGap: 20 // Add consistent vertical spacing between rows
        });
        
        // Initialize the virtual scroller
        await state.virtualScroller.initialize();
        
        // Add grid class for CSS styling
        grid.classList.add('virtual-scroll');
        
    } catch (error) {
        console.error(`Error initializing virtual scroller for ${pageType}:`, error);
        showToast(`Failed to initialize ${pageType} page. Please reload.`, 'error');
        
        // Fallback: show a message in the grid
        grid.innerHTML = `
            <div class="placeholder-message">
                <h3>Failed to initialize ${pageType}</h3>
                <p>There was an error loading this page. Please try reloading.</p>
            </div>
        `;
    }
}

// Export a method to refresh the virtual scroller when filters change
export function refreshVirtualScroll() {
    if (state.virtualScroller) {
        state.virtualScroller.reset();
        state.virtualScroller.initialize();
    }
}