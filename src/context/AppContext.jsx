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

  // Session-specific enabled effects state
  const [enabledEffects, setEnabledEffects] = useState(() =>
    loadEnabledEffectsForSession(activeSession)
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

    // When adding an effect, default it to enabled
    setEnabledEffects((prev) => ({
      ...prev,
      [effectId]: true,
    }));
  }, []);

  const removeEffect = useCallback((effectId) => {
    // 1. Remove the effect from the active list
    setActiveEffects((prev) => prev.filter((id) => id !== effectId));

    // 2. Remove from enabled effects
    setEnabledEffects((prev) => {
      const newEnabled = {...prev};
      delete newEnabled[effectId];
      return newEnabled;
    });

    // 3. Reset the effect's parameter value to default (turns off the applied effect)
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

  // Toggle individual effect on/off - session-specific
  const toggleEffect = useCallback((effectId) => {
    setEnabledEffects((prev) => {
      const newEnabledEffects = {
        ...prev,
        [effectId]: !prev[effectId], // Toggle the enabled state
      };
      return newEnabledEffects;
    });
  }, []);

  // Toggle all effects on/off - session-specific
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
        console.error("Failed to apply effects to engine:", e);
      }
    },
    [engineRef, enabledEffects]
  );

  const deleteAllEffects = useCallback(() => {
    // First reset all effect values to defaults
    setEffects(createDefaultEffects());

    // Then remove all effects from the active list
    setActiveEffects([]);

    // And clear enabled effects
    setEnabledEffects({});
  }, []);

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

    // Load active effects list and enabled effects whenever activeSession changes
    if (typeof activeSession === "number") {
      const loadedActiveEffects = loadActiveEffectsForSession(activeSession);
      setActiveEffects(loadedActiveEffects);

      const loadedEffectsParams = loadEffectParametersForSession(activeSession);
      setEffects(loadedEffectsParams);

      const loadedEnabledEffects = loadEnabledEffectsForSession(activeSession);
      setEnabledEffects(loadedEnabledEffects);
    }
  }, [activeSession]);

  // Persist active effects list, enabled effects, and Apply Effect Parameter Values to Engine
  useEffect(() => {
    // Only persist if there's an active session
    if (typeof activeSession === "number" && Object.keys(effects).length > 0) {
      // Persist the list of active effect IDs per-session
      persistActiveEffectsForSession(activeSession, activeEffects);

      // Persist enabled effects per-session
      persistEnabledEffectsForSession(activeSession, enabledEffects);
    }

    // Apply effect parameter values to the audio engine (only enabled ones)
    applyEffectsToEngine(effects);
  }, [
    effects,
    activeSession,
    applyEffectsToEngine,
    activeEffects,
    enabledEffects,
  ]);

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
      deleteAllEffects,
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
      // Toggle functionality
      enabledEffects,
      toggleEffect,
      toggleAllEffects,
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
      deleteAllEffects,
      engineRef,
      applyEffectsToEngine,
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,
      addEffect,
      removeEffect,
      activeEffects,
      enabledEffects,
      toggleEffect,
      toggleAllEffects,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;
