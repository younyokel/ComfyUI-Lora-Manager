import { app } from "../../scripts/app.js";

// Fixed sizes for component calculations
export const LORA_ENTRY_HEIGHT = 40; // Height of a single lora entry
export const CLIP_ENTRY_HEIGHT = 40; // Height of a clip entry
export const HEADER_HEIGHT = 40; // Height of the header section
export const CONTAINER_PADDING = 12; // Top and bottom padding
export const EMPTY_CONTAINER_HEIGHT = 100; // Height when no loras are present

// Parse LoRA entries from value
export function parseLoraValue(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [];
}

// Format LoRA data
export function formatLoraValue(loras) {
  return loras;
}

// Function to update widget height consistently
export function updateWidgetHeight(container, height, defaultHeight, node) {
  // Ensure minimum height
  const finalHeight = Math.max(defaultHeight, height);
  
  // Update CSS variables
  container.style.setProperty('--comfy-widget-min-height', `${finalHeight}px`);
  container.style.setProperty('--comfy-widget-height', `${finalHeight}px`);
  
  // Force node to update size after a short delay to ensure DOM is updated
  if (node) {
    setTimeout(() => {
      node.setDirtyCanvas(true, true);
    }, 10);
  }
}

// Determine if clip entry should be shown - now based on expanded property or initial diff values
export function shouldShowClipEntry(loraData) {
  // If expanded property exists, use that
  if (loraData.hasOwnProperty('expanded')) {
    return loraData.expanded;
  }
  // Otherwise use the legacy logic - if values differ, it should be expanded
  return Number(loraData.strength) !== Number(loraData.clipStrength);
}

// Helper function to sync clipStrength with strength when collapsed
export function syncClipStrengthIfCollapsed(loraData) {
  // If not expanded (collapsed), sync clipStrength with strength
  if (loraData.hasOwnProperty('expanded') && !loraData.expanded) {
    loraData.clipStrength = loraData.strength;
  }
  return loraData;
}

// Function to directly save the recipe without dialog
export async function saveRecipeDirectly() {
  try {
    const prompt = await app.graphToPrompt();
    // Show loading toast
    if (app && app.extensionManager && app.extensionManager.toast) {
      app.extensionManager.toast.add({
        severity: 'info',
        summary: 'Saving Recipe',
        detail: 'Please wait...',
        life: 2000
      });
    }
    
    // Send the request to the backend API
    const response = await fetch('/api/recipes/save-from-widget', {
      method: 'POST'
    });
    
    const result = await response.json();
    
    // Show result toast
    if (app && app.extensionManager && app.extensionManager.toast) {
      if (result.success) {
        app.extensionManager.toast.add({
          severity: 'success',
          summary: 'Recipe Saved',
          detail: 'Recipe has been saved successfully',
          life: 3000
        });
      } else {
        app.extensionManager.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: result.error || 'Failed to save recipe',
          life: 5000
        });
      }
    }
  } catch (error) {
    console.error('Error saving recipe:', error);
    
    // Show error toast
    if (app && app.extensionManager && app.extensionManager.toast) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save recipe: ' + (error.message || 'Unknown error'),
        life: 5000
      });
    }
  }
}
