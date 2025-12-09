/**
 * EffectsTab Component
 *
 * Tab panel for managing audio effects on the selected track.
 * Provides sliders, toggles, reset/delete controls, and effect configuration.
 * Integrates with AppContext for effect state management.
 */

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
import {FaItalic} from "react-icons/fa";

function EffectsTab() {
  // Access effect management functions and state from AppContext
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

  // Local state for smooth slider interactions
  const [localValues, setLocalValues] = useState({});
  const [draggingSlider, setDraggingSlider] = useState(null);
  const updateTimeoutRef = useRef({});
  const lastTrackIdRef = useRef(null);

  // Configuration for all available effects
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

  // Filter to only show active effects for the current track
  const activeEffectConfigs = (activeEffects || [])
    .map((effectId) => effectConfigs.find((config) => config.name === effectId))
    .filter(Boolean);

  /**
   * Toggle effects menu visibility
   */
  const toggleEffectsMenu = () => {
    if (isEffectsMenuOpen) {
      closeEffectsMenu();
    } else {
      openEffectsMenu();
    }
  };

  /**
   * Get current value for an effect with priority:
   * 1. Local dragging value
   * 2. Local cached value
   * 3. Track stored value
   * 4. Default value
   */
  const getCurrentValue = useCallback(
    (config) => {
      const effectName = config.name;

      if (
        draggingSlider === effectName &&
        localValues[effectName] !== undefined
      ) {
        return localValues[effectName];
      }

      if (localValues[effectName] !== undefined) {
        return localValues[effectName];
      }

      if (
        selectedTrackEffects &&
        selectedTrackEffects[effectName] !== undefined
      ) {
        return selectedTrackEffects[effectName];
      }

      return config.default;
    },
    [draggingSlider, localValues, selectedTrackEffects]
  );

  /**
   * Handle slider change with debounced persistence
   * Updates local state immediately for smooth UI
   */
  const handleChange = useCallback(
    (name) => (e) => {
      const value = Number(e.target.value);

      // Immediate local update for responsive UI
      setLocalValues((prev) => ({...prev, [name]: value}));

      // Clear existing debounce timer
      if (updateTimeoutRef.current[name]) {
        clearTimeout(updateTimeoutRef.current[name]);
      }

      // Debounce the database update
      updateTimeoutRef.current[name] = setTimeout(() => {
        updateEffect(name, value);
        delete updateTimeoutRef.current[name];
      }, 100);
    },
    [updateEffect]
  );

  /**
   * Check if an effect is at its default value
   */
  const isAtDefaultValue = useCallback(
    (config) => {
      const currentValue = getCurrentValue(config);
      return Math.abs(currentValue - config.default) < 0.01;
    },
    [getCurrentValue]
  );

  /**
   * Check if ALL active effects are at default values
   */
  const areAllEffectsAtDefault = useCallback(() => {
    return activeEffectConfigs.every((config) => isAtDefaultValue(config));
  }, [activeEffectConfigs, isAtDefaultValue]);

  /**
   * Reset all effects with immediate visual feedback
   */
  const handleResetAll = useCallback(() => {
    if (areAllEffectsAtDefault()) return;

    // Clear pending update timers
    Object.keys(updateTimeoutRef.current).forEach((key) => {
      clearTimeout(updateTimeoutRef.current[key]);
      delete updateTimeoutRef.current[key];
    });

    // Set all local values to defaults for instant UI update
    const newLocalValues = {};
    activeEffectConfigs.forEach((config) => {
      newLocalValues[config.name] = config.default;
    });

    setLocalValues(newLocalValues);
    resetAllEffects();
  }, [activeEffectConfigs, resetAllEffects, areAllEffectsAtDefault]);

  /**
   * Track slider drag start/end for visual feedback
   */
  const handleSliderStart = useCallback((name) => {
    setDraggingSlider(name);
  }, []);

  const handleSliderEnd = useCallback(() => {
    setTimeout(() => {
      setDraggingSlider(null);
    }, 200);
  }, []);

  /**
   * Calculate slider fill percentage for visual indicator
   */
  const getSliderFillPercentage = (config, value) => {
    const currentValue = value ?? config.default;
    return ((currentValue - config.min) / (config.max - config.min)) * 100;
  };

  // Get enabled effects from track (pan is always enabled)
  const trackEnabled = enabledEffects || {};
  const isEffectEnabled = (effectId) => trackEnabled[effectId] !== false;

  // Check if any non-pan effects are enabled for master toggle
  const areAnyEffectsEnabled = activeEffectConfigs
    .filter((config) => config.name !== "pan")
    .some((config) => isEffectEnabled(config.name));

  const hasActiveEffects = activeEffectConfigs.length > 0;

  // Clear local values when track selection changes
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

  // No track selected message
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
            fontStyle: "italic",
          }}
        >
          Select an audio track to manage its effects
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Add/Close Effects Button */}
      <button
        className={`${styles.addEffectsButton} ${isEffectsMenuOpen ? styles.addEffectsButtonActive : ""}`}
        onClick={toggleEffectsMenu}
      >
        <span className={styles.addEffectsButtonContent}>
          <PlusSignIcon />
          <span>{isEffectsMenuOpen ? "Close Effects" : "Add Effects"}</span>
        </span>
      </button>

      {/* Master Toggle and Reset All Row */}
      {hasActiveEffects && (
        <div className={styles.toggleResetRow}>
          {/* Master Toggle Button */}
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

          {/* Reset All Button */}
          <button
            className={`${styles.resetAllButton} ${
              areAllEffectsAtDefault() ? styles.resetAllButtonDisabled : ""
            }`}
            onClick={areAllEffectsAtDefault() ? undefined : handleResetAll}
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

      {/* Active Effects List */}
      <div className={styles.effectsList}>
        {activeEffectConfigs.map((config) => {
          const currentValue = getCurrentValue(config);
          const fillPercentage = getSliderFillPercentage(config, currentValue);
          const isDefault = isAtDefaultValue(config);
          const isEnabled =
            config.name === "pan" ? true : isEffectEnabled(config.name);
          const shouldShowDisabled = config.name === "pan" ? false : !isEnabled;

          return (
            <div
              key={config.name}
              className={`${styles.effectItem} ${
                shouldShowDisabled ? styles.effectDisabled : ""
              }`}
            >
              {/* Remove Effect Button */}
              <button
                className={styles.closeEffectButton}
                onClick={() => removeEffect(config.name)}
                aria-label={`Remove ${config.label} effect`}
              >
                <XIcon />
              </button>

              {/* Individual Toggle Switch (not for pan) */}
              {config.name !== "pan" && (
                <button
                  className={styles.effectToggleButton}
                  onClick={() => toggleEffect(config.name)}
                  aria-label={`${isEnabled ? "Disable" : "Enable"} ${config.label} effect`}
                >
                  <div
                    className={`${styles.toggleSwitch} ${
                      isEffectEnabled(config.name)
                        ? styles.toggleOn
                        : styles.toggleOff
                    }`}
                  >
                    <div className={styles.toggleSlider}></div>
                  </div>
                </button>
              )}

              {/* Effect Header */}
              <div className={styles.header}>
                <span className={styles.label}>{config.label}</span>
                <div className={styles.description}>{config.description}</div>
              </div>

              {/* Custom Slider */}
              <div
                className={`${styles.sliderContainer} ${
                  draggingSlider === config.name ? styles.dragging : ""
                } ${config.name !== "pan" && !isEnabled ? styles.sliderDisabled : ""}`}
              >
                <div className={styles.sliderTrack}></div>
                <div
                  className={`${styles.sliderFill} ${
                    isDefault ? styles.default : styles.changed
                  } ${config.name !== "pan" && !isEnabled ? styles.sliderFillDisabled : ""}`}
                  style={{width: `${fillPercentage}%`}}
                ></div>
                <div
                  className={`${styles.sliderKnobWrapper} ${
                    draggingSlider === config.name
                      ? styles.sliderKnobWrapperDragging
                      : ""
                  } ${config.name !== "pan" && !isEnabled ? styles.sliderKnobDisabled : ""}`}
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
                  disabled={config.name !== "pan" && !isEnabled}
                />
              </div>

              {/* Bottom Row: Value Display and Reset Button */}
              <div className={styles.bottomRow}>
                <span
                  className={`${styles.value} ${
                    config.name !== "pan" && !isEnabled
                      ? styles.valueDisabled
                      : ""
                  }`}
                >
                  {currentValue.toFixed(config.step < 1 ? 1 : 0)}
                  {config.unit}
                </span>
                <div className={styles.controls}>
                  <button
                    className={`${styles.button} ${
                      isDefault ? styles.buttonDisabled : ""
                    } ${config.name !== "pan" && !isEnabled ? styles.buttonDisabled : ""}`}
                    onClick={
                      isDefault || (config.name !== "pan" && !isEnabled)
                        ? undefined
                        : () => {
                            setLocalValues((prev) => ({
                              ...prev,
                              [config.name]: config.default,
                            }));
                            resetEffect(config.name, config.default);
                          }
                    }
                    disabled={
                      isDefault || (config.name !== "pan" && !isEnabled)
                    }
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty State */}
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
