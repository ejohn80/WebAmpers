/**
 * AppContext — Global State for WebAmpers
 *
 * Central React Context for:
 * - User auth/session state
 * - Theme preferences
 * - Audio engine + effect management (master + per-track)
 * - Track selection and global app state
 *
 * Architecture:
 * - React Context API with useMemo optimizations
 * - Independent master/track effects
 * - LocalStorage persistence
 * - Integrates with AudioManager and DBManager
 *
 * Effect Model:
 * - Per-track effects with independent enable/disable states
 * - Effects toggleable without removal
 *
 * Dependencies:
 * - useUserData (auth)
 * - AudioManager (audio ops)
 * - DBManager (IndexedDB)
 * - effectsStorage (defaults + merging)
 */
import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {useUserData} from "../hooks/useUserData";
import {createDefaultEffects, mergeWithDefaults} from "./effectsStorage";
import {audioManager} from "../managers/AudioManager";
import {dbManager} from "../managers/DBManager";

// ================================
// Context Creation
// ================================

/**
 * React Context for global application state
 * Provides access to user data, theme, effects, and audio management
 */
export const AppContext = createContext();

// ================================
// Initialization Utilities
// ================================

/**
 * Retrieves the initial active session ID from localStorage
 * @returns {number|null} Session ID or null if not set/invalid
 */
const getInitialActiveSession = () => {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return null;
  }

  try {
    const saved = window.localStorage.getItem("webamp.activeSession");
    return saved ? parseInt(saved, 10) : null;
  } catch (error) {
    console.warn("Failed to read initial active session:", error);
    return null;
  }
};

/**
 * Loads effect parameters for a specific session from localStorage
 * @param {number|null} activeSessionId - The session ID to load effects for
 * @returns {Object} Effect parameters merged with defaults
 */
const loadEffectParametersForSession = (activeSessionId) => {
  if (typeof activeSessionId !== "number") {
    return createDefaultEffects();
  }

  // Reads from the localStorage key set by the test
  try {
    const sessionData = window.localStorage.getItem("webamp.effectsBySession");
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      const effects = parsed.sessions?.[activeSessionId];
      if (effects) {
        return mergeWithDefaults(effects);
      }
    }
  } catch (error) {
    console.warn("Failed to read effect parameters:", error);
  }
  return createDefaultEffects();
};

/**
 * Retrieves the initial theme preference from localStorage
 * Defaults to "dark" theme if no preference is stored
 * @returns {string} "dark" or "light"
 */
const getInitialTheme = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return "dark";
  }

  try {
    return window.localStorage.getItem("webamp.theme") || "dark";
  } catch (error) {
    console.warn("Failed to read theme preference:", error);
    return "dark";
  }
};

/**
 * Performs shallow equality comparison of two effect objects
 * Used to prevent unnecessary effect re-application
 * @param {Object} a - First effects object
 * @param {Object} b - Second effects object
 * @returns {boolean} True if effects are shallowly equal
 */
const shallowEqualEffects = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};

// ================================
// Context Provider Component
// ================================

/**
 * AppContextProvider - Main provider component that manages all global state
 * @param {Object} props - React component props
 * @param {React.ReactNode} props.children - Child components that consume the context
 */
const AppContextProvider = ({children}) => {
  // ================================
  // User & Authentication State
  // ================================

  /**
   * User authentication data from useUserData hook
   * Includes username, email, and authentication status
   */
  const {userData, loading} = useUserData();

  /**
   * Currently active project in the workspace
   */
  const [activeProject, setActiveProject] = useState();

  /**
   * Trigger for refreshing database-dependent components
   * Incrementing this value forces re-fetching of DB data
   */
  const [dbRefreshTrigger, setDbRefreshTrigger] = useState(0);

  // ================================
  // Session & Theme State
  // ================================

  /**
   * Currently active session ID with localStorage persistence
   * Sessions allow users to work on multiple projects independently
   */
  const [activeSession, setActiveSession] = useState(getInitialActiveSession);

  /**
   * Application theme with localStorage persistence
   * Controls dark/light mode visual styling
   */
  const [theme, setTheme] = useState(getInitialTheme);

  /**
   * Reference to track the previous session for change detection
   */
  const lastSessionRef = useRef(activeSession);

  // ================================
  // Master Effects State (Global/Session-level)
  // ================================

  /**
   * Master effects applied globally to the entire session
   * These effects affect all audio output globally
   */
  const [effects, setEffects] = useState(() =>
    loadEffectParametersForSession(activeSession)
  );

  // ================================
  // Audio Engine Reference
  // ================================

  /**
   * Reference to the Web Audio API engine instance
   * Used to apply effects and control audio processing
   */
  const [engineRef, setEngineRef] = useState(null);

  // ================================
  // Effects Menu UI State
  // ================================

  /**
   * Controls visibility of the effects editing panel/modal
   */
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  // ================================
  // Per-Track Effects State
  // ================================

  /**
   * ID of the currently selected audio track
   * Null indicates no track is selected
   */
  const [selectedTrackId, setSelectedTrackId] = useState(null);

  /**
   * Effect parameter values for the currently selected track
   * Contains key-value pairs of effect names to their current values
   */
  const [selectedTrackEffects, setSelectedTrackEffects] = useState(null);

  /**
   * List of effect IDs that are currently active (added) for the selected track
   * Does not indicate whether effects are enabled/disabled
   */
  const [selectedTrackActiveEffects, setSelectedTrackActiveEffects] = useState(
    []
  );

  /**
   * Boolean map indicating which effects are enabled for the selected track
   * Key: effect ID, Value: true (enabled) or false (disabled)
   * Effects can be added but disabled (not applied to audio)
   */
  const [selectedTrackEnabledEffects, setSelectedTrackEnabledEffects] =
    useState({});

  // ================================
  // Derived State Values
  // ================================

  /**
   * Derived: Active effect IDs for the currently selected track
   * Alias for selectedTrackActiveEffects for clearer naming in context
   */
  const activeEffects = selectedTrackActiveEffects;

  /**
   * Derived: Enabled effects map for the currently selected track
   * Alias for selectedTrackEnabledEffects for clearer naming in context
   */
  const enabledEffects = selectedTrackEnabledEffects;

  // ================================
  // Effect Management Callbacks
  // ================================

  /**
   * Refreshes the selected track's effects state from the audio manager
   * Called when track selection changes or effects need synchronization
   */
  const refreshSelectedTrackEffects = useCallback(() => {
    if (!selectedTrackId) {
      // No track selected: clear all track effect state
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      setSelectedTrackEnabledEffects({});
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      // Track not found: clear state
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      setSelectedTrackEnabledEffects({});
      return;
    }

    // Ensure track has effect data structures initialized
    if (!track.effects) track.effects = createDefaultEffects();
    if (!track.activeEffectsList) track.activeEffectsList = [];
    if (!track.enabledEffects) track.enabledEffects = {};

    // Update React state with track's current effect data
    setSelectedTrackEffects({...track.effects});
    setSelectedTrackActiveEffects([...track.activeEffectsList]);
    setSelectedTrackEnabledEffects({...track.enabledEffects});

    const trackEnabled = track.enabledEffects || {};

    // Apply effects to audio engine if available
    if (engineRef?.current?.setTrackEffects) {
      // Preserve master gain to prevent volume jumps during effect application
      let masterGainBefore = null;
      let wasMuted = false;

      try {
        if (engineRef.current.master?.gain?.gain) {
          masterGainBefore = engineRef.current.master.gain.gain.value;

          // If effectively muted (gain < 0.001), lock it to prevent audio pops
          if (masterGainBefore < 0.001) {
            wasMuted = true;
            engineRef.current.master.gain.gain.cancelScheduledValues(0);
            engineRef.current.master.gain.gain.setValueAtTime(0, 0);
          }
        }
      } catch (e) {
        console.warn(
          "Could not lock master gain before track effect application",
          e
        );
      }

      // Apply track effects with enabled filter
      engineRef.current.setTrackEffects(
        selectedTrackId,
        track.effects,
        trackEnabled
      );

      // Restore master gain after effect application
      if (masterGainBefore !== null) {
        try {
          if (engineRef.current.master?.gain?.gain) {
            engineRef.current.master.gain.gain.cancelScheduledValues(0);
            engineRef.current.master.gain.gain.setValueAtTime(
              masterGainBefore,
              0
            );

            // Re-apply mute if track was muted
            if (wasMuted) {
              engineRef.current.master.gain.gain.setValueAtTime(0, 0);
            }
          }
        } catch (e) {
          console.warn(
            "Could not verify master gain after track effect application",
            e
          );
        }
      }
    }
  }, [selectedTrackId, engineRef]);

  /**
   * Updates selected track effect state when track selection changes
   */
  useEffect(() => {
    refreshSelectedTrackEffects();
  }, [selectedTrackId, refreshSelectedTrackEffects]);

  /**
   * Applies filtered effects to a specific track
   * Only applies effects that are enabled for that track
   * @param {string} trackId - ID of the track to apply effects to
   * @param {Object} allEffects - Complete effect parameter values
   */
  const applyFilteredEffectsToTrack = useCallback(
    (trackId, allEffects) => {
      if (!engineRef?.current || !trackId) return;

      const track = audioManager.getTrack(trackId);
      if (!track) return;

      // Use track's enabledEffects from IndexedDB
      const trackEnabled = track.enabledEffects || {};

      try {
        if (typeof engineRef.current.setTrackEffects === "function") {
          // Pass both the full effects map AND the enabled map
          engineRef.current.setTrackEffects(trackId, allEffects, trackEnabled);
        }
      } catch (e) {
        console.error(`[applyFilteredEffectsToTrack] Failed:`, e);
      }
    },
    [engineRef]
  );

  // ================================
  // Effect Parameter Manipulation
  // ================================

  /**
   * Updates a single effect parameter for the selected track
   * Handles special case for pan effect separately
   * @param {string} effectName - Name of the effect to update
   * @param {number} value - New value for the effect parameter
   */
  const updateEffect = useCallback(
    async (effectName, value) => {
      if (!selectedTrackId) {
        console.warn("[updateEffect] No track selected");
        return;
      }

      const track = audioManager.getTrack(selectedTrackId);
      if (!track) {
        console.warn("[updateEffect] Track not found:", selectedTrackId);
        return;
      }

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      console.log(
        `[updateEffect] Updating ${effectName} to ${numValue} for track ${selectedTrackId}`
      );

      // SPECIAL CASE: Pan effect uses the track's built-in pan control
      if (effectName === "pan") {
        // Update track model
        track.effects = {
          ...track.effects,
          pan: numValue,
        };

        // Update UI
        setSelectedTrackEffects(track.effects);

        // Update the track's actual pan control (not effects chain)
        if (
          engineRef?.current &&
          typeof engineRef.current.setTrackPan === "function"
        ) {
          try {
            engineRef.current.setTrackPan(selectedTrackId, numValue);
          } catch (e) {
            console.error(`[updateEffect] Failed to set pan:`, e);
          }
        }

        // Also update the track's pan property (for AudioTrack model)
        track.pan = numValue / 100; // Convert from -100 to 100 range to -1 to 1

        // Persist to IndexedDB
        try {
          await dbManager.updateTrack(track);
        } catch (e) {
          console.error(`[updateEffect] Failed to persist:`, e);
        }
        return;
      }

      // Normal effect handling for all other effects
      const newEffects = {
        ...track.effects,
        [effectName]: numValue,
      };
      track.effects = newEffects;

      // Update UI State
      setSelectedTrackEffects(newEffects);

      // Apply effects to engine with enabled map from track
      const trackEnabled = track.enabledEffects || {};
      if (engineRef?.current?.setTrackEffects) {
        engineRef.current.setTrackEffects(
          selectedTrackId,
          newEffects,
          trackEnabled
        );
      }

      // Persist to DB
      try {
        await dbManager.updateTrack(track);
      } catch (e) {
        console.error(`[updateEffect] Failed to persist effect update:`, e);
      }
    },
    [selectedTrackId, engineRef]
  );

  /**
   * Resets a single effect parameter to its default value
   * @param {string} effectName - Name of the effect to reset
   * @param {number} defaultValue - Default value to reset to
   */
  const resetEffect = useCallback(
    async (effectName, defaultValue) => {
      await updateEffect(effectName, defaultValue);
    },
    [updateEffect]
  );

  /**
   * Resets ALL effects for the selected track to their default values
   * Does not remove effects from the track, only resets their parameters
   */
  const resetAllEffects = useCallback(async () => {
    if (!selectedTrackId) return;

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) return;

    const defaultEffects = createDefaultEffects();

    console.log(`[resetAllEffects] Resetting all effects to defaults`);

    // 1. Update Track Model
    track.effects = defaultEffects;

    // 2. Update UI State
    setSelectedTrackEffects(defaultEffects);

    // 3. Update Audio Engine with filtered effects
    const trackEnabled = track.enabledEffects || {};
    if (engineRef?.current?.setTrackEffects) {
      engineRef.current.setTrackEffects(
        selectedTrackId,
        defaultEffects,
        trackEnabled
      );
    }

    // 4. Persist to DB
    try {
      await dbManager.updateTrack(track);
    } catch (e) {
      console.error(
        "[resetAllEffects] Failed to persist track effect reset:",
        e
      );
    }
  }, [selectedTrackId, engineRef]);

  // ================================
  // Effects Menu Control
  // ================================

  /**
   * Opens the effects editing menu/panel
   */
  const openEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(true);
  }, []);

  /**
   * Closes the effects editing menu/panel
   * Used by DropdownPortal to close effects menu when other menus are opened
   */
  const closeEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(false);
  }, []);

  // ================================
  // Effect Addition/Removal
  // ================================

  /**
   * Adds a new effect to the selected track
   * Effect is added as enabled by default
   * @param {string} effectId - ID of the effect to add
   */
  const addEffect = useCallback(
    async (effectId) => {
      if (!selectedTrackId) return;

      const track = audioManager.getTrack(selectedTrackId);
      if (!track) return;

      // Check if already added
      if (
        track.activeEffectsList &&
        track.activeEffectsList.includes(effectId)
      ) {
        console.log(`Effect ${effectId} already added`);
        return;
      }

      const defaults = createDefaultEffects();

      // Add to the active list
      if (!track.activeEffectsList) {
        track.activeEffectsList = [];
      }
      track.activeEffectsList.push(effectId);

      // Ensure effect has a value (use current or default)
      const newEffects = {
        ...track.effects,
        [effectId]: track.effects[effectId] ?? defaults[effectId],
      };

      track.effects = newEffects;

      // Initialize enabledEffects if not exists
      if (!track.enabledEffects) track.enabledEffects = {};

      // Set the effect as ENABLED by default
      track.enabledEffects = {
        ...track.enabledEffects,
        [effectId]: true,
      };

      setSelectedTrackEffects(newEffects);
      setSelectedTrackActiveEffects([...track.activeEffectsList]);
      setSelectedTrackEnabledEffects({...track.enabledEffects});

      console.log(
        `Added effect ${effectId}, active list:`,
        track.activeEffectsList
      );

      // Update engine with filtered effects
      if (engineRef?.current?.setTrackEffects) {
        engineRef.current.setTrackEffects(
          selectedTrackId,
          newEffects,
          track.enabledEffects
        );
      }

      // Persist to DB
      try {
        await dbManager.updateTrack(track);
      } catch (e) {
        console.error(e);
      }
    },
    [selectedTrackId, engineRef]
  );

  /**
   * Removes an effect from the selected track
   * Resets the effect value to default and removes from enabled effects
   * @param {string} effectId - ID of the effect to remove
   */
  const removeEffect = useCallback(
    async (effectId) => {
      if (!selectedTrackId) return;

      const track = audioManager.getTrack(selectedTrackId);
      if (!track) return;

      const defaults = createDefaultEffects();

      // Remove from active list
      if (track.activeEffectsList) {
        track.activeEffectsList = track.activeEffectsList.filter(
          (id) => id !== effectId
        );
      }

      // Reset value to default
      const newEffects = {
        ...track.effects,
        [effectId]: defaults[effectId],
      };

      track.effects = newEffects;

      // Remove from enabledEffects
      if (track.enabledEffects) {
        const newEnabledEffects = {...track.enabledEffects};
        delete newEnabledEffects[effectId];
        track.enabledEffects = newEnabledEffects;
      }

      setSelectedTrackEffects(newEffects);
      setSelectedTrackActiveEffects([...track.activeEffectsList]);
      setSelectedTrackEnabledEffects({...track.enabledEffects});

      console.log(
        `Removed effect ${effectId}, active list:`,
        track.activeEffectsList
      );

      // Update engine with filtered effects
      if (engineRef?.current?.setTrackEffects) {
        engineRef.current.setTrackEffects(
          selectedTrackId,
          newEffects,
          track.enabledEffects || {}
        );
      }

      try {
        await dbManager.updateTrack(track);
      } catch (e) {
        console.error(e);
      }
    },
    [selectedTrackId, engineRef]
  );

  // ================================
  // Effect Enable/Disable Toggles
  // ================================

  /**
   * Toggles a single effect on/off for the selected track
   * Effect remains in the active list but is not applied when disabled
   * @param {string} effectId - ID of the effect to toggle
   */
  const toggleEffect = useCallback(
    async (effectId) => {
      if (!selectedTrackId) return;

      const track = audioManager.getTrack(selectedTrackId);
      if (!track) return;

      if (!track.enabledEffects) track.enabledEffects = {};

      const currentState = track.enabledEffects[effectId] !== false;
      const nextEnabled = !currentState;

      // Update the track's enabledEffects
      const newEnabledEffects = {
        ...track.enabledEffects,
        [effectId]: nextEnabled,
      };

      track.enabledEffects = newEnabledEffects;

      // Update UI state
      setSelectedTrackEffects({...track.effects});
      setSelectedTrackEnabledEffects({...newEnabledEffects});

      // Apply to engine immediately
      if (engineRef?.current?.setTrackEffects) {
        engineRef.current.setTrackEffects(
          selectedTrackId,
          track.effects,
          newEnabledEffects
        );
      }

      // Persist to IndexedDB
      try {
        await dbManager.updateTrack(track);
      } catch (e) {
        console.error(`[toggleEffect] Failed to persist enabled state:`, e);
      }
    },
    [selectedTrackId, engineRef]
  );

  /**
   * Toggles ALL effects on/off for the selected track
   * Pan effect is excluded from toggling as it's always enabled in UI
   */
  const toggleAllEffects = useCallback(async () => {
    if (!selectedTrackId) return;

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) return;

    if (!track.enabledEffects) track.enabledEffects = {};
    if (!track.activeEffectsList) track.activeEffectsList = [];

    // Get effects to toggle (excluding pan)
    const effectsToToggle = track.activeEffectsList.filter(
      (effectId) => effectId !== "pan"
    );

    // If no effects to toggle (or only pan exists), return
    if (effectsToToggle.length === 0) return;

    // Determine if any of the toggleable effects are currently enabled
    const anyEnabled = effectsToToggle.some(
      (effectId) => track.enabledEffects[effectId] !== false
    );

    // Toggle all toggleable effects
    const newEnabledEffects = {...track.enabledEffects};
    effectsToToggle.forEach((effectId) => {
      newEnabledEffects[effectId] = !anyEnabled;
    });

    // Preserve pan's enabled state (pan is always enabled in UI, but we keep its state)
    // If pan doesn't have a state yet, set it to true (enabled)
    if (newEnabledEffects.pan === undefined) {
      newEnabledEffects.pan = true;
    }

    track.enabledEffects = newEnabledEffects;

    // Update UI state
    setSelectedTrackEffects({...track.effects});
    setSelectedTrackEnabledEffects({...newEnabledEffects});

    // Apply to engine immediately
    if (engineRef?.current?.setTrackEffects) {
      engineRef.current.setTrackEffects(
        selectedTrackId,
        track.effects,
        newEnabledEffects
      );
    }

    // Persist to IndexedDB
    try {
      await dbManager.updateTrack(track);
    } catch (e) {
      console.error(`[toggleAllEffects] Failed to persist enabled state:`, e);
    }
  }, [selectedTrackId, engineRef]);

  // ================================
  // Engine Effect Application
  // ================================

  /**
   * Applies only enabled effects to the audio engine
   * Used for master/session-level effects application
   * @param {Object} currentEffects - Effects to apply (filtered by enabled state)
   */
  const applyEffectsToEngine = useCallback(
    (currentEffects) => {
      if (!engineRef?.current || !selectedTrackId) return;

      const track = audioManager.getTrack(selectedTrackId);
      if (!track) return;

      const trackEnabled = track.enabledEffects || {};

      const enabledEffectsToApply = {};
      Object.keys(currentEffects).forEach((effectId) => {
        if (trackEnabled[effectId] !== false) {
          enabledEffectsToApply[effectId] = currentEffects[effectId];
        }
      });

      // Store master volume state before applying effects
      let masterGainBefore = null;
      try {
        if (engineRef.current.master?.gain?.gain) {
          masterGainBefore = engineRef.current.master.gain.gain.value;
        }
      } catch (e) {
        console.error(e);
      }

      // Apply effects only if they differ from current engine state
      try {
        if (
          !shallowEqualEffects(enabledEffectsToApply, engineRef.current.effects)
        ) {
          engineRef.current.applyEffects(enabledEffectsToApply);
        }
      } catch (e) {
        console.error("Failed to apply master effects to engine:", e);
      }

      // Restore master volume state after effect application
      try {
        if (masterGainBefore !== null && engineRef.current.master?.gain?.gain) {
          engineRef.current.master.gain.gain.value = masterGainBefore;
        }
      } catch (e) {
        console.log(e);
      }
    },
    [engineRef, selectedTrackId]
  );

  /**
   * Deletes ALL effects from the selected track
   * Removes effects from active list and clears enabled states
   */
  const deleteAllEffects = useCallback(async () => {
    if (!selectedTrackId) return;

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) return;

    const defaultEffects = createDefaultEffects();
    track.effects = defaultEffects;
    track.activeEffectsList = [];
    track.enabledEffects = {}; // Clear enabled effects

    setSelectedTrackEffects(defaultEffects);
    setSelectedTrackActiveEffects([]);
    setSelectedTrackEnabledEffects({});

    if (engineRef?.current?.setTrackEffects) {
      try {
        engineRef.current.setTrackEffects(selectedTrackId, {});
      } catch (e) {
        console.error(e);
      }
    }

    try {
      await dbManager.updateTrack(track);
    } catch (e) {
      console.error(e);
    }
  }, [selectedTrackId, engineRef]);

  // ================================
  // Session Management Effects
  // ================================

  /**
   * Effect: Manages session changes and effect loading
   * Persists active session to localStorage and loads session-specific effects
   */
  useEffect(() => {
    if (activeSession === undefined) return;

    try {
      if (activeSession === null) {
        window.localStorage.removeItem("webamp.activeSession");
      } else {
        window.localStorage.setItem(
          "webamp.activeSession",
          String(activeSession)
        );
      }
    } catch (e) {
      console.error(e);
    }

    // Only run this block once per actual session change
    if (lastSessionRef.current !== activeSession) {
      lastSessionRef.current = activeSession;

      // Clear track selection when session changes
      setSelectedTrackId(null);
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      setSelectedTrackEnabledEffects({});
    }

    // --- session-level loading (master effects) ---
    if (typeof activeSession === "number") {
      const loadedEffectsParams =
        loadEffectParametersForSession(activeSession) || createDefaultEffects();
      setEffects(loadedEffectsParams);

      // Preserve master volume when changing sessions
      let masterGainBefore = null;
      let wasMuted = false;
      try {
        const savedVol = window.localStorage.getItem("webamp.masterVol");
        const savedMuted = window.localStorage.getItem("webamp.muted");
        if (savedVol !== null) {
          masterGainBefore = Math.max(0, Math.min(1, Number(savedVol) / 100));
        }
        if (savedMuted !== null) {
          wasMuted = savedMuted === "1";
        }
        if (wasMuted) {
          masterGainBefore = 0;
        }
      } catch (e) {
        console.log(e);
      }

      // Apply master-level session effects
      if (engineRef?.current) {
        try {
          // Clear master-level effects
          engineRef.current.applyEffects?.({});
          // Apply master session effects
          engineRef.current.applyEffects?.(loadedEffectsParams);
        } catch (e) {
          console.error("[Session Change] Failed to apply master effects:", e);
        }

        // Restore master volume after applying effects
        if (masterGainBefore !== null) {
          try {
            if (engineRef.current.master?.gain?.gain) {
              engineRef.current.master.gain.gain.value = masterGainBefore;
            }
          } catch (e) {
            console.warn(
              "Could not restore master volume after session change",
              e
            );
          }
        }
      }

      // We need to wait for tracks to be loaded by AudioPage, then apply per-track effects
      // Use an interval to check when tracks are available
      const checkAndApplyTrackEffects = () => {
        if (engineRef?.current && audioManager.tracks?.length > 0) {
          // Store master volume before applying track effects
          let masterGainBeforeTrackEffects = null;
          try {
            if (engineRef.current.master?.gain?.gain) {
              masterGainBeforeTrackEffects =
                engineRef.current.master.gain.gain.value;
            }
          } catch (e) {
            console.error(e);
          }

          try {
            // Reapply effects for all tracks currently present
            audioManager.tracks?.forEach((track) => {
              if (!track?.id) return;

              // Get enabledEffects from the track (loaded from IndexedDB)
              const trackEnabled = track.enabledEffects || {};
              console.log(
                `[Session ${activeSession}] Applying effects for track ${track.id} with enabled map:`,
                trackEnabled
              );

              if (engineRef.current.setTrackEffects) {
                engineRef.current.setTrackEffects(
                  track.id,
                  track.effects || loadedEffectsParams,
                  trackEnabled
                );
              }
            });

            // Restore master volume after all track effects
            if (masterGainBeforeTrackEffects !== null) {
              try {
                if (engineRef.current.master?.gain?.gain) {
                  engineRef.current.master.gain.gain.value =
                    masterGainBeforeTrackEffects;
                }
              } catch (e) {
                console.error(e);
              }
            }

            return true; // Successfully applied
          } catch (e) {
            console.error("[Session Change] Failed to apply track effects:", e);
            return false;
          }
        }
        return false; // Tracks not ready yet
      };

      // Try immediately
      let applied = checkAndApplyTrackEffects();

      // If not applied, set up interval to retry
      let retryCount = 0;
      const maxRetries = 10; // Try for up to 2 seconds (200ms * 10)
      const retryInterval = 200; // ms

      const retryId = setInterval(() => {
        if (applied || retryCount >= maxRetries) {
          clearInterval(retryId);
          if (!applied && retryCount >= maxRetries) {
            console.warn(
              `[Session ${activeSession}] Failed to apply track effects after ${maxRetries} retries`
            );
          }
          return;
        }

        retryCount++;
        applied = checkAndApplyTrackEffects();
      }, retryInterval);

      // Cleanup on unmount or session change
      return () => {
        clearInterval(retryId);
      };
    }
  }, [activeSession, engineRef]);

  /**
   * Effect: Loads master effects from localStorage on initial mount
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("webamp.masterEffects");
      if (saved) {
        const parsed = JSON.parse(saved);
        setEffects(mergeWithDefaults(parsed));
      }
    } catch (e) {
      console.warn("Failed to load master effects:", e);
    }
  }, []);

  /**
   * Effect: Applies master effects to audio engine when they change
   */
  useEffect(() => {
    // Apply effect parameter values to the audio engine (only enabled ones)
    applyEffectsToEngine(effects);
  }, [effects, applyEffectsToEngine]);

  // ================================
  // Theme Management Effects
  // ================================

  /**
   * Effect: Persists theme to localStorage and applies CSS classes
   */
  useEffect(() => {
    try {
      window.localStorage?.setItem("webamp.theme", theme);
    } catch (e) {
      console.warn("Failed to store theme preference:", e);
    }

    if (typeof document !== "undefined") {
      document.body.classList.remove("theme-dark", "theme-light");
      document.body.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  // ================================
  // Engine Reference Management
  // ================================

  /**
   * Effect: Adopts engine reference from window object if available
   * Used for global engine access across components
   */
  useEffect(() => {
    try {
      if (!engineRef && window.__WebAmpEngineRef) {
        setEngineRef(window.__WebAmpEngineRef);
      }
    } catch (e) {
      console.warn(e);
    }
  }, [engineRef]);

  // ================================
  // Database Refresh Utility
  // ================================

  /**
   * Triggers a refresh of database-dependent components
   * Increments dbRefreshTrigger to force re-fetching
   */
  const refreshDB = useCallback(() => {
    setDbRefreshTrigger((prev) => prev + 1);
  }, []);

  // ================================
  // Context Value Assembly
  // ================================

  /**
   * Memoized context value containing all state and functions
   * Optimized with useMemo to prevent unnecessary re-renders
   */
  const contextValue = useMemo(
    () => ({
      // User & Session Management
      userData,
      loading,
      activeProject,
      setActiveProject,
      activeSession,
      setActiveSession,
      theme,
      setTheme,

      // Master Effects (Global/Session-level)
      effects,
      setEffects,

      // Track Selection & State
      selectedTrackId,
      setSelectedTrackId,
      selectedTrackEffects,
      activeEffects, // Derived array of strings

      // Effect Parameter Manipulation
      updateEffect,
      resetEffect,
      resetAllEffects,
      deleteAllEffects,

      // Audio Engine Reference
      engineRef,
      setEngineRef,

      // Effects Menu UI Control
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,

      // Effect Management (Add/Remove)
      addEffect,
      removeEffect,

      // Effect Enable/Disable Toggles
      enabledEffects,
      toggleEffect,
      toggleAllEffects,

      // Track Active Effects Management
      selectedTrackActiveEffects,
      setSelectedTrackActiveEffects,

      // Track Effect Application
      applyFilteredEffectsToTrack,

      // Database Refresh
      refreshDB,
      dbRefreshTrigger,
    }),
    [
      userData,
      loading,
      activeProject,
      setActiveProject,
      activeSession,
      setActiveSession,
      theme,
      setTheme,
      effects,
      setEffects,
      selectedTrackId,
      setSelectedTrackId,
      selectedTrackEffects,
      activeEffects,
      updateEffect,
      resetEffect,
      resetAllEffects,
      deleteAllEffects,
      engineRef,
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,
      addEffect,
      removeEffect,
      enabledEffects,
      toggleEffect,
      toggleAllEffects,
      selectedTrackActiveEffects,
      setSelectedTrackActiveEffects,
      applyFilteredEffectsToTrack,
      refreshDB,
      dbRefreshTrigger,
    ]
  );

  // ================================
  // Provider Render
  // ================================

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;
