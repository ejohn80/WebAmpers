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

  // Effect State (Effect Parameter Values) - Loaded/Saved via SessionsTab/IndexedDB
  const [effects, setEffects] = useState(() =>
    loadEffectParametersForSession(activeSession)
  );
  const [engineRef, setEngineRef] = useState(null);

  // Effects Menu State
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  const [activeEffects, setActiveEffects] = useState(() =>
    getInitialActiveEffects(activeSession)
  );

  const updateEffect = useCallback((effectName, value) => {
    setEffects((prevEffects) => {
      const newEffects = {
        ...prevEffects,
        [effectName]: value,
      };
      return newEffects;
    });
  }, []);

  const resetEffect = useCallback((effectName, defaultValue) => {
    setEffects((prevEffects) => ({
      ...prevEffects,
      [effectName]: defaultValue,
    }));
  }, []);

  const resetAllEffects = useCallback(() => {
    // Only reset the effect values to defaults, don't touch activeEffects
    setEffects(createDefaultEffects());
  }, []);

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

    // 2. Reset the effect's parameter value to default (turns off the applied effect)
    setEffects((prevEffects) => {
      // Get the default value for this effect
      const allDefaults = createDefaultEffects();
      const defaultValue = allDefaults[effectId];

      return {
        ...prevEffects,
        [effectId]: defaultValue,
      };
    });
  }, []);

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

    // Apply effect parameter values to the audio engine
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
      effects,
      setEffects,
      updateEffect,
      resetEffect,
      resetAllEffects,
      engineRef,
      setEngineRef,
      applyEffectsToEngine,
      // Effects Menu State
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
      effects,
      setEffects,
      updateEffect,
      resetEffect,
      resetAllEffects,
      engineRef,
      applyEffectsToEngine,
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
