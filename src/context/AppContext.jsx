import {createContext, useState, useEffect, useCallback, useMemo} from "react";
import {useUserData} from "../hooks/useUserData";
import {
  createDefaultEffects,
  mergeWithDefaults,
  loadActiveEffectsForSession,
  persistActiveEffectsForSession,
  createDefaultActiveEffects,
} from "./effectsStorage";
import {audioManager} from "../managers/AudioManager";
import {dbManager} from "../managers/DBManager";

export const AppContext = createContext();

// Function to get the initial active session ID from Local Storage
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

// Load enabled effects for session
const loadEnabledEffectsForSession = (activeSessionId) => {
  if (typeof activeSessionId !== "number") {
    return {};
  }

  try {
    const sessionData = window.localStorage.getItem(
      "webamp.enabledEffectsBySession"
    );
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      return parsed.sessions?.[activeSessionId] || {};
    }
  } catch (error) {
    console.warn("Failed to read enabled effects:", error);
  }
  return {};
};

// Persist enabled effects for session
const persistEnabledEffectsForSession = (activeSessionId, enabledEffects) => {
  if (typeof activeSessionId !== "number") return;

  try {
    const sessionData = window.localStorage.getItem(
      "webamp.enabledEffectsBySession"
    );
    const parsed = sessionData ? JSON.parse(sessionData) : {sessions: {}};

    parsed.sessions[activeSessionId] = enabledEffects;
    window.localStorage.setItem(
      "webamp.enabledEffectsBySession",
      JSON.stringify(parsed)
    );
  } catch (error) {
    console.warn("Failed to persist enabled effects:", error);
  }
};

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

const shallowEqualEffects = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};

const AppContextProvider = ({children}) => {
  // User Data
  const {userData, loading} = useUserData();

  const [activeProject, setActiveProject] = useState();

  // Active session state with localStorage persistence
  const [activeSession, setActiveSession] = useState(getInitialActiveSession);

  // Master Effect State (Global Session Effects)
  const [effects, setEffects] = useState(() =>
    loadEffectParametersForSession(activeSession)
  );

  const [engineRef, setEngineRef] = useState(null);

  // Effects Menu State
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  // Per-track effects state
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedTrackEffects, setSelectedTrackEffects] = useState(null);
  const [selectedTrackActiveEffects, setSelectedTrackActiveEffects] = useState(
    []
  );

  // Session-specific enabled effects state
  const [enabledEffects, setEnabledEffects] = useState(() =>
    loadEnabledEffectsForSession(activeSession)
  );

  // Derived state: The list of active effect IDs for the CURRENTLY selected track.
  const activeEffects = selectedTrackActiveEffects;

  const refreshSelectedTrackEffects = useCallback(() => {
    if (!selectedTrackId) {
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (track) {
      if (!track.effects) {
        track.effects = createDefaultEffects();
      }
      if (!track.activeEffectsList) {
        track.activeEffectsList = [];
      }
      setSelectedTrackEffects({...track.effects});
      setSelectedTrackActiveEffects([...track.activeEffectsList]);
    } else {
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
    }
  }, [selectedTrackId]);

  // Update effect when selection changes
  useEffect(() => {
    refreshSelectedTrackEffects();
  }, [selectedTrackId, refreshSelectedTrackEffects]);

  const applyFilteredEffectsToTrack = useCallback(
  (trackId, allEffects) => {
    if (!engineRef?.current || !trackId) return;

    // Filter effects to only include enabled ones
    const filteredEffects = {};
    Object.keys(allEffects).forEach((effectId) => {
      if (enabledEffects[effectId] !== false) {
        filteredEffects[effectId] = allEffects[effectId];
      }
    });

    try {
      if (typeof engineRef.current.setTrackEffects === "function") {
        engineRef.current.setTrackEffects(trackId, filteredEffects);
      }
    } catch (e) {
      console.error(`[applyFilteredEffectsToTrack] Failed:`, e);
    }
  },
  [engineRef, enabledEffects]
);

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

    // Update the effect value in track.effects
    const newEffects = {
      ...track.effects,
      [effectName]: numValue,
    };
    track.effects = newEffects;

    // Update UI State
    setSelectedTrackEffects(newEffects);

    // Apply filtered effects to audio engine
    applyFilteredEffectsToTrack(selectedTrackId, newEffects);

    // Check if effect is enabled
    const isEffectEnabled = enabledEffects[effectName] !== false;

    // Apply to audio engine only if enabled
    if (isEffectEnabled) {
      if (
        engineRef?.current &&
        typeof engineRef.current.setTrackEffects === "function"
      ) {
        try {
          engineRef.current.setTrackEffects(selectedTrackId, {
            [effectName]: numValue, // Only send the updated effect
          });
        } catch (e) {
          console.error(
            `[updateEffect] Failed to set effect ${effectName} on engine:`,
            e
          );
        }
      }
    } else {
      console.log(`[updateEffect] Effect ${effectName} is disabled, not applying to engine`);
    }

    // Persist to DB
    try {
      await dbManager.updateTrack(track);
    } catch (e) {
      console.error(`[updateEffect] Failed to persist effect update:`, e);
    }
  },
  [selectedTrackId, engineRef, enabledEffects, applyFilteredEffectsToTrack]
);

  const resetEffect = useCallback(
    async (effectName, defaultValue) => {
      await updateEffect(effectName, defaultValue);
    },
    [updateEffect]
  );

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
  applyFilteredEffectsToTrack(selectedTrackId, defaultEffects);

  // 4. Persist to DB
  try {
    await dbManager.updateTrack(track);
  } catch (e) {
    console.error(
      "[resetAllEffects] Failed to persist track effect reset:",
      e
    );
  }
}, [selectedTrackId, applyFilteredEffectsToTrack]); // Update dependencies

  const openEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(true);
  }, []);

  const closeEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(false);
  }, []);

const addEffect = useCallback(
  (effectId) => {
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
    setSelectedTrackEffects(newEffects);
    setSelectedTrackActiveEffects([...track.activeEffectsList]);

    // CRITICAL: Set the effect as ENABLED by default
    setEnabledEffects((prev) => {
      const newEnabledEffects = {
        ...prev,
        [effectId]: true, // Explicitly set to true
      };
      return newEnabledEffects;
    });

    console.log(
      `Added effect ${effectId}, active list:`,
      track.activeEffectsList
    );

    // Update engine with filtered effects
    applyFilteredEffectsToTrack(selectedTrackId, newEffects);

    // Persist to DB
    dbManager.updateTrack(track).catch((e) => console.error(e));
  },
  [selectedTrackId, applyFilteredEffectsToTrack]
);

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
    setSelectedTrackEffects(newEffects);
    setSelectedTrackActiveEffects([...track.activeEffectsList]);

    // CRITICAL: Remove from enabledEffects
    setEnabledEffects((prev) => {
      const newEnabledEffects = {...prev};
      delete newEnabledEffects[effectId];
      return newEnabledEffects;
    });

    console.log(
      `Removed effect ${effectId}, active list:`,
      track.activeEffectsList
    );

    // Update engine with filtered effects
    applyFilteredEffectsToTrack(selectedTrackId, newEffects);

    try {
      await dbManager.updateTrack(track);
    } catch (e) {
      console.error(e);
    }
  },
  [selectedTrackId, applyFilteredEffectsToTrack]
);


  // Toggle individual effect on/off - per-track enabled effects
// Toggle individual effect on/off - per-track enabled effects
// Toggle individual effect on/off - per-track enabled effects
const toggleEffect = useCallback(
  (effectId) => {
    console.log(`[toggleEffect] effectId: ${effectId}`);
    setEnabledEffects((prev) => {
      const currentState = prev[effectId] !== false; // true if enabled (undefined === enabled)
      const nextEnabled = !currentState;
      const newEnabledEffects = {...prev, [effectId]: nextEnabled};

      // Immediately compute filtered effects and apply to engine so we don't rely on state being flushed
      if (
        selectedTrackId &&
        selectedTrackEffects &&
        engineRef?.current &&
        typeof engineRef.current.setTrackEffects === "function"
      ) {
        try {
          const filtered = {};
          Object.keys(selectedTrackEffects).forEach((id) => {
            if (newEnabledEffects[id] !== false) {
              filtered[id] = selectedTrackEffects[id];
            }
          });
          engineRef.current.setTrackEffects(selectedTrackId, filtered);
        } catch (e) {
          console.error(`[toggleEffect] Failed to apply filtered effects:`, e);
        }
      }

      return newEnabledEffects;
    });
  },
  [selectedTrackId, selectedTrackEffects, engineRef]
);

// Toggle all effects on/off - per-track enabled effects
const toggleAllEffects = useCallback(() => {
  setEnabledEffects((prev) => {
    // determine whether any active effect is currently enabled (undefined counts as enabled)
    const anyEnabled = activeEffects.some((effectId) => prev[effectId] !== false);

    // Build new enabled map for all active effects
    const newEnabledEffects = {...prev};
    activeEffects.forEach((effectId) => {
      newEnabledEffects[effectId] = !anyEnabled;
    });

    // Immediately apply to engine using the new map
    if (
      selectedTrackId &&
      selectedTrackEffects &&
      engineRef?.current &&
      typeof engineRef.current.setTrackEffects === "function"
    ) {
      try {
        const filtered = {};
        Object.keys(selectedTrackEffects).forEach((id) => {
          if (newEnabledEffects[id] !== false) {
            filtered[id] = selectedTrackEffects[id];
          }
        });
        engineRef.current.setTrackEffects(selectedTrackId, filtered);
      } catch (e) {
        console.error("[toggleAllEffects] Failed to apply filtered effects:", e);
      }
    }

    return newEnabledEffects;
  });
}, [activeEffects, selectedTrackId, selectedTrackEffects, engineRef]);


  // Apply only enabled effects to engine
  const applyEffectsToEngine = useCallback(
    (currentEffects) => {
      if (!engineRef) {
        return;
      }
      try {
        // Filter effects to only include enabled ones
        const enabledEffectsToApply = {};
        Object.keys(currentEffects).forEach((effectId) => {
          if (enabledEffects[effectId] !== false) {
            // Default to true if not set
            enabledEffectsToApply[effectId] = currentEffects[effectId];
          }
        });

        if (
          !shallowEqualEffects(enabledEffectsToApply, engineRef.current.effects)
        ) {
          engineRef.current.applyEffects(enabledEffectsToApply);
        }
      } catch (e) {
        console.error("Failed to apply master effects to engine:", e);
      }
    },
    [engineRef, enabledEffects]
  );

const deleteAllEffects = useCallback(() => {
  if (!selectedTrackId) return;

  const track = audioManager.getTrack(selectedTrackId);
  if (!track) return;

  // Reset all effect values to defaults
  const defaultEffects = createDefaultEffects();
  track.effects = defaultEffects;

  // Remove all effects from the active list
  track.activeEffectsList = [];

  // Update UI
  setSelectedTrackEffects(defaultEffects);
  setSelectedTrackActiveEffects([]);

  // Clear enabled effects for this track
  setEnabledEffects({});

  // Update engine
  if (
    engineRef?.current &&
    typeof engineRef.current.setTrackEffects === "function"
  ) {
    try {
      engineRef.current.setTrackEffects(selectedTrackId, defaultEffects);
    } catch (e) {
      console.error(e);
    }
  }

  // Persist to DB
  dbManager.updateTrack(track).catch((e) => console.error(e));
}, [selectedTrackId, engineRef]);


// Persist activeSession (ID) and load session data (clear & reapply to engine)
useEffect(() => {
  if (activeSession === undefined) return;

  try {
    if (activeSession === null) {
      window.localStorage.removeItem("webamp.activeSession");
    } else {
      window.localStorage.setItem("webamp.activeSession", String(activeSession));
    }
  } catch {}

  if (typeof activeSession === "number") {
    // Load session-level blobs
    const loadedEffectsParams = loadEffectParametersForSession(activeSession) || createDefaultEffects();
    setEffects(loadedEffectsParams);

    const loadedEnabledEffects = loadEnabledEffectsForSession(activeSession) || {};
    setEnabledEffects(loadedEnabledEffects);

    // If engine is available, clear previous state and reapply filtered values immediately
    if (engineRef?.current) {
      try {
        // 1) Clear master-level effects (so we don't leave stale keys)
        if (typeof engineRef.current.applyEffects === "function") {
          engineRef.current.applyEffects({}); // replace master effects with empty map
        }

        // 2) If the engine exposes per-track state and a setTrackEffects, try to clear all tracks.
        //    We don't know all track IDs here, but clearing the selectedTrackId prevents the "stuck" case.
        if (
          selectedTrackId &&
          typeof engineRef.current.setTrackEffects === "function"
        ) {
          // Clear per-track effects for selectedTrack to remove any leftover values
          try {
            engineRef.current.setTrackEffects(selectedTrackId, {});
          } catch (e) {
            // If clearing isn't supported, ignore and continue to reapply below
          }
        }

        // 3) Apply session MASTER effects filtered by loadedEnabledEffects
        //    (undefined in loadedEnabledEffects === enabled)
        const masterFiltered = {};
        Object.keys(loadedEffectsParams).forEach((id) => {
          if (loadedEnabledEffects[id] !== false) {
            masterFiltered[id] = loadedEffectsParams[id];
          }
        });
        if (typeof engineRef.current.applyEffects === "function") {
          engineRef.current.applyEffects(masterFiltered);
        }

        // 4) Also re-apply the currently selected TRACK's effects filtered by loadedEnabledEffects,
        //    because per-track params may differ from session master params.
        if (
          selectedTrackId &&
          typeof engineRef.current.setTrackEffects === "function"
        ) {
          const track = audioManager.getTrack(selectedTrackId);
          const trackEffects = (track && track.effects) ? track.effects : loadedEffectsParams;
          const trackFiltered = {};
          Object.keys(trackEffects).forEach((id) => {
            if (loadedEnabledEffects[id] !== false) {
              trackFiltered[id] = trackEffects[id];
            }
          });

          engineRef.current.setTrackEffects(selectedTrackId, trackFiltered);
        }

        console.log("[Session Change] engine cleared and session-filtered effects applied");
      } catch (e) {
        console.error("[Session Change] Failed to clear/reapply effects:", e);
      }
    }
  }
}, [activeSession, selectedTrackId, engineRef]);



  // Persist enabled effects and Apply Master Effect Parameter Values to Engine
  useEffect(() => {
    // Only persist if there's an active session
    if (typeof activeSession === "number") {
      // Persist enabled effects per-session
      persistEnabledEffectsForSession(activeSession, enabledEffects);
    }

    // Apply effect parameter values to the audio engine (only enabled ones)
    applyEffectsToEngine(effects);
  }, [effects, activeSession, applyEffectsToEngine, enabledEffects]);

  // Engine ref adoption
  useEffect(() => {
    try {
      if (!engineRef && window.__WebAmpEngineRef) {
        setEngineRef(window.__WebAmpEngineRef);
      }
    } catch {}
  }, [engineRef]);

  const contextValue = useMemo(
    () => ({
      userData,
      loading,
      activeProject,
      setActiveProject,
      activeSession,
      setActiveSession,

      // Master Effects
      effects,
      setEffects,

      // Track Effects
      selectedTrackId,
      setSelectedTrackId,
      selectedTrackEffects,
      activeEffects, // Derived array of strings

      // Effect Functions
      updateEffect,
      resetEffect,
      resetAllEffects,
      deleteAllEffects,

      // Engine
      engineRef,
      setEngineRef,

      // Effects Menu State
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,

      // Effect Management
      addEffect,
      removeEffect,

      // Toggle Functionality
      enabledEffects,
      toggleEffect,
      toggleAllEffects,

      // Track Active Effects
      selectedTrackActiveEffects,
      setSelectedTrackActiveEffects,

      applyFilteredEffectsToTrack,
    }),
    [
      userData,
      loading,
      activeProject,
      setActiveProject,
      activeSession,
      setActiveSession,
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
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;