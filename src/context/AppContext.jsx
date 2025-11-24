import {createContext, useState, useEffect, useCallback, useMemo} from "react";
import {useUserData} from "../hooks/useUserData";
export const AppContext = createContext();

const AppContextProvider = ({children}) => {
  useEffect(() => {}, []);
  // User Data
  const {userData, loading} = useUserData();

  const [activeProject, setActiveProject] = useState();

  // Effects state with localStorage persistence
  const [effects, setEffects] = useState(() => {
    try {
      const saved = localStorage.getItem("webamp.effects");
      return saved
        ? JSON.parse(saved)
        : {
            pitch: 0,
            volume: 100,
            reverb: 0,
          };
    } catch (e) {
      return {
        pitch: 0,
        volume: 100,
        reverb: 0,
      };
    }
  });

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
      const newEffects = {
        ...effects,
        [effectName]: parseFloat(value),
      };
      setEffects(newEffects);

      // Persist to localStorage
      try {
        localStorage.setItem("webamp.effects", JSON.stringify(newEffects));
      } catch (e) {
        console.warn("Failed to persist effects to localStorage:", e);
      }

      // Attempt to unlock audio context (runs inside user gesture from slider)
      try {
        await engineRef?.current?.ensureAudioUnlocked?.();
      } catch {}
    },
    [effects, engineRef] // Dependency array ensures stable function reference
  );

  const resetEffect = useCallback(
    (effectName, defaultValue) => {
      updateEffect(effectName, defaultValue);
    },
    [updateEffect]
  );

  const resetAllEffects = useCallback(() => {
    const defaultEffects = {
      pitch: 0,
      volume: 100,
      reverb: 0,
    };
    setEffects(defaultEffects);

    // Persist to localStorage
    try {
      localStorage.setItem("webamp.effects", JSON.stringify(defaultEffects));
    } catch (e) {
      console.warn("Failed to persist effects reset to localStorage:", e);
    }
  }, []);

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

  // Fallback: persist whenever effects state changes (guards against any missed writes)
  useEffect(() => {
    try {
      localStorage.setItem("webamp.effects", JSON.stringify(effects));
    } catch {}
  }, [effects]);

  // On mount: optionally initialize localStorage key (no logs)
  useEffect(() => {
    try {
      const existing = localStorage.getItem("webamp.effects");
      if (!existing) {
        localStorage.setItem("webamp.effects", JSON.stringify(effects));
      }
    } catch {}
  }, []);

  const contextValue = useMemo(
    () => ({
      userData,
      loading,
      activeProject,
      setActiveProject,
      effects,
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
      effects,
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
