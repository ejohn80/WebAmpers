import {createContext, useState, useEffect} from "react";
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

  // Effects Menu State
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);

  // Engine reference to apply effects
  const [engineRef, setEngineRef] = useState(null);

  // Effects Menu Functions
  const openEffectsMenu = () => setIsEffectsMenuOpen(true);
  const closeEffectsMenu = () => setIsEffectsMenuOpen(false);

  // Function to add new effects (for the menu)
  const addEffect = (effectId) => {
    // For now, this just closes the menu
    // Later you can implement logic to add new effects to the UI
    console.log("Adding effect:", effectId);
    closeEffectsMenu();

    // Example of how you might handle adding new effects:
    // const newEffects = {
    //   ...effects,
    //   [effectId]: getDefaultValueForEffect(effectId)
    // };
    // setEffects(newEffects);
  };

  // Utility function to apply effects to engine (no unlock requirement)
  const applyEffectsToEngine = (effectsToApply = effects) => {
    if (engineRef?.current) {
      try {
        engineRef.current.setMasterEffects(effectsToApply);
      } catch (error) {
        console.warn("Failed to apply effects to engine:", error);
      }
    }
  };

  // Function to update effects and apply them to the engine
  const updateEffect = async (effectName, value) => {
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
    // Apply effects to engine if available
    applyEffectsToEngine(newEffects);
  };

  const resetEffect = (effectName, defaultValue) => {
    updateEffect(effectName, defaultValue);
  };

  const resetAllEffects = () => {
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

    // Apply effects to engine if available
    applyEffectsToEngine(defaultEffects);
  };

  // Apply current effects when engine becomes available
  useEffect(() => {
    applyEffectsToEngine();
  }, [engineRef]);

  // Attempt to adopt an engineRef from a global if available (debug fallback)
  useEffect(() => {
    try {
      if (!engineRef && window.__WebAmpEngineRef) {
        setEngineRef(window.__WebAmpEngineRef);
        // eslint-disable-next-line no-console
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

  return (
    <AppContext.Provider
      value={{
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
        // Effects Menu State
        isEffectsMenuOpen,
        openEffectsMenu,
        closeEffectsMenu,
        addEffect,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export default AppContextProvider;
