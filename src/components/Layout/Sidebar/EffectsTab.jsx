import {useContext, useCallback, useState, useRef} from "react";
import {AppContext} from "../../../context/AppContext";
import styles from "../Layout.module.css";
import {
  EffectsSliderKnob,
  ResetAllButtonEnabled,
  ResetAllButtonDisabled,
  PlusSignIcon,
} from "../Svgs.jsx";

function EffectsTab() {
  const {effects, updateEffect, resetEffect, resetAllEffects, openEffectsMenu, closeEffectsMenu, isEffectsMenuOpen} =
    useContext(AppContext);

  const [draggingSlider, setDraggingSlider] = useState(null);
  const [localValues, setLocalValues] = useState({}); // Store temporary values
  const pendingUpdates = useRef(new Map()); // Track pending effect updates

  const effectConfigs = [
    {
      name: "pitch",
      label: "Pitch Shift",
      min: -12,
      max: 12,
      step: 0.1,
      default: 0,
      unit: " semitones",
      description: "Shift pitch up or down",
    },
    {
      name: "volume",
      label: "Volume",
      min: 0,
      max: 200,
      step: 1,
      default: 100,
      unit: "%",
      description: "Adjust volume level",
    },
    {
      name: "reverb",
      label: "Reverb",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Add room ambience",
    },
  ];

  // Toggle effects menu
  const toggleEffectsMenu = () => {
    if (isEffectsMenuOpen) {
      closeEffectsMenu();
    } else {
      openEffectsMenu();
    }
  };

  // Update local state immediately for smooth UI
  const handleChange = useCallback(
    (name) => (e) => {
      const raw = e.target.value;
      const num = Number(raw);

      // Update local state for immediate visual feedback
      setLocalValues((prev) => ({...prev, [name]: num}));

      // Store the pending update but don't apply it yet
      pendingUpdates.current.set(name, num);
    },
    []
  );

  // Apply all pending effects when user releases slider
  const handleSliderEnd = useCallback(
    (name) => () => {
      const pendingValue = pendingUpdates.current.get(name);
      if (pendingValue !== undefined) {
        updateEffect(name, pendingValue);
        pendingUpdates.current.delete(name);
      }
      setDraggingSlider(null);
    },
    [updateEffect]
  );

  const getSliderFillPercentage = (config, value) => {
    const currentValue = value ?? config.default;
    return ((currentValue - config.min) / (config.max - config.min)) * 100;
  };

  // Use local value if dragging, otherwise use actual effect value
  const getCurrentValue = (config) => {
    if (
      draggingSlider === config.name &&
      localValues[config.name] !== undefined
    ) {
      return localValues[config.name];
    }
    return effects[config.name] ?? config.default;
  };

  // Check if effect is at default value
  const isAtDefaultValue = (config) => {
    const currentValue = getCurrentValue(config);
    return currentValue === config.default;
  };

  // Check if ALL effects are at their default values
  const areAllEffectsAtDefault = () => {
    return effectConfigs.every((config) => isAtDefaultValue(config));
  };

  return (
    <div className={styles.container}>
      {/* Add Effects Button - now toggles the menu */}
      <button 
        className={`${styles.addEffectsButton} ${isEffectsMenuOpen ? styles.addEffectsButtonActive : ''}`}
        onClick={toggleEffectsMenu}
      >
        <span className={styles.addEffectsButtonContent}>
          <PlusSignIcon />
          <span>{isEffectsMenuOpen ? 'Close Effects' : 'Add Effects'}</span>
        </span>
      </button>

      {/* Effect sliders */}
      {effectConfigs.map((config) => {
        const currentValue = getCurrentValue(config);
        const fillPercentage = getSliderFillPercentage(config, currentValue);
        const isDefault = isAtDefaultValue(config);

        return (
          <div key={config.name} className={styles.effectItem}>
            <div className={styles.header}>
              <span className={styles.label}>{config.label}</span>
              <span className={styles.value}>
                {currentValue}
                {config.unit}
              </span>
            </div>
            <div className={styles.description}>{config.description}</div>

            {/* Custom Slider */}
            <div
              className={`${styles.sliderContainer} ${
                draggingSlider === config.name ? styles.dragging : ""
              }`}
            >
              <div className={styles.sliderTrack}></div>
              <div
                className={`${styles.sliderFill} ${
                  isDefault ? styles.default : styles.changed
                }`}
                style={{width: `${fillPercentage}%`}}
              ></div>
              <div
                className={`${styles.sliderKnobWrapper} ${
                  draggingSlider === config.name
                    ? styles.sliderKnobWrapperDragging
                    : ""
                }`}
                style={{left: `${fillPercentage}%`}}
              >
                <EffectsSliderKnob />
              </div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={currentValue}
                onChange={handleChange(config.name)}
                onMouseDown={() => setDraggingSlider(config.name)}
                onMouseUp={handleSliderEnd(config.name)}
                onTouchStart={() => setDraggingSlider(config.name)}
                onTouchEnd={handleSliderEnd(config.name)}
                className={styles.sliderInput}
              />
            </div>

            <div className={styles.controls}>
              <button
                className={`${styles.button} ${
                  isDefault ? styles.buttonDisabled : ""
                }`}
                onClick={
                  isDefault
                    ? undefined
                    : () => resetEffect(config.name, config.default)
                }
                disabled={isDefault}
              >
                Reset
              </button>
            </div>
          </div>
        );
      })}

      {/* Reset All Effects Button */}
      <button
        className={`${styles.resetAllButton} ${
          areAllEffectsAtDefault() ? styles.resetAllButtonDisabled : ""
        }`}
        onClick={areAllEffectsAtDefault() ? undefined : resetAllEffects}
        disabled={areAllEffectsAtDefault()}
      >
        <span className={styles.resetAllButtonContent}>
          {areAllEffectsAtDefault() ? (
            <ResetAllButtonDisabled />
          ) : (
            <ResetAllButtonEnabled />
          )}
          <span style={{marginTop: "2px"}}>Reset All Effects</span>
        </span>
      </button>
    </div>
  );
}

export default EffectsTab;