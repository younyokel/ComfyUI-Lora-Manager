export function addLorasWidget(node, name, opts, callback) {
  // Create container for loras
  const container = document.createElement("div");
  container.className = "comfy-loras-container";
  Object.assign(container.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "6px",
    backgroundColor: "rgba(40, 44, 52, 0.6)",
    borderRadius: "6px",
    width: "100%",
  });

  // Initialize default value
  const defaultValue = opts?.defaultVal || "";

  // Parse LoRA entries from value
  const parseLoraValue = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [];
  };

  // Format LoRA data
  const formatLoraValue = (loras) => {
    return loras;
  };

  // Function to create toggle element
  const createToggle = (active, onChange) => {
    const toggle = document.createElement("div");
    toggle.className = "comfy-lora-toggle";
    
    updateToggleStyle(toggle, active);
    
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      onChange(!active);
    });
    
    return toggle;
  };

  // Helper function to update toggle style
  function updateToggleStyle(toggleEl, active) {
    Object.assign(toggleEl.style, {
      width: "18px",
      height: "18px",
      borderRadius: "4px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      backgroundColor: active ? "rgba(66, 153, 225, 0.9)" : "rgba(45, 55, 72, 0.7)",
      border: `1px solid ${active ? "rgba(66, 153, 225, 0.9)" : "rgba(226, 232, 240, 0.2)"}`,
    });

    // Add hover effect
    toggleEl.onmouseenter = () => {
      toggleEl.style.transform = "scale(1.05)";
      toggleEl.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15)";
    };

    toggleEl.onmouseleave = () => {
      toggleEl.style.transform = "scale(1)";
      toggleEl.style.boxShadow = "none";
    };
  }

  // Create arrow button for strength adjustment
  const createArrowButton = (direction, onClick) => {
    const button = document.createElement("div");
    button.className = `comfy-lora-arrow comfy-lora-arrow-${direction}`;
    
    Object.assign(button.style, {
      width: "16px",
      height: "16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      userSelect: "none",
      fontSize: "12px",
      color: "rgba(226, 232, 240, 0.8)",
      transition: "all 0.2s ease",
    });
    
    button.textContent = direction === "left" ? "◀" : "▶";
    
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    
    // Add hover effect
    button.onmouseenter = () => {
      button.style.color = "white";
      button.style.transform = "scale(1.2)";
    };
    
    button.onmouseleave = () => {
      button.style.color = "rgba(226, 232, 240, 0.8)";
      button.style.transform = "scale(1)";
    };
    
    return button;
  };

  // Function to render loras from data
  const renderLoras = (value, widget) => {
    // Clear existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Parse the loras data
    const lorasData = parseLoraValue(value);

    if (lorasData.length === 0) {
      // Show message when no loras are added
      const emptyMessage = document.createElement("div");
      emptyMessage.textContent = "No LoRAs added";
      Object.assign(emptyMessage.style, {
        textAlign: "center",
        padding: "20px 0",
        color: "rgba(226, 232, 240, 0.8)",
        fontStyle: "italic"
      });
      container.appendChild(emptyMessage);
      return;
    }

    // Create header
    const header = document.createElement("div");
    header.className = "comfy-loras-header";
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "4px 8px",
      borderBottom: "1px solid rgba(226, 232, 240, 0.2)",
      marginBottom: "8px"
    });

    // Add toggle all control
    const allActive = lorasData.every(lora => lora.active);
    const toggleAll = createToggle(allActive, (active) => {
      // Update all loras active state
      const lorasData = parseLoraValue(widget.value);
      lorasData.forEach(lora => lora.active = active);
      
      // Update value and trigger widget callback
      const newValue = formatLoraValue(lorasData);
      widget.value = newValue;
      widget.callback?.(newValue);
      
      // Re-render
      renderLoras(newValue, widget);
    });

    // Add label to toggle all
    const toggleLabel = document.createElement("div");
    toggleLabel.textContent = "Toggle All";
    Object.assign(toggleLabel.style, {
      color: "rgba(226, 232, 240, 0.8)",
      fontSize: "13px",
      marginLeft: "8px",
    });

    const toggleContainer = document.createElement("div");
    Object.assign(toggleContainer.style, {
      display: "flex",
      alignItems: "center",
    });
    toggleContainer.appendChild(toggleAll);
    toggleContainer.appendChild(toggleLabel);

    // Strength label
    const strengthLabel = document.createElement("div");
    strengthLabel.textContent = "Strength";
    Object.assign(strengthLabel.style, {
      color: "rgba(226, 232, 240, 0.8)",
      fontSize: "13px",
      marginRight: "8px"
    });

    header.appendChild(toggleContainer);
    header.appendChild(strengthLabel);
    container.appendChild(header);

    // Render each lora entry
    lorasData.forEach((loraData) => {
      const { name, strength, active } = loraData;
      
      const loraEl = document.createElement("div");
      loraEl.className = "comfy-lora-entry";
      Object.assign(loraEl.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px",
        borderRadius: "6px",
        backgroundColor: active ? "rgba(45, 55, 72, 0.7)" : "rgba(35, 40, 50, 0.5)",
        transition: "all 0.2s ease",
        marginBottom: "6px",
      });

      // Create toggle for this lora
      const toggle = createToggle(active, (newActive) => {
        // Update this lora's active state
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].active = newActive;
          
          // Update value and trigger widget callback
          const newValue = formatLoraValue(lorasData);
          widget.value = newValue;
          widget.callback?.(newValue);
          
          // Re-render
          renderLoras(newValue, widget);
        }
      });

      // Create name display
      const nameEl = document.createElement("div");
      nameEl.textContent = name;
      nameEl.title = name; // Set tooltip for full name
      Object.assign(nameEl.style, {
        marginLeft: "10px",
        flex: "1",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: active ? "rgba(226, 232, 240, 0.9)" : "rgba(226, 232, 240, 0.6)",
        fontSize: "13px",
      });

      // Create strength control
      const strengthControl = document.createElement("div");
      Object.assign(strengthControl.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
      });

      // Left arrow
      const leftArrow = createArrowButton("left", () => {
        // Decrease strength
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].strength = Math.max(0, lorasData[loraIndex].strength - 0.05).toFixed(2);
          
          // Update value and trigger widget callback
          const newValue = formatLoraValue(lorasData);
          widget.value = newValue;
          widget.callback?.(newValue);
          
          // Re-render
          renderLoras(newValue, widget);
        }
      });

      // Strength display
      const strengthEl = document.createElement("div");
      const displayStrength = typeof strength === 'number' ? strength.toFixed(2) : Number(strength).toFixed(2);
      strengthEl.textContent = displayStrength;
      Object.assign(strengthEl.style, {
        minWidth: "36px",
        textAlign: "center",
        color: active ? "rgba(226, 232, 240, 0.9)" : "rgba(226, 232, 240, 0.6)",
        fontSize: "13px",
      });

      // Right arrow
      const rightArrow = createArrowButton("right", () => {
        // Increase strength
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].strength = (parseFloat(lorasData[loraIndex].strength) + 0.05).toFixed(2);
          
          // Update value and trigger widget callback
          const newValue = formatLoraValue(lorasData);
          widget.value = newValue;
          widget.callback?.(newValue);
          
          // Re-render
          renderLoras(newValue, widget);
        }
      });

      strengthControl.appendChild(leftArrow);
      strengthControl.appendChild(strengthEl);
      strengthControl.appendChild(rightArrow);

      // Assemble entry
      const leftSection = document.createElement("div");
      Object.assign(leftSection.style, {
        display: "flex",
        alignItems: "center",
        flex: "1",
        minWidth: "0", // Allow shrinking
      });
      
      leftSection.appendChild(toggle);
      leftSection.appendChild(nameEl);
      
      loraEl.appendChild(leftSection);
      loraEl.appendChild(strengthControl);

      // Add hover effect to the lora entry
      loraEl.onmouseenter = () => {
        loraEl.style.backgroundColor = active ? "rgba(50, 60, 80, 0.8)" : "rgba(40, 45, 55, 0.6)";
      };
      
      loraEl.onmouseleave = () => {
        loraEl.style.backgroundColor = active ? "rgba(45, 55, 72, 0.7)" : "rgba(35, 40, 50, 0.5)";
      };
      
      container.appendChild(loraEl);
    });
  };

  // Store the value in a variable to avoid recursion
  let widgetValue = defaultValue;

  // Create widget with initial properties
  const widget = node.addDOMWidget(name, "loras", container, {
    getValue: function() {
      return widgetValue;
    },
    setValue: function(v) {
      widgetValue = v || "";
      renderLoras(widgetValue, widget);
    },
    getHeight: function() {
      // Calculate height based on content
      const lorasCount = parseLoraValue(widgetValue).length;
      return Math.max(
        100,
        lorasCount > 0 ? 60 + lorasCount * 44 : 60 // Header + entries or minimum height
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
  renderLoras(widgetValue, widget);

  widget.onRemove = () => {
    container.remove(); 
  };

  return { minWidth: 400, minHeight: 200, widget };
}
