import {useContext, useCallback, useState, useRef, useEffect} from "react";
import {AppContext} from "../../../context/AppContext";
import styles from "../Layout.module.css";
import {
  EffectsSliderKnob,
  ResetAllButtonEnabled,
  ResetAllButtonDisabled,
  PlusSignIcon,
  XIcon,
  DeleteEffectsIcon,
} from "../Svgs.jsx";

function EffectsTab() {
  const {
    selectedTrackEffects,
    updateEffect,
    resetEffect,
    resetAllEffects,
    deleteAllEffects,
    openEffectsMenu,
    closeEffectsMenu,
    isEffectsMenuOpen,
    removeEffect,
    activeEffects,
    enabledEffects,
    toggleEffect,
    toggleAllEffects,
    selectedTrackId,
  } = useContext(AppContext);

  // Local state for smooth dragging
  const [localValues, setLocalValues] = useState({});
  const [draggingSlider, setDraggingSlider] = useState(null);
  const updateTimeoutRef = useRef({});
  const lastTrackIdRef = useRef(null);

  const effectConfigs = [
    {
      name: "pitch",
      label: "Pitch",
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
    {
      name: "delay",
      label: "Delay",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Add echo effect",
    },
    {
      name: "bass",
      label: "Bass Boost",
      min: -12,
      max: 12,
      step: 1,
      default: 0,
      unit: " dB",
      description: "Boost or cut low frequencies",
    },
    {
      name: "distortion",
      label: "Distortion",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Add grit and crunch",
    },
    {
      name: "pan",
      label: "Pan",
      min: -100,
      max: 100,
      step: 1,
      default: 0,
      unit: "",
      description: "Left/right stereo position",
    },
    {
      name: "tremolo",
      label: "Tremolo",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Volume oscillation",
    },
    {
      name: "vibrato",
      label: "Vibrato",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Pitch oscillation",
    },
    {
      name: "highpass",
      label: "High-pass Filter",
      min: 20,
      max: 2000,
      step: 10,
      default: 20,
      unit: " Hz",
      description: "Remove low frequencies",
    },
    {
      name: "lowpass",
      label: "Low-pass Filter",
      min: 1000,
      max: 20000,
      step: 100,
      default: 20000,
      unit: " Hz",
      description: "Remove high frequencies",
    },
    {
      name: "chorus",
      label: "Chorus",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Add shimmer and width",
    },
  ];

  // Filter effects to only show active ones based on the context list
  const activeEffectConfigs = (activeEffects || [])
    .map((effectId) => effectConfigs.find((config) => config.name === effectId))
    .filter(Boolean);

  const toggleEffectsMenu = () => {
    if (isEffectsMenuOpen) {
      closeEffectsMenu();
    } else {
      openEffectsMenu();
    }
  };

  const getCurrentValue = (config) => {
    const effectName = config.name;

    // Priority 1: If actively dragging, use local value
    if (
      draggingSlider === effectName &&
      localValues[effectName] !== undefined
    ) {
      return localValues[effectName];
    }

    // Priority 2: If we have a local value (from recent change), use it
    if (localValues[effectName] !== undefined) {
      return localValues[effectName];
    }

    // Priority 3: Use the track's persisted value
    if (
      selectedTrackEffects &&
      selectedTrackEffects[effectName] !== undefined
    ) {
      return selectedTrackEffects[effectName];
    }

    // Priority 4: Default value
    return config.default;
  };

  // Update local state immediately and debounce the persist
  const handleChange = useCallback(
    (name) => (e) => {
      const value = Number(e.target.value);

      // ALWAYS update local state immediately for smooth UI
      setLocalValues((prev) => ({...prev, [name]: value}));

      // Clear any existing timeout for this effect
      if (updateTimeoutRef.current[name]) {
        clearTimeout(updateTimeoutRef.current[name]);
      }

      // Debounce the actual update
      updateTimeoutRef.current[name] = setTimeout(() => {
        updateEffect(name, value);
        delete updateTimeoutRef.current[name];
      }, 100);
    },
    [updateEffect]
  );

  const handleSliderStart = useCallback((name) => {
    setDraggingSlider(name);
  }, []);

  const handleSliderEnd = useCallback(() => {
    // Keep dragging state for a moment to prevent flicker
    setTimeout(() => {
      setDraggingSlider(null);
    }, 200);
  }, []);

  const getSliderFillPercentage = (config, value) => {
    const currentValue = value ?? config.default;
    return ((currentValue - config.min) / (config.max - config.min)) * 100;
  };

  // Check if effect is at default value
  const isAtDefaultValue = (config) => {
    const currentValue = getCurrentValue(config);
    return Math.abs(currentValue - config.default) < 0.01;
  };

  // Check if ALL effects are at their default values
  const areAllEffectsAtDefault = () => {
    return activeEffectConfigs.every((config) => isAtDefaultValue(config));
  };

  // Check if effect is enabled (default to true if not set)
  const isEffectEnabled = (effectId) => enabledEffects[effectId] !== false;

  // Check if any effects are enabled (for master toggle)
  const areAnyEffectsEnabled = activeEffectConfigs.some((config) =>
    isEffectEnabled(config.name)
  );

  // Check if all effects are enabled
  const areAllEffectsEnabled =
    activeEffectConfigs.length > 0 &&
    activeEffectConfigs.every((config) => isEffectEnabled(config.name));

  // Check if there are any active effects
  const hasActiveEffects = activeEffectConfigs.length > 0;

  // Clear local values when track changes
  useEffect(() => {
    if (selectedTrackId !== lastTrackIdRef.current) {
      setLocalValues({});
      lastTrackIdRef.current = selectedTrackId;
    }
  }, [selectedTrackId]);

  // Sync local values with track effects after updates settle
  useEffect(() => {
    if (draggingSlider) return;
    if (Object.keys(updateTimeoutRef.current).length > 0) return;

    const timer = setTimeout(() => {
      if (
        !draggingSlider &&
        Object.keys(updateTimeoutRef.current).length === 0
      ) {
        setLocalValues({});
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedTrackEffects, draggingSlider]);

  // Cleanup on unmount
  useEffect(() => {
    const timeoutId = updateTimeoutRef.current;
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  if (!selectedTrackId) {
    return (
      <div className={styles.container}>
        <div
          style={{
            padding: "16px",
            color: "#ccc",
            textAlign: "center",
            minHeight: "100px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Please select an audio track to manage effects.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <button
        className={`${styles.addEffectsButton} ${isEffectsMenuOpen ? styles.addEffectsButtonActive : ""}`}
        onClick={toggleEffectsMenu}
      >
        <span className={styles.addEffectsButtonContent}>
          <PlusSignIcon />
          <span>{isEffectsMenuOpen ? "Close Effects" : "Add Effects"}</span>
        </span>
      </button>

      {/* Master Toggle and Reset All Buttons - Side by Side */}
      {hasActiveEffects && (
        <div className={styles.toggleResetRow}>
          {/* Enable/Disable All Button - Left Side */}
          <button
            className={styles.masterToggleButton}
            onClick={toggleAllEffects}
          >
            <span className={styles.masterToggleContent}>
              <span>Effects</span>
              <div
                className={`${styles.toggleSwitch} ${areAnyEffectsEnabled ? styles.toggleOn : styles.toggleOff}`}
              >
                <div className={styles.toggleSlider}></div>
              </div>
            </span>
          </button>

          {/* Reset All Effects Button - Right Side */}
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
              <span style={{marginTop: "2px"}}>Reset All</span>
            </span>
          </button>
        </div>
      )}

      {/* Effect sliders - only show active effects in addition order */}
      <div className={styles.effectsList}>
        {activeEffectConfigs.map((config) => {
          const currentValue = getCurrentValue(config);
          const fillPercentage = getSliderFillPercentage(config, currentValue);
          const isDefault = isAtDefaultValue(config);
          const isEnabled = isEffectEnabled(config.name);

          return (
            <div
              key={config.name}
              className={`${styles.effectItem} ${!isEnabled ? styles.effectDisabled : ""}`}
            >
              {/* Close button in top right */}
              <button
                className={styles.closeEffectButton}
                onClick={() => removeEffect(config.name)}
                aria-label={`Remove ${config.label} effect`}
              >
                <XIcon />
              </button>

              {/* Individual Toggle Switch - top right, left of close button */}
              <button
                className={styles.effectToggleButton}
                onClick={() => toggleEffect(config.name)}
                aria-label={`${isEnabled ? "Disable" : "Enable"} ${config.label} effect`}
              >
                <div
                  className={`${styles.toggleSwitch} ${isEnabled ? styles.toggleOn : styles.toggleOff}`}
                >
                  <div className={styles.toggleSlider}></div>
                </div>
              </button>

              <div className={styles.header}>
                <span className={styles.label}>{config.label}</span>
                <div className={styles.description}>{config.description}</div>
              </div>

              {/* Custom Slider - disabled state */}
              <div
                className={`${styles.sliderContainer} ${
                  draggingSlider === config.name ? styles.dragging : ""
                } ${!isEnabled ? styles.sliderDisabled : ""}`}
              >
                <div className={styles.sliderTrack}></div>
                <div
                  className={`${styles.sliderFill} ${
                    isDefault ? styles.default : styles.changed
                  } ${!isEnabled ? styles.sliderFillDisabled : ""}`}
                  style={{width: `${fillPercentage}%`}}
                ></div>
                <div
                  className={`${styles.sliderKnobWrapper} ${
                    draggingSlider === config.name
                      ? styles.sliderKnobWrapperDragging
                      : ""
                  } ${!isEnabled ? styles.sliderKnobDisabled : ""}`}
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
                  onMouseDown={() => handleSliderStart(config.name)}
                  onMouseUp={() => handleSliderEnd(config.name)}
                  onTouchStart={() => handleSliderStart(config.name)}
                  onTouchEnd={() => handleSliderEnd(config.name)}
                  className={styles.sliderInput}
                  disabled={!isEnabled}
                />
              </div>

              <div className={styles.bottomRow}>
                <span
                  className={`${styles.value} ${!isEnabled ? styles.valueDisabled : ""}`}
                >
                  {currentValue.toFixed(config.step < 1 ? 1 : 0)}
                  {config.unit}
                </span>
                <div className={styles.controls}>
                  <button
                    className={`${styles.button} ${
                      isDefault ? styles.buttonDisabled : ""
                    } ${!isEnabled ? styles.buttonDisabled : ""}`}
                    onClick={
                      isDefault || !isEnabled
                        ? undefined
                        : () => {
                            setLocalValues((prev) => ({
                              ...prev,
                              [config.name]: config.default,
                            }));
                            resetEffect(config.name, config.default);
                          }
                    }
                    disabled={isDefault || !isEnabled}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {activeEffectConfigs.length === 0 && (
          <div className={styles.noEffectsMessage}>
            No effects yet. Add one to get started
          </div>
        )}
      </div>

      {/* Delete All Effects Button */}
      <button
        className={`${styles.deleteAllButton} ${
          !hasActiveEffects ? styles.deleteAllButtonDisabled : ""
        }`}
        onClick={!hasActiveEffects ? undefined : deleteAllEffects}
        disabled={!hasActiveEffects}
      >
        <span className={styles.deleteAllButtonContent}>
          <DeleteEffectsIcon />
          <span>Delete All</span>
        </span>
      </button>
    </div>
  );
}

export default EffectsTab;