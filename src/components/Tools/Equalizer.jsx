/**
 * Equalizer Component
 *
 * Interactive audio equalizer with 10-band frequency controls and presets.
 * Supports both master EQ (global) and per-track EQ with real-time visual feedback.
 * Features draggable window, frequency response curve visualization, and preset management.
 */

import {useState, useRef, useEffect, useCallback, useContext} from "react";
import styles from "./Equalizer.module.css";
import {AppContext} from "../../context/AppContext";
import {audioManager} from "../../managers/AudioManager";
import {dbManager} from "../../managers/DBManager";

// 10-band EQ frequency definitions
const EQ_BANDS = [
  {freq: 32, label: "32"},
  {freq: 64, label: "64"},
  {freq: 125, label: "125"},
  {freq: 250, label: "250"},
  {freq: 500, label: "500"},
  {freq: 1000, label: "1k"},
  {freq: 2000, label: "2k"},
  {freq: 4000, label: "4k"},
  {freq: 8000, label: "8k"},
  {freq: 16000, label: "16k"},
];

// Predefined EQ presets for common audio profiles
const EQ_PRESETS = {
  flat: {name: "Flat", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]},
  bass_boost: {name: "Bass Boost", values: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]},
  treble_boost: {name: "Treble Boost", values: [0, 0, 0, 0, 0, 1, 3, 5, 6, 6]},
  vocal_boost: {name: "Vocal Boost", values: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1]},
  rock: {name: "Rock", values: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4]},
  pop: {name: "Pop", values: [-1, 0, 2, 4, 4, 3, 1, 0, -1, -2]},
  jazz: {name: "Jazz", values: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3]},
  classical: {name: "Classical", values: [4, 3, 2, 1, 0, 0, 0, 1, 2, 3]},
  electronic: {name: "Electronic", values: [4, 3, 1, 0, -2, 0, 1, 3, 4, 4]},
  acoustic: {name: "Acoustic", values: [3, 2, 1, 1, 2, 2, 2, 3, 2, 1]},
};

/**
 * Vertical slider component for EQ band control
 * Supports mouse drag and visual feedback
 */
const VerticalSlider = ({value, onChange, onChangeComplete, min, max}) => {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  // Sync temp value when not dragging
  useEffect(() => {
    if (!isDragging) {
      setTempValue(value);
    }
  }, [value, isDragging]);

  /**
   * Convert mouse Y position to dB value
   */
  const calculateValue = useCallback(
    (clientY) => {
      if (!trackRef.current) return tempValue;
      const rect = trackRef.current.getBoundingClientRect();
      const percentage = 1 - (clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, percentage));
      return min + clamped * (max - min);
    },
    [min, max, tempValue]
  );

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const newValue = calculateValue(e.clientY);
    const rounded = Math.round(newValue * 2) / 2; // Snap to 0.5dB increments
    setTempValue(rounded);
    onChange(rounded, true); // Preview mode (visual only)
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      const newValue = calculateValue(e.clientY);
      const rounded = Math.round(newValue * 2) / 2;
      setTempValue(rounded);
      onChange(rounded, true); // Preview mode
    },
    [isDragging, calculateValue, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (onChangeComplete) {
      onChangeComplete(tempValue);
    }
  }, [tempValue, onChangeComplete]);

  // Add global mouse event listeners during drag
  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Calculate display values and percentages
  const displayValue = isDragging ? tempValue : value;
  const percentage = ((displayValue - min) / (max - min)) * 100;
  const isChanged = displayValue !== 0;

  return (
    <div
      className={`${styles.verticalSliderContainer} ${isDragging ? styles.dragging : ""}`}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.verticalSliderTrack} ref={trackRef}>
        <div className={styles.centerLine} />
        <div
          className={`${styles.verticalSliderFill} ${isChanged ? styles.changed : styles.default}`}
          style={{
            bottom: displayValue >= 0 ? "50%" : `${percentage}%`,
            height: `${(Math.abs(displayValue) / (max - min)) * 100}%`,
          }}
        />
        <div
          className={`${styles.verticalSliderKnob} ${isDragging ? styles.knobDragging : ""}`}
          style={{bottom: `calc(${percentage}% - 6px)`}}
        />
      </div>
    </div>
  );
};

/**
 * Visual frequency response curve component
 * Shows EQ curve based on current band values
 */
const FrequencyResponseCurve = ({bandValues}) => {
  const width = 320,
    height = 80;
  const padding = {left: 10, right: 10, top: 10, bottom: 10};
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  /**
   * Generate SVG path for EQ curve
   */
  const generateCurvePoints = () => {
    const points = bandValues.map((val, i) => ({
      x: padding.left + (i / (bandValues.length - 1)) * graphWidth,
      y: padding.top + graphHeight / 2 - (val / 12) * (graphHeight / 2),
    }));
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i],
        p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2,
        midY = (p0.y + p1.y) / 2;
      pathD += ` Q ${p0.x} ${p0.y}, ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    pathD += ` L ${last.x} ${last.y}`;
    return pathD;
  };

  const generateFillPath = () => {
    const curve = generateCurvePoints();
    const centerY = padding.top + graphHeight / 2;
    return `${curve} L ${width - padding.right} ${centerY} L ${padding.left} ${centerY} Z`;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.frequencyResponseSvg}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="curveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#17e1ff" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#17e1ff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#17e1ff" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#17e1ff" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#00e5ff" stopOpacity="1" />
          <stop offset="100%" stopColor="#17e1ff" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {/* dB grid lines */}
      {[-12, -6, 0, 6, 12].map((db) => {
        const y = padding.top + graphHeight / 2 - (db / 12) * (graphHeight / 2);
        return (
          <line
            key={db}
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke={db === 0 ? "#444" : "#2a2a2a"}
            strokeWidth={db === 0 ? 1 : 0.5}
          />
        );
      })}

      {/* Filled curve area */}
      <path d={generateFillPath()} fill="url(#curveGradient)" />

      {/* Curve line */}
      <path
        d={generateCurvePoints()}
        fill="none"
        stroke="url(#lineGradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Control points */}
      {bandValues.map((val, i) => {
        const x = padding.left + (i / (bandValues.length - 1)) * graphWidth;
        const y =
          padding.top + graphHeight / 2 - (val / 12) * (graphHeight / 2);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="3"
            fill="#17e1ff"
            stroke="#0f0f0f"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
};

/**
 * Main Equalizer component
 * Supports both master (global) and per-track equalization
 */
const Equalizer = ({isOpen, onClose, initialPosition = {x: 100, y: 100}}) => {
  const {
    engineRef,
    effects: masterEffects,
    setEffects: setMasterEffects,
    selectedTrackId,
    setSelectedTrackId,
  } = useContext(AppContext);

  // Component state
  const [selectedPreset, setSelectedPreset] = useState("flat");
  const [position, setPosition] = useState(initialPosition);
  const [bandValues, setBandValues] = useState(EQ_BANDS.map((_) => 0));
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({x: 0, y: 0});
  const [trackName, setTrackName] = useState("Master");

  // Ref for batching EQ changes
  const pendingChangesRef = useRef(new Map());

  /**
   * Update displayed track name based on selection
   */
  useEffect(() => {
    if (selectedTrackId) {
      const track = audioManager?.getTrack(selectedTrackId);
      setTrackName(track?.name || "Unknown Track");
    } else {
      setTrackName("Master");
    }
  }, [selectedTrackId]);

  /**
   * Detect which preset matches current EQ settings
   */
  useEffect(() => {
    const matchingPreset = Object.entries(EQ_PRESETS).find(([_, preset]) =>
      preset.values.every((val, i) => val === bandValues[i])
    );

    if (matchingPreset) {
      setSelectedPreset(matchingPreset[0]);
    } else {
      setSelectedPreset("custom");
    }
  }, [bandValues]);

  /**
   * Sync slider values with current track or master EQ
   */
  useEffect(() => {
    if (selectedTrackId) {
      // Load track-specific EQ
      const track = audioManager?.getTrack(selectedTrackId);
      if (track && track.effects) {
        const values = EQ_BANDS.map((b) => track.effects[b.freq] ?? 0);
        setBandValues(values);
      } else {
        setBandValues(EQ_BANDS.map((_) => 0));
      }
    } else {
      // Load master EQ
      const values = EQ_BANDS.map((b) => masterEffects[b.freq] ?? 0);
      setBandValues(values);
    }
  }, [selectedTrackId, masterEffects]);

  /**
   * Apply batched EQ changes to audio engine and storage
   */
  const applyPendingChanges = useCallback(async () => {
    if (pendingChangesRef.current.size === 0) return;

    if (selectedTrackId) {
      // Apply to selected track
      const track = audioManager?.getTrack(selectedTrackId);
      if (track) {
        const newEffects = {...track.effects};
        pendingChangesRef.current.forEach((value, freq) => {
          newEffects[freq] = value;
        });

        track.effects = newEffects;

        // Update audio engine
        if (engineRef?.current?.setTrackEffects) {
          try {
            engineRef.current.setTrackEffects(
              selectedTrackId,
              newEffects,
              track.enabledEffects || {},
              false
            );
          } catch (e) {
            console.error("Failed to apply track EQ:", e);
          }
        }

        // Persist to IndexedDB
        try {
          await dbManager.updateTrack(track);
        } catch (e) {
          console.error("Failed to persist track EQ:", e);
        }
      }
    } else {
      // Apply to master EQ
      const newMasterEffects = {...masterEffects};
      pendingChangesRef.current.forEach((value, freq) => {
        newMasterEffects[freq] = value;
      });

      setMasterEffects(newMasterEffects);

      // Update audio engine
      if (engineRef?.current?.applyEffects) {
        try {
          engineRef.current.applyEffects(newMasterEffects);
        } catch (e) {
          console.error("Failed to apply master EQ:", e);
        }
      }

      // Persist to localStorage
      try {
        localStorage.setItem(
          "webamp.masterEffects",
          JSON.stringify(newMasterEffects)
        );
      } catch (e) {
        console.error("Failed to persist master EQ:", e);
      }
    }

    pendingChangesRef.current.clear();
  }, [selectedTrackId, masterEffects, engineRef, setMasterEffects]);

  /**
   * Handle individual band change (with preview support)
   */
  const handleBandChange = useCallback((index, value, isPreview = false) => {
    const freq = EQ_BANDS[index].freq;

    // Update UI immediately
    setBandValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });

    if (isPreview) {
      pendingChangesRef.current.set(freq, value);
    }
  }, []);

  /**
   * Handle band change completion (apply to engine)
   */
  const handleBandChangeComplete = useCallback(
    async (index, value) => {
      const freq = EQ_BANDS[index].freq;
      pendingChangesRef.current.set(freq, value);
      await applyPendingChanges();
    },
    [applyPendingChanges]
  );

  /**
   * Apply EQ preset to current target
   */
  const handlePresetChange = useCallback(
    async (presetKey) => {
      setSelectedPreset(presetKey);

      if (presetKey !== "custom" && EQ_PRESETS[presetKey]) {
        const preset = EQ_PRESETS[presetKey];

        if (selectedTrackId) {
          // Apply preset to track
          const track = audioManager?.getTrack(selectedTrackId);
          if (track) {
            const newEffects = {...track.effects};
            EQ_BANDS.forEach((band, i) => {
              newEffects[band.freq] = preset.values[i];
            });

            track.effects = newEffects;
            setBandValues(preset.values);

            // Update engine
            if (engineRef?.current?.setTrackEffects) {
              try {
                engineRef.current.setTrackEffects(
                  selectedTrackId,
                  newEffects,
                  track.enabledEffects || {},
                  false
                );
              } catch (e) {
                console.error("Failed to apply preset to track:", e);
              }
            }

            // Persist
            try {
              await dbManager.updateTrack(track);
            } catch (e) {
              console.error("Failed to persist preset:", e);
            }
          }
        } else {
          // Apply preset to master
          const newMasterEffects = {...masterEffects};
          EQ_BANDS.forEach((band, i) => {
            newMasterEffects[band.freq] = preset.values[i];
          });

          setMasterEffects(newMasterEffects);
          setBandValues(preset.values);

          // Update engine
          if (engineRef?.current?.applyEffects) {
            try {
              engineRef.current.applyEffects(newMasterEffects);
            } catch (e) {
              console.error("Failed to apply master preset:", e);
            }
          }

          // Persist
          try {
            localStorage.setItem(
              "webamp.masterEffects",
              JSON.stringify(newMasterEffects)
            );
          } catch (e) {
            console.error("Failed to persist master preset:", e);
          }
        }
      }
    },
    [selectedTrackId, masterEffects, engineRef, setMasterEffects]
  );

  /**
   * Reset EQ to flat response
   */
  const handleReset = useCallback(() => {
    handlePresetChange("flat");
  }, [handlePresetChange]);

  /**
   * Window dragging handlers
   */
  const handleMouseDown = (e) => {
    if (
      e.target.closest(`.${styles.eqControls}`) ||
      e.target.closest(`.${styles.presetSelect}`) ||
      e.target.closest(`.${styles.closeButton}`)
    )
      return;
    setIsDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({x: e.clientX - rect.left, y: e.clientY - rect.top});
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 400);
      const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 300);
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    },
    [isDragging, dragOffset]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // Add global mouse listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const isModified = bandValues.some((v) => v !== 0);
  const panelRef = useRef(null);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`${styles.equalizerPanel} ${isDragging ? styles.dragging : ""}`}
      style={{left: position.x, top: position.y}}
      onMouseDown={handleMouseDown}
    >
      {/* Header with title and close button */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>Equalizer</h3>
          <span className={styles.trackName}>{trackName}</span>
        </div>
        <button className={styles.closeButton} onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M1.4 14L0 12.6L5.6 7L0 1.4L1.4 0L7 5.6L12.6 0L14 1.4L8.4 7L14 12.6L12.6 14L7 8.4L1.4 14Z" />
          </svg>
        </button>
      </div>

      {/* Frequency response visualization */}
      <div className={styles.curveContainer}>
        <FrequencyResponseCurve bandValues={bandValues} />
        <div className={styles.dbLabels}>
          <span>+12</span>
          <span>0</span>
          <span>-12</span>
        </div>
      </div>

      {/* 10-band EQ controls */}
      <div className={styles.eqControls}>
        <div className={styles.bandsContainer}>
          {EQ_BANDS.map((band, index) => (
            <div key={band.freq} className={styles.bandColumn}>
              <div className={styles.bandValue}>
                {bandValues[index] > 0 ? "+" : ""}
                {bandValues[index].toFixed(1)}
              </div>
              <VerticalSlider
                value={bandValues[index]}
                onChange={(val, isPreview) =>
                  handleBandChange(index, val, isPreview)
                }
                onChangeComplete={(val) => handleBandChangeComplete(index, val)}
                min={-12}
                max={12}
              />
              <div className={styles.bandLabel}>{band.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer with preset selector and controls */}
      <div className={styles.footer}>
        <div className={styles.presetSection}>
          <label className={styles.presetLabel}>Preset:</label>
          <select
            className={styles.presetSelect}
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            <option value="custom">Custom</option>
            {Object.entries(EQ_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* Switch between track and master EQ */}
        {selectedTrackId && (
          <div>
            <button
              className={styles.resetButton}
              onClick={() => setSelectedTrackId(null)}
            >
              Switch to Master
            </button>
          </div>
        )}

        {/* Reset button */}
        <button
          className={`${styles.resetButton} ${!isModified ? styles.resetButtonDisabled : ""}`}
          onClick={handleReset}
          disabled={!isModified}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default Equalizer;
