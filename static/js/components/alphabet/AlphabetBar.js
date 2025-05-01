// AlphabetBar.js - Component for alphabet filtering
import { getCurrentPageState, setCurrentPageType } from '../../state/index.js';
import { getStorageItem, setStorageItem } from '../../utils/storageHelpers.js';
import { resetAndReload } from '../../api/loraApi.js';

/**
 * AlphabetBar class - Handles the alphabet filtering UI and interactions
 */
export class AlphabetBar {
    constructor(pageType = 'loras') {
        // Store the page type
        this.pageType = pageType;
        
        // Get the current page state
        this.pageState = getCurrentPageState();
        
        // Initialize letter counts
        this.letterCounts = {};
        
        // Initialize the component
        this.initializeComponent();
    }
    
    /**
     * Initialize the alphabet bar component
     */
    async initializeComponent() {
        // Get letter counts from API
        await this.fetchLetterCounts();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Restore the active letter filter from storage if available
        this.restoreActiveLetterFilter();
    }
    
    /**
     * Fetch letter counts from the API
     */
    async fetchLetterCounts() {
        try {
            const response = await fetch('/api/loras/letter-counts');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch letter counts: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.letter_counts) {
                this.letterCounts = data.letter_counts;
                
                // Update the count display in the UI
                this.updateLetterCountsDisplay();
            }
        } catch (error) {
            console.error('Error fetching letter counts:', error);
        }
    }
    
    /**
     * Update the letter counts display in the UI
     */
    updateLetterCountsDisplay() {
        const letterChips = document.querySelectorAll('.letter-chip');
        
        letterChips.forEach(chip => {
            const letter = chip.dataset.letter;
            const countSpan = chip.querySelector('.count');
            const count = this.letterCounts[letter] || 0;
            
            // Update the count display
            if (countSpan) {
                if (count > 0) {
                    countSpan.textContent = ` (${count})`;
                    chip.title = `${letter}: ${count} LoRAs`;
                    chip.classList.remove('disabled');
                } else {
                    countSpan.textContent = '';
                    chip.title = `${letter}: No LoRAs`;
                    chip.classList.add('disabled');
                }
            }
        });
    }
    
    /**
     * Initialize event listeners for the alphabet bar
     */
    initEventListeners() {
        const alphabetBar = document.querySelector('.alphabet-bar');
        
        if (alphabetBar) {
            // Use event delegation for letter chips
            alphabetBar.addEventListener('click', (e) => {
                const letterChip = e.target.closest('.letter-chip');
                
                if (letterChip && !letterChip.classList.contains('disabled')) {
                    this.handleLetterClick(letterChip);
                }
            });
            
            // Add keyboard shortcut listeners
            document.addEventListener('keydown', (e) => {
                // Alt + letter shortcuts
                if (e.altKey && !e.ctrlKey && !e.metaKey) {
                    const key = e.key.toUpperCase();
                    
                    // Check if it's a letter A-Z
                    if (/^[A-Z]$/.test(key)) {
                        const letterChip = document.querySelector(`.letter-chip[data-letter="${key}"]`);
                        
                        if (letterChip && !letterChip.classList.contains('disabled')) {
                            this.handleLetterClick(letterChip);
                            e.preventDefault();
                        }
                    } 
                    // Special cases for non-letter filters
                    else if (e.key === '0' || e.key === ')') {
                        // Alt+0 for numbers (#)
                        const letterChip = document.querySelector('.letter-chip[data-letter="#"]');
                        
                        if (letterChip && !letterChip.classList.contains('disabled')) {
                            this.handleLetterClick(letterChip);
                            e.preventDefault();
                        }
                    } else if (e.key === '2' || e.key === '@') {
                        // Alt+@ for special characters
                        const letterChip = document.querySelector('.letter-chip[data-letter="@"]');
                        
                        if (letterChip && !letterChip.classList.contains('disabled')) {
                            this.handleLetterClick(letterChip);
                            e.preventDefault();
                        }
                    } else if (e.key === 'c' || e.key === 'C') {
                        // Alt+C for CJK characters
                        const letterChip = document.querySelector('.letter-chip[data-letter="漢"]');
                        
                        if (letterChip && !letterChip.classList.contains('disabled')) {
                            this.handleLetterClick(letterChip);
                            e.preventDefault();
                        }
                    }
                }
            });
        }
    }
    
    /**
     * Handle letter chip click
     * @param {HTMLElement} letterChip - The letter chip that was clicked
     */
    handleLetterClick(letterChip) {
        const letter = letterChip.dataset.letter;
        const wasActive = letterChip.classList.contains('active');
        
        // Remove active class from all letter chips
        document.querySelectorAll('.letter-chip').forEach(chip => {
            chip.classList.remove('active');
        });
        
        if (!wasActive) {
            // Set the new active letter
            letterChip.classList.add('active');
            this.pageState.activeLetterFilter = letter;
            
            // Save to storage
            setStorageItem(`${this.pageType}_activeLetterFilter`, letter);
        } else {
            // Clear the active letter filter
            this.pageState.activeLetterFilter = null;
            
            // Remove from storage
            setStorageItem(`${this.pageType}_activeLetterFilter`, null);
        }
        
        // Trigger a reload with the new filter
        resetAndReload(true);
    }
    
    /**
     * Restore the active letter filter from storage
     */
    restoreActiveLetterFilter() {
        const activeLetterFilter = getStorageItem(`${this.pageType}_activeLetterFilter`);
        
        if (activeLetterFilter) {
            const letterChip = document.querySelector(`.letter-chip[data-letter="${activeLetterFilter}"]`);
            
            if (letterChip && !letterChip.classList.contains('disabled')) {
                letterChip.classList.add('active');
                this.pageState.activeLetterFilter = activeLetterFilter;
            }
        }
    }
    
    /**
     * Clear the active letter filter
     */
    clearActiveLetterFilter() {
        // Remove active class from all letter chips
        document.querySelectorAll('.letter-chip').forEach(chip => {
            chip.classList.remove('active');
        });
        
        // Clear the active letter filter
        this.pageState.activeLetterFilter = null;
        
        // Remove from storage
        setStorageItem(`${this.pageType}_activeLetterFilter`, null);
    }
    
    /**
     * Update letter counts with new data
     * @param {Object} newCounts - New letter count data
     */
    updateCounts(newCounts) {
        this.letterCounts = { ...newCounts };
        this.updateLetterCountsDisplay();
    }
}