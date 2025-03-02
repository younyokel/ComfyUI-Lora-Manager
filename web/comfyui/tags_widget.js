export function addTagsWidget(node, name, opts, callback) {
  // Create container for tags
  const container = document.createElement("div");
  container.className = "comfy-tags-container";
  Object.assign(container.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    padding: "6px",
    minHeight: "30px",
    backgroundColor: "rgba(40, 44, 52, 0.6)",  // Darker, more modern background
    borderRadius: "6px",    // Slightly larger radius
    width: "100%",
  });

  // Initialize default value as array
  const defaultValue = opts?.defaultVal || [];
  let initialTagsData = [];
  
  try {
    // Convert string input to array if needed
    initialTagsData = typeof defaultValue === 'string' ? 
      JSON.parse(defaultValue) : (Array.isArray(defaultValue) ? defaultValue : []);
  } catch (e) {
    console.warn("Invalid default tags data format", e);
  }

  // Normalize tag data to ensure consistent format
  const normalizeTagData = (data) => {
    if (!Array.isArray(data)) return [];
    
    return data.map(item => {
      // If it's already in the correct format, return as is
      if (item && typeof item === 'object' && 'text' in item) {
        return {
          text: item.text,
          active: item.active !== undefined ? item.active : true
        };
      } 
      // If it's just a string, convert to object
      else if (typeof item === 'string') {
        return { text: item, active: true };
      }
      // Default fallback
      return { text: String(item), active: true };
    });
  };

  // Function to render tags from array data
  const renderTags = (tagsData, widget) => {
    // Clear existing tags
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Ensure we're working with normalized data
    const normalizedTags = normalizeTagData(tagsData);

    normalizedTags.forEach((tagData) => {
      const { text, active } = tagData;
      const tagEl = document.createElement("div");
      tagEl.className = "comfy-tag";
      
      updateTagStyle(tagEl, active);

      tagEl.textContent = text;
      tagEl.title = text; // Set tooltip for full content

      // Add click handler to toggle state
      tagEl.addEventListener("click", (e) => {
        e.stopPropagation();

        // Toggle active state for this tag
        const updatedTags = [...widget.value];
        const tagIndex = updatedTags.findIndex((t) => t.text === text);

        if (tagIndex >= 0) {
          updatedTags[tagIndex].active = !updatedTags[tagIndex].active;
          updateTagStyle(tagEl, updatedTags[tagIndex].active);

          // Update widget value and trigger callback
          widget.value = updatedTags;
          widget.callback?.(updatedTags);
        }
      });

      container.appendChild(tagEl);
    });
  };

  // Helper function to update tag style based on active state
  function updateTagStyle(tagEl, active) {
    const baseStyles = {
      padding: "6px 12px",    // 水平内边距从16px减小到12px
      borderRadius: "6px",    // Matching container radius
      maxWidth: "200px",      // Increased max width
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "13px",       // Slightly larger font
      cursor: "pointer",
      transition: "all 0.2s ease",  // Smoother transition
      border: "1px solid transparent",
      display: "inline-block",
      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
      margin: "4px",          // 从6px减小到4px
    };

    if (active) {
      Object.assign(tagEl.style, {
        ...baseStyles,
        backgroundColor: "rgba(66, 153, 225, 0.9)",  // Modern blue
        color: "white",
        borderColor: "rgba(66, 153, 225, 0.9)",
      });
    } else {
      Object.assign(tagEl.style, {
        ...baseStyles,
        backgroundColor: "rgba(45, 55, 72, 0.7)",    // Darker inactive state
        color: "rgba(226, 232, 240, 0.8)",          // Lighter text for contrast
        borderColor: "rgba(226, 232, 240, 0.2)",
      });
    }

    // Add hover effect
    tagEl.onmouseenter = () => {
      tagEl.style.transform = "translateY(-1px)";
      tagEl.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15)";
    };

    tagEl.onmouseleave = () => {
      tagEl.style.transform = "translateY(0)";
      tagEl.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
    };
  }

  // Store the value as array
  let widgetValue = normalizeTagData(initialTagsData);

  // Create widget with initial properties
  const widget = node.addDOMWidget(name, "tags", container, {
    getValue: function() {
      return widgetValue;
    },
    setValue: function(v) {
      // Handle input formats but always normalize to array
      try {
        if (typeof v === "string") {
          // If JSON string, parse it
          if (v.startsWith("[") || v.startsWith("{")) {
            const parsed = JSON.parse(v);
            widgetValue = normalizeTagData(parsed);
          } else {
            // If it's a comma-separated string of tags
            const tagStrings = v
              .split(",")
              .map((word) => word.trim())
              .filter((word) => word);

            // Preserve active states from existing tags where possible
            const existingTagsMap = {};
            widgetValue.forEach((tag) => {
              existingTagsMap[tag.text] = tag.active;
            });

            widgetValue = tagStrings.map((text) => ({
              text,
              active: text in existingTagsMap ? existingTagsMap[text] : true,
            }));
          }
        } else if (Array.isArray(v)) {
          // Directly use array input but ensure proper format
          widgetValue = normalizeTagData(v);
        } else {
          // Default to empty array for invalid inputs
          widgetValue = [];
        }
      } catch (e) {
        console.warn("Error formatting tags value:", e);
        // Keep existing value if there's an error
      }

      renderTags(widgetValue, widget);
    },
    getHeight: function() {
      // Calculate height based on content
      return Math.max(
        150,
        Math.ceil(container.scrollHeight / 5) * 5 // Round up to nearest 5px
      );
    },
    onDraw: function() {
      // Empty function
    }
  });

  // Initialize widget value using options methods
  widget.options.setValue(defaultValue);

  widget.callback = callback;

  // Render initial state
  renderTags(widgetValue, widget);

  widget.onRemove = () => {
    container.remove(); 
  };

  return { minWidth: 300, minHeight: 150, widget };
}
