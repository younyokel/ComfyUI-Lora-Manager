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
  const initialTagsData = opts?.defaultVal || [];

  // Function to render tags from array data
  const renderTags = (tagsData, widget) => {
    // Clear existing tags
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const normalizedTags = tagsData;

    normalizedTags.forEach((tagData, index) => {
      const { text, active } = tagData;
      const tagEl = document.createElement("div");
      tagEl.className = "comfy-tag";
      
      updateTagStyle(tagEl, active);

      tagEl.textContent = text;
      tagEl.title = text; // Set tooltip for full content

      // Add click handler to toggle state
      tagEl.addEventListener("click", (e) => {
        e.stopPropagation();

        // Toggle active state for this specific tag using its index
        const updatedTags = [...widget.value];
        updatedTags[index].active = !updatedTags[index].active;
        updateTagStyle(tagEl, updatedTags[index].active);

        widget.value = updatedTags;
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
      userSelect: "none",     // Add this line to prevent text selection
      WebkitUserSelect: "none",  // For Safari support
      MozUserSelect: "none",     // For Firefox support
      msUserSelect: "none",      // For IE/Edge support
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
  let widgetValue = initialTagsData;

  // Create widget with initial properties
  const widget = node.addDOMWidget(name, "tags", container, {
    getValue: function() {
      return widgetValue;
    },
    setValue: function(v) {
      widgetValue = v;
      renderTags(widgetValue, widget);
    },
    getHeight: function() {
      // Calculate height based on content
      return Math.max(
        150,
        Math.ceil(container.scrollHeight / 5) * 5 // Round up to nearest 5px
      );
    },
  });

  widget.value = initialTagsData;

  widget.callback = callback;

  return { minWidth: 300, minHeight: 150, widget };
}
