import {createContext, useState, useEffect, useCallback, useMemo} from "react";
import {useUserData} from "../hooks/useUserData";
import {
  createDefaultEffects,
  mergeWithDefaults,
  loadActiveEffectsForSession,
  persistActiveEffectsForSession,
  createDefaultActiveEffects,
} from "./effectsStorage";

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

const getInitialActiveEffects = (activeSessionId) => {
  // If we don't know the session ID yet, return default.
  if (typeof activeSessionId !== "number") {
    return createDefaultActiveEffects();
  }

  // Load the persisted list for the active session ID.
  return loadActiveEffectsForSession(activeSessionId);
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
        // Using mergeWithDefaults for robustness, assuming it's correctly imported
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
  useEffect(() => {}, []);
  // User Data
  const {userData, loading} = useUserData();

  const [activeProject, setActiveProject] = useState();

  // Active session state with localStorage persistence
  const [activeSession, setActiveSession] = useState(getInitialActiveSession);

  // Effect State (Effect Parameter Values)
  const [effects, setEffects] = useState(() =>
    loadEffectParametersForSession(activeSession)
  );
  const [engineRef, setEngineRef] = useState(null);

  // Effects Menu State
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  const [activeEffects, setActiveEffects] = useState(() =>
    getInitialActiveEffects(activeSession)
  );

  // Per-track effects state
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedTrackEffects, setSelectedTrackEffects] = useState(null);

  const refreshSelectedTrackEffects = useCallback(() => {
    // Assumes 'audioManager' is available in scope (e.g., globally or imported)
    if (!selectedTrackId) {
      setSelectedTrackEffects(null);
      return;
    }

    const track = window.audioManager?.getTrack(selectedTrackId);
    if (track && track.effects) {
      setSelectedTrackEffects(track.effects);
    } else {
      setSelectedTrackEffects(null);
    }
  }, [selectedTrackId]);

  // Update effect when selection changes
  useEffect(() => {
    refreshSelectedTrackEffects();
  }, [selectedTrackId, refreshSelectedTrackEffects]);

 const updateEffect = useCallback(
  async (effectName, value) => {
    if (!selectedTrackId) return;

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) return;

    const numValue = parseFloat(value);

    // Store the current mute/solo state before updating effects
    const wasMuted = track.mute;
    const wasSoloed = track.solo;

    // Update track effects
    track.effects = {
      ...track.effects,
      [effectName]: numValue,
    };

    // Update UI
    refreshSelectedTrackEffects();

    // Persist to DB - this now includes the updated effects
    try {
      await dbManager.updateTrack(track);
      console.log(`Persisted ${effectName}=${numValue} for track ${track.id}`);
    } catch (e) {
      console.warn("Failed to persist track effect:", e);
    }

    // Update engine
    if (engineRef?.current) {
      try {
        engineRef.current.setTrackEffects(selectedTrackId, track.effects);

        // CRITICAL: Re-apply mute/solo state after effects update
        if (wasMuted) {
          engineRef.current.setTrackMute(selectedTrackId, true);
        }
        if (wasSoloed) {
          engineRef.current.setTrackSolo(selectedTrackId, true);
        }
      } catch (e) {
        console.warn("Engine setTrackEffects failed:", e);
      }
    }
  },
  [selectedTrackId, engineRef, refreshSelectedTrackEffects]
);

  const resetEffect = useCallback((effectName, defaultValue) => {
    if (selectedTrackId) {
        updateEffect(effectName, defaultValue);
    }
  }, [selectedTrackId, updateEffect]);

  const resetAllEffects = useCallback(() => {
    if (selectedTrackId) {
      const defaultEffects = createDefaultEffects();
      const track = window.audioManager?.getTrack(selectedTrackId);
      if (track) {
          track.effects = defaultEffects;
          refreshSelectedTrackEffects();
          // Ideally: Persist to DB and update engine here.
      }
    } else {
      setEffects(createDefaultEffects());
      setActiveEffects(createDefaultActiveEffects());
    }
  }, [selectedTrackId, refreshSelectedTrackEffects]);

  const openEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(true);
  }, []);

  const closeEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(false);
  }, []);

  const addEffect = useCallback((effectId) => {
    setActiveEffects((prev) => {
      if (!prev.includes(effectId)) {
        return [...prev, effectId];
      }
      return prev;
    });
  }, []);

  const removeEffect = useCallback((effectId) => {
    // 1. Remove the effect from the active list
    setActiveEffects((prev) => prev.filter((id) => id !== effectId));

    // 2. Reset the effect's parameter value on the selected track
    if (selectedTrackId) {
        const allDefaults = createDefaultEffects();
        const defaultValue = allDefaults[effectId];
        updateEffect(effectId, defaultValue);
    }
  }, [selectedTrackId, updateEffect]);

  const applyEffectsToEngine = useCallback(
    (currentEffects) => {
      if (!engineRef) {
        return;
      }
      try {
        if (!shallowEqualEffects(currentEffects, engineRef.current.effects)) {
          engineRef.current.applyEffects(currentEffects);
        }
      } catch (e) {
        console.error("Failed to apply effects to engine:", e);
      }
    },
    [engineRef]
  );

  // Persist activeSession (ID) and LOAD Active Effects List on session change (Session switching)
  useEffect(() => {
    if (activeSession === undefined) return;
    try {
      // Persist activeSession ID
      if (activeSession === null) {
        window.localStorage.removeItem("webamp.activeSession");
      } else {
        window.localStorage.setItem(
          "webamp.activeSession",
          String(activeSession)
        );
      }
    } catch {}

    // Load active effects list whenever activeSession changes
    if (typeof activeSession === "number") {
      const loadedActiveEffects = loadActiveEffectsForSession(activeSession);
      setActiveEffects(loadedActiveEffects);

      const loadedEffectsParams = loadEffectParametersForSession(activeSession);
      setEffects(loadedEffectsParams);
    }
  }, [activeSession]);

  // Persist active effects list and Apply Effect Parameter Values to Engine
  useEffect(() => {
    // Only persist if there's an active session
    if (typeof activeSession === "number" && Object.keys(effects).length > 0) {
      // Persist the list of active effect IDs per-session
      persistActiveEffectsForSession(activeSession, activeEffects);
    }

    // Apply master effect parameter values to the audio engine
    applyEffectsToEngine(effects);
  }, [effects, activeSession, applyEffectsToEngine, activeEffects]);

  // Engine ref adoption (remains the same)
  useEffect(() => {
    try {
      if (!engineRef && window.__WebAmpEngineRef) {
        setEngineRef(window.__WebAmpEngineRef);
        console.log(
          "[AppContext] adopted engineRef from window.__WebAmpEngineRef"
        );
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
      selectedTrackId,
      setSelectedTrackId,
      selectedTrackEffects,
      updateEffect,
      resetEffect,
      resetAllEffects,
      engineRef,
      setEngineRef,
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,
      addEffect,
      removeEffect,
      activeEffects,
    }),
    [
      userData,
      loading,
      activeProject,
      setActiveProject,
      activeSession,
      setActiveSession,
      // effects, // Removed master effects dependency
      // setEffects, // Removed master effects dependency
      selectedTrackId,
      setSelectedTrackId,
      selectedTrackEffects,
      updateEffect,
      resetEffect,
      resetAllEffects,
      engineRef,
      // applyEffectsToEngine, // Removed master effects dependency
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,
      addEffect,
      removeEffect,
      activeEffects,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;