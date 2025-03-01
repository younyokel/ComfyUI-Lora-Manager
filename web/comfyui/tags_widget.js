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

  // Initialize default value
  const defaultValue = opts?.defaultVal || "[]";

  // Parse trigger words and states from string
  const parseTagsValue = (value) => {
    if (!value) return [];

    try {
      return JSON.parse(value);
    } catch (e) {
      // If it's not valid JSON, try legacy format or return empty array
      console.warn("Invalid tags data format", e);
      return [];
    }
  };

  // Format tags data back to string
  const formatTagsValue = (tagsData) => {
    return JSON.stringify(tagsData);
  };

  // Function to render tags from data
  const renderTags = (value, widget) => {
    // Clear existing tags
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Parse the tags data
    const tagsData = parseTagsValue(value);

    tagsData.forEach((tagData) => {
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
        const tagsData = parseTagsValue(widget.value);
        const tagIndex = tagsData.findIndex((t) => t.text === text);

        if (tagIndex >= 0) {
          tagsData[tagIndex].active = !tagsData[tagIndex].active;
          updateTagStyle(tagEl, tagsData[tagIndex].active);

          // Update value and trigger widget callback
          const newValue = formatTagsValue(tagsData);
          widget.value = newValue;
          widget.callback?.(newValue);
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

  // Store the value in a variable to avoid recursion
  let widgetValue = defaultValue;

  // Create widget with initial properties
  const widget = node.addDOMWidget(name, "tags", container, {
    getValue: function() {
      return widgetValue;
    },
    setValue: function(v) {
      // Format the incoming value if it's not in the expected JSON format
      let parsedValue = v;

      try {
        // Try to parse as JSON first
        if (typeof v === "string" && (v.startsWith("[") || v.startsWith("{"))) {
          JSON.parse(v);
          // If no error, it's already valid JSON
          parsedValue = v;
        } else if (typeof v === "string") {
          // If it's a comma-separated string of trigger words, convert to tag format
          const triggerWords = v
            .split(",")
            .map((word) => word.trim())
            .filter((word) => word);

          // Get existing tags to merge with new ones
          const existingTags = parseTagsValue(widgetValue || "[]");
          const existingTagsMap = {};
          existingTags.forEach((tag) => {
            existingTagsMap[tag.text] = tag.active;
          });

          // Create new tags with merging logic
          const newTags = triggerWords.map((word) => ({
            text: word,
            active: word in existingTagsMap ? existingTagsMap[word] : true,
          }));

          parsedValue = JSON.stringify(newTags);
        }
      } catch (e) {
        console.warn("Error formatting tags value:", e);
        // Keep the original value if there's an error
      }

      widgetValue = parsedValue || ""; // Store in our local variable instead
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
  widget.serializeValue = function(workflowNode, widgetIndex) {
    console.log("Serializing tags widget", widget.value);
    return widget.value;
  };

  // Render initial state
  renderTags(widgetValue, widget);

  widget.onRemove = () => {
    container.remove(); 
  };

  return { minWidth: 300, minHeight: 150, widget };
}
