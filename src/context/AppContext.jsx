import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
const persistEnabledEffectsForSession = (
  activeSessionId,
  enabledEffectsByTrack
) => {
  if (typeof activeSessionId !== "number") return;

  try {
    const sessionData = window.localStorage.getItem(
      "webamp.enabledEffectsBySession"
    );
    const parsed = sessionData ? JSON.parse(sessionData) : {sessions: {}};

    parsed.sessions[activeSessionId] = enabledEffectsByTrack; // save per-track map
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

  const lastSessionRef = useRef(activeSession);

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
  const [enabledEffectsByTrack, setEnabledEffectsByTrack] = useState(() =>
    loadEnabledEffectsForSession(activeSession)
  );

  // Derived state: The list of active effect IDs for the CURRENTLY selected track.
  const activeEffects = selectedTrackActiveEffects;

  // place after selectedTrackId & enabledEffectsByTrack are declared
  const enabledEffects = selectedTrackId
    ? enabledEffectsByTrack[selectedTrackId] || {}
    : {};

  const refreshSelectedTrackEffects = useCallback(() => {
    if (!selectedTrackId) {
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      return;
    }

    if (!track.effects) track.effects = createDefaultEffects();
    if (!track.activeEffectsList) track.activeEffectsList = [];

    setSelectedTrackEffects({...track.effects});
    setSelectedTrackActiveEffects([...track.activeEffectsList]);

    // Apply only enabled effects to engine
    const trackEnabled = enabledEffectsByTrack[selectedTrackId] || {};
    const filteredEffects = {};
    Object.keys(track.effects).forEach((id) => {
      if (trackEnabled[id] !== false) {
        filteredEffects[id] = track.effects[id];
      }
    });

    if (engineRef?.current?.setTrackEffects) {
      engineRef.current.setTrackEffects(selectedTrackId, filteredEffects);
    }
  }, [selectedTrackId, enabledEffectsByTrack, engineRef]);

  // Update effect when selection changes
  useEffect(() => {
    refreshSelectedTrackEffects();
  }, [selectedTrackId, refreshSelectedTrackEffects]);

  const applyFilteredEffectsToTrack = useCallback(
    (trackId, allEffects) => {
      if (!engineRef?.current || !trackId) return;

      const trackEnabled = enabledEffectsByTrack[trackId] || {};

      // Filter effects to only include enabled ones
      const filteredEffects = {};
      Object.keys(allEffects).forEach((effectId) => {
        if (trackEnabled[effectId] !== false) {
          filteredEffects[effectId] = allEffects[effectId];
        }
      });

      try {
        if (typeof engineRef.current.setTrackEffects === "function") {
          // Pass both the full effects map AND the enabled map
          engineRef.current.setTrackEffects(trackId, allEffects, trackEnabled);
        }
      } catch (e) {
        console.error(`[applyFilteredEffectsToTrack] Failed:`, e);
      }
    },
    [engineRef, enabledEffectsByTrack]
  );

  const updateEffect = useCallback(
    async (effectName, value) => {
      if (!selectedTrackId) return;

      const track = audioManager.getTrack(selectedTrackId);
      if (!track) return;

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const newEffects = {...track.effects, [effectName]: numValue};
      track.effects = newEffects;

      setSelectedTrackEffects(newEffects);

      const trackEnabled = enabledEffectsByTrack[selectedTrackId] || {};
      // Apply effects to engine with enabled map
      if (engineRef?.current?.setTrackEffects) {
        engineRef.current.setTrackEffects(
          selectedTrackId,
          newEffects,
          trackEnabled
        );
      }

      try {
        await dbManager.updateTrack(track);
      } catch (e) {
        console.error(`[updateEffect] Failed to persist effect update:`, e);
      }
    },
    [selectedTrackId, enabledEffectsByTrack, engineRef]
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
      setEnabledEffectsByTrack((prev) => {
        const trackEnabled = prev[selectedTrackId] || {};
        const newTrackEnabled = {
          ...trackEnabled,
          [effectId]: true, // Enable effect for this track
        };
        return {
          ...prev,
          [selectedTrackId]: newTrackEnabled,
        };
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
      setEnabledEffectsByTrack((prev) => {
        const trackEnabled = prev[selectedTrackId] || {};
        const newTrackEnabled = {...trackEnabled};
        delete newTrackEnabled[effectId]; // Remove effect from this track

        return {
          ...prev,
          [selectedTrackId]: newTrackEnabled,
        };
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
  const toggleEffect = useCallback(
    (effectId) => {
      if (!selectedTrackId) return;

      setEnabledEffectsByTrack((prev) => {
        const trackEnabled = prev[selectedTrackId] || {};
        const currentState = trackEnabled[effectId] !== false;
        const nextEnabled = !currentState;

        const newTrackEnabled = {
          ...trackEnabled,
          [effectId]: nextEnabled,
        };

        // Apply filtered effects to engine immediately
        if (selectedTrackEffects && engineRef?.current?.setTrackEffects) {
          const filtered = {};
          Object.keys(selectedTrackEffects).forEach((id) => {
            if (newTrackEnabled[id] !== false) {
              filtered[id] = selectedTrackEffects[id];
            }
          });
          engineRef.current.setTrackEffects(selectedTrackId, filtered);
        }

        return {
          ...prev,
          [selectedTrackId]: newTrackEnabled,
        };
      });
    },
    [selectedTrackId, selectedTrackEffects, engineRef]
  );

  // Toggle all effects on/off - per-track enabled effects
  const toggleAllEffects = useCallback(() => {
    if (!selectedTrackId) return;

    setEnabledEffectsByTrack((prev) => {
      const trackEnabled = prev[selectedTrackId] || {};

      // Determine if any effect is currently enabled
      const anyEnabled = activeEffects.some(
        (effectId) => trackEnabled[effectId] !== false
      );

      // Toggle all active effects
      const newTrackEnabled = {};
      activeEffects.forEach((effectId) => {
        newTrackEnabled[effectId] = !anyEnabled;
      });

      // Apply filtered effects to engine immediately
      if (selectedTrackEffects && engineRef?.current?.setTrackEffects) {
        const filtered = {};
        Object.keys(selectedTrackEffects).forEach((id) => {
          if (newTrackEnabled[id] !== false) {
            filtered[id] = selectedTrackEffects[id];
          }
        });
        engineRef.current.setTrackEffects(selectedTrackId, filtered);
      }

      return {
        ...prev,
        [selectedTrackId]: newTrackEnabled,
      };
    });
  }, [selectedTrackId, selectedTrackEffects, engineRef, activeEffects]);

  // Apply only enabled effects to engine
  const applyEffectsToEngine = useCallback(
    (currentEffects) => {
      if (!engineRef?.current || !selectedTrackId) return;

      const trackEnabled = enabledEffectsByTrack[selectedTrackId] || {};

      const enabledEffectsToApply = {};
      Object.keys(currentEffects).forEach((effectId) => {
        if (trackEnabled[effectId] !== false) {
          enabledEffectsToApply[effectId] = currentEffects[effectId];
        }
      });

      try {
        if (
          !shallowEqualEffects(enabledEffectsToApply, engineRef.current.effects)
        ) {
          engineRef.current.applyEffects(enabledEffectsToApply);
        }
      } catch (e) {
        console.error("Failed to apply master effects to engine:", e);
      }
    },
    [engineRef, enabledEffectsByTrack, selectedTrackId]
  );

  const deleteAllEffects = useCallback(() => {
    if (!selectedTrackId) return;

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) return;

    const defaultEffects = createDefaultEffects();
    track.effects = defaultEffects;
    track.activeEffectsList = [];

    setSelectedTrackEffects(defaultEffects);
    setSelectedTrackActiveEffects([]);

    // Clear enabled effects for this track only
    setEnabledEffectsByTrack((prev) => ({
      ...prev,
      [selectedTrackId]: {},
    }));

    if (engineRef?.current?.setTrackEffects) {
      try {
        engineRef.current.setTrackEffects(selectedTrackId, {});
      } catch (e) {
        console.error(e);
      }
    }

    dbManager.updateTrack(track).catch((e) => console.error(e));
  }, [selectedTrackId, engineRef]);

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
    } catch {}

    // Only run this block once per actual session change
    if (lastSessionRef.current !== activeSession) {
      lastSessionRef.current = activeSession;

      // Remove automatic track selection - user should explicitly click a track
      // Just reset the track selection state
      setSelectedTrackId(null);
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
    }

    // --- session-level loading (master effects / enabled map) ---
    if (typeof activeSession === "number") {
      const loadedEffectsParams =
        loadEffectParametersForSession(activeSession) || createDefaultEffects();
      setEffects(loadedEffectsParams);

      const loadedEnabledEffects =
        loadEnabledEffectsForSession(activeSession) || {};
      setEnabledEffectsByTrack(loadedEnabledEffects);

      // CRITICAL FIX: Apply filtered effects for ALL tracks when switching sessions
      setTimeout(() => {
        if (engineRef?.current) {
          try {
            // Clear master-level effects
            engineRef.current.applyEffects?.({});

            // Apply master session effects (only enabled)
            const masterFiltered = Object.fromEntries(
              Object.entries(loadedEffectsParams).filter(
                ([id]) => loadedEnabledEffects[id] !== false
              )
            );
            engineRef.current.applyEffects?.(masterFiltered);

            // Reapply effects for all tracks currently present (if engine supports it)
            audioManager.tracks?.forEach((track) => {
              if (!track?.id) return;

              // Get the track's current effects
              const trackEffects = track.effects || loadedEffectsParams;
              const trackEnabled = loadedEnabledEffects[track.id] || {};

              // Filter effects based on enabled state
              const filteredEffects = {};
              Object.keys(trackEffects).forEach((effectId) => {
                if (trackEnabled[effectId] !== false) {
                  filteredEffects[effectId] = trackEffects[effectId];
                }
              });

              // Apply filtered effects to engine
              if (engineRef.current.setTrackEffects) {
                engineRef.current.setTrackEffects(track.id, filteredEffects);
              }
            });
          } catch (e) {
            console.error(
              "[Session Change] Failed to clear/reapply effects:",
              e
            );
          }
        }
      }, 100); // Small delay to ensure state is updated
    }
  }, [activeSession, engineRef]); // <-- NO selectedTrackId here

  // Persist enabled effects and Apply Master Effect Parameter Values to Engine
  useEffect(() => {
    // Only persist if there's an active session
    if (typeof activeSession === "number") {
      try {
        const sessionData = window.localStorage.getItem(
          "webamp.enabledEffectsBySession"
        );
        const parsed = sessionData ? JSON.parse(sessionData) : {sessions: {}};

        parsed.sessions[activeSession] = enabledEffectsByTrack; // Save full map
        window.localStorage.setItem(
          "webamp.enabledEffectsBySession",
          JSON.stringify(parsed)
        );
      } catch (error) {
        console.warn("Failed to persist enabled effects:", error);
      }
    }

    // Apply effect parameter values to the audio engine (only enabled ones)
    applyEffectsToEngine(effects);
  }, [effects, activeSession, applyEffectsToEngine, enabledEffectsByTrack]);

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
      enabledEffectsByTrack,
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
      enabledEffectsByTrack,
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
