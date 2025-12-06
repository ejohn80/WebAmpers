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

  // Theme state
  const [theme, setTheme] = useState(getInitialTheme);

  const lastSessionRef = useRef(activeSession);

  // Master Effect State (Global Session Effects)
  const [effects, setEffects] = useState(() =>
    loadEffectParametersForSession(activeSession)
  );

  const [engineRef, setEngineRef] = useState(null);

  const masterVolumeStateRef = useRef({
    volume: 50,
    muted: false,
    lastGainValue: 0.5,
  });

  // Effects Menu State
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  // Per-track effects state
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedTrackEffects, setSelectedTrackEffects] = useState(null);
  const [selectedTrackActiveEffects, setSelectedTrackActiveEffects] = useState(
    []
  );
  const [selectedTrackEnabledEffects, setSelectedTrackEnabledEffects] =
    useState({});

  // Derived state: The list of active effect IDs for the CURRENTLY selected track.
  const activeEffects = selectedTrackActiveEffects;

  // Enabled effects for the selected track
  const enabledEffects = selectedTrackEnabledEffects;

  const refreshSelectedTrackEffects = useCallback(() => {
    if (!selectedTrackId) {
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      setSelectedTrackEnabledEffects({});
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      setSelectedTrackEffects(null);
      setSelectedTrackActiveEffects([]);
      setSelectedTrackEnabledEffects({});
      return;
    }

    if (!track.effects) track.effects = createDefaultEffects();
    if (!track.activeEffectsList) track.activeEffectsList = [];
    if (!track.enabledEffects) track.enabledEffects = {};

    setSelectedTrackEffects({...track.effects});
    setSelectedTrackActiveEffects([...track.activeEffectsList]);
    setSelectedTrackEnabledEffects({...track.enabledEffects});

    const trackEnabled = track.enabledEffects || {};

    if (engineRef?.current?.setTrackEffects) {
      // Pre-emptively lock master gain if muted
      let masterGainBefore = null;
      let wasMuted = false;

      try {
        if (engineRef.current.master?.gain?.gain) {
          masterGainBefore = engineRef.current.master.gain.gain.value;

          // If effectively muted (gain < 0.001), lock it NOW
          if (masterGainBefore < 0.001) {
            wasMuted = true;
            engineRef.current.master.gain.gain.cancelScheduledValues(0);
            engineRef.current.master.gain.gain.setValueAtTime(0, 0);
          }
        }
      } catch (e) {
        console.warn(
          "Could not lock master gain before track effect application"
        );
      }

      // Apply track effects
      engineRef.current.setTrackEffects(
        selectedTrackId,
        track.effects,
        trackEnabled
      );

      // Verify and restore master gain
      if (masterGainBefore !== null) {
        try {
          if (engineRef.current.master?.gain?.gain) {
            engineRef.current.master.gain.gain.cancelScheduledValues(0);
            engineRef.current.master.gain.gain.setValueAtTime(
              masterGainBefore,
              0
            );

            // Double-check if it was muted
            if (wasMuted) {
              engineRef.current.master.gain.gain.setValueAtTime(0, 0);
            }
          }
        } catch (e) {
          console.warn(
            "Could not verify master gain after track effect application"
          );
        }
      }
    }
  }, [selectedTrackId, engineRef]);

  // Update effect when selection changes
  useEffect(() => {
    refreshSelectedTrackEffects();
  }, [selectedTrackId, refreshSelectedTrackEffects]);

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

        // Persist
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

  const openEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(true);
  }, []);

  const closeEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(false);
  }, []);

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

  // Toggle individual effect on/off - per-track enabled effects
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

  // Toggle all effects on/off - per-track enabled effects
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

  // Apply only enabled effects to engine
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

      // Store master volume state
      let masterGainBefore = null;
      try {
        if (engineRef.current.master?.gain?.gain) {
          masterGainBefore = engineRef.current.master.gain.gain.value;
        }
      } catch (e) {}

      try {
        if (
          !shallowEqualEffects(enabledEffectsToApply, engineRef.current.effects)
        ) {
          engineRef.current.applyEffects(enabledEffectsToApply);
        }
      } catch (e) {
        console.error("Failed to apply master effects to engine:", e);
      }

      // Restore master volume state
      try {
        if (masterGainBefore !== null && engineRef.current.master?.gain?.gain) {
          engineRef.current.master.gain.gain.value = masterGainBefore;
        }
      } catch (e) {}
    },
    [engineRef, selectedTrackId]
  );

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

      // Remove automatic track selection
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
      } catch (e) {}

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
              "Could not restore master volume after session change"
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
          } catch (e) {}

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
              } catch (e) {}
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

  // Apply Master Effect Parameter Values to Engine
  useEffect(() => {
    // Apply effect parameter values to the audio engine (only enabled ones)
    applyEffectsToEngine(effects);
  }, [effects, applyEffectsToEngine]);

  // Persist and apply theme
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
      theme,
      setTheme,

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
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;
