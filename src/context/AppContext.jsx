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

      // Update Audio Engine
      if (
        engineRef?.current &&
        typeof engineRef.current.setTrackEffects === "function"
      ) {
        try {
          engineRef.current.setTrackEffects(selectedTrackId, newEffects);
        } catch (e) {
          console.error(
            `[updateEffect] Failed to set effect ${effectName} on engine:`,
            e
          );
        }
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

    // 3. Update Audio Engine
    if (
      engineRef?.current &&
      typeof engineRef.current.setTrackEffects === "function"
    ) {
      try {
        engineRef.current.setTrackEffects(selectedTrackId, defaultEffects);
      } catch (e) {
        console.error(
          "[resetAllEffects] Failed to reset all effects on engine:",
          e
        );
      }
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

      console.log(
        `Added effect ${effectId}, active list:`,
        track.activeEffectsList
      );

      // Update engine
      if (
        engineRef?.current &&
        typeof engineRef.current.setTrackEffects === "function"
      ) {
        try {
          engineRef.current.setTrackEffects(selectedTrackId, newEffects);
        } catch (e) {
          console.error(e);
        }
      }

      // Persist to DB
      dbManager.updateTrack(track).catch((e) => console.error(e));
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
      setSelectedTrackEffects(newEffects);
      setSelectedTrackActiveEffects([...track.activeEffectsList]);

      console.log(
        `Removed effect ${effectId}, active list:`,
        track.activeEffectsList
      );

      // Reset in engine
      if (
        engineRef?.current &&
        typeof engineRef.current.setTrackEffects === "function"
      ) {
        try {
          engineRef.current.setTrackEffects(selectedTrackId, newEffects);
        } catch (e) {
          console.error(e);
        }
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
    (effectId) => {
      // For now, keep session-specific enabled effects, but we may need to adapt to per-track
      setEnabledEffects((prev) => {
        const newEnabledEffects = {
          ...prev,
          [effectId]: !prev[effectId], // Toggle the enabled state
        };
        return newEnabledEffects;
      });
    },
    []
  );

  // Toggle all effects on/off - per-track enabled effects
  const toggleAllEffects = useCallback(() => {
    setEnabledEffects((prev) => {
      const anyEnabled = Object.values(prev).some(Boolean);
      const newEnabledEffects = {};

      // Toggle all active effects based on current state
      activeEffects.forEach((effectId) => {
        newEnabledEffects[effectId] = !anyEnabled;
      });

      return newEnabledEffects;
    });
  }, [activeEffects]);

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

  // Persist activeSession (ID)
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

    // Load MASTER active effects and enabled effects whenever activeSession changes
    if (typeof activeSession === "number") {
      const loadedEffectsParams = loadEffectParametersForSession(activeSession);
      setEffects(loadedEffectsParams);

      const loadedEnabledEffects = loadEnabledEffectsForSession(activeSession);
      setEnabledEffects(loadedEnabledEffects);
    }
  }, [activeSession]);

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
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;