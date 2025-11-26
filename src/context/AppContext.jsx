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

  // Active effects state - tracks which effects are visible/added
  const [activeEffects, setActiveEffects] = useState(() => {
    try {
      const saved = localStorage.getItem("webamp.activeEffects");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Effects Menu State
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  // Engine reference to apply effects
  const [engineRef, setEngineRef] = useState(null);

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
        persistEffectsForSession(activeSession, resolved); // Persist using session logic
        return resolved;
      });
    },
    [activeSession]
  );

  // Sync effects state when activeSession changes
  useEffect(() => {
    const loaded = loadEffectsForSession(activeSession);

    setEffectsState((prev) =>
      shallowEqualEffects(prev, loaded) ? prev : loaded
    );

    if (engineRef?.current) {
      try {
        engineRef.current.setMasterEffects(loaded);
      } catch (error) {
        console.warn(
          "Failed to sync engine effects for session change:",
          error
        );
      }
    }
  }, [activeSession, engineRef]);

  // Effects Menu Functions
  const openEffectsMenu = () => setIsEffectsMenuOpen(true);
  const closeEffectsMenu = () => setIsEffectsMenuOpen(false);

  // Function to add new effects
  const addEffect = useCallback((effectId) => {
    if (effectId) {
      setActiveEffects((prev) => {
        // Avoid duplicates
        if (prev.includes(effectId)) return prev;
        const newActiveEffects = [...prev, effectId];

        // Persist to localStorage
        try {
          localStorage.setItem(
            "webamp.activeEffects",
            JSON.stringify(newActiveEffects)
          );
        } catch (e) {
          console.warn("Failed to persist active effects to localStorage:", e);
        }

        return newActiveEffects;
      });
    }
    closeEffectsMenu();
  }, []);

  // Function to remove effects - optimized to avoid unnecessary state updates
  const removeEffect = useCallback(
    (effectId) => {
      // Define default values
      const defaultValues = {
        pitch: 0,
        volume: 100,
        reverb: 0,
        delay: 0,
        bass: 0,
        distortion: 0,
        pan: 0,
        tremolo: 0,
        vibrato: 0,
        highpass: 20,
        lowpass: 20000,
        chorus: 0,
      };

      const defaultValue = defaultValues[effectId] || 0;
      const currentValue = effects[effectId];

      // Only update effects state if:
      // 1. The effect exists in the current state AND
      // 2. It's not already at the default value
      const effectExists = effectId in effects;
      const needsReset = effectExists && currentValue !== defaultValue;

      if (needsReset) {
        // Use the new setEffects which handles persistence via session logic
        setEffects((prev) => {
          const newEffects = {
            ...prev,
            [effectId]: defaultValue,
          };
          return newEffects;
        });
      }

      // Always remove from active effects
      setActiveEffects((prev) => {
        const newActiveEffects = prev.filter((id) => id !== effectId);

        // Persist to localStorage
        try {
          localStorage.setItem(
            "webamp.activeEffects",
            JSON.stringify(newActiveEffects)
          );
        } catch (e) {
          console.warn("Failed to persist active effects to localStorage:", e);
        }

        return newActiveEffects;
      });
    },
    [effects, setEffects] // Add setEffects dependency for removal logic
  );

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
    [engineRef, effects]
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

      // Attempt to unlock audio context
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

  // Reset all effects
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

  // Persist active effects when they change
  useEffect(() => {
    try {
      localStorage.setItem(
        "webamp.activeEffects",
        JSON.stringify(activeEffects)
      );
    } catch {}
  }, [activeEffects]);


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