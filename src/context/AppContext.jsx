import {createContext, useState, useEffect, useCallback, useMemo} from "react";
import {useUserData} from "../hooks/useUserData";
import {
  createDefaultEffects,
  loadEffectsForSession,
  persistEffectsForSession,
  mergeWithDefaults,
} from "./effectsStorage";
export const AppContext = createContext();

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

  // Persist active session to localStorage
  useEffect(() => {
    try {
      if (activeSession !== null) {
        localStorage.setItem("webamp.activeSession", activeSession.toString());
      } else {
        localStorage.removeItem("webamp.activeSession");
      }
    } catch (e) {
      console.warn("Failed to persist active session:", e);
    }
  }, [activeSession]);

  // Effects state stored per session
  const [effects, setEffectsState] = useState(() =>
    loadEffectsForSession(getInitialActiveSession())
  );

  const setEffects = useCallback(
    (valueOrUpdater) => {
      setEffectsState((prev) => {
        const raw =
          typeof valueOrUpdater === "function"
            ? valueOrUpdater(prev)
            : valueOrUpdater;
        const resolved = mergeWithDefaults(raw);
        persistEffectsForSession(activeSession, resolved);
        return resolved;
      });
    },
    [activeSession]
  );

  useEffect(() => {
    setEffectsState((prev) => {
      const loaded = loadEffectsForSession(activeSession);
      return shallowEqualEffects(prev, loaded) ? prev : loaded;
    });
  }, [activeSession]);

  // Engine reference to apply effects
  const [engineRef, setEngineRef] = useState(null);

  // Utility function to apply effects to engine (no unlock requirement)
  const applyEffectsToEngine = useCallback(
    (effectsToApply = effects) => {
      if (engineRef?.current) {
        try {
          engineRef.current.setMasterEffects(effectsToApply);
        } catch (error) {
          console.warn("Failed to apply effects to engine:", error);
        }
      }
    },
    [engineRef, effects] // Dependency array ensures stable function reference
  );

  // Function to update effects
  const updateEffect = useCallback(
    async (effectName, value) => {
      const numericValue = parseFloat(value);
      setEffects((prev) => ({
        ...prev,
        [effectName]: Number.isFinite(numericValue)
          ? numericValue
          : (prev?.[effectName] ?? createDefaultEffects()[effectName]),
      }));

      // Attempt to unlock audio context (runs inside user gesture from slider)
      try {
        await engineRef?.current?.ensureAudioUnlocked?.();
      } catch {}
    },
    [engineRef, setEffects]
  );

  const resetEffect = useCallback(
    (effectName, defaultValue) => {
      updateEffect(effectName, defaultValue);
    },
    [updateEffect]
  );

  const resetAllEffects = useCallback(() => {
    setEffects(createDefaultEffects());
  }, [setEffects]);

  // Apply current effects when engine becomes available
  useEffect(() => {
    applyEffectsToEngine();
  }, [engineRef, applyEffectsToEngine]);

  // Attempt to adopt an engineRef from a global if available
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
      setEngineRef,
      applyEffectsToEngine,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;
