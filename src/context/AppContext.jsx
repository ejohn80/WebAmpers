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
        setEffects((prev) => {
          const newEffects = {
            ...prev,
            [effectId]: defaultValue,
          };

          // Persist to localStorage
          try {
            localStorage.setItem("webamp.effects", JSON.stringify(newEffects));
          } catch (e) {
            console.warn("Failed to persist effects to localStorage:", e);
          }

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
    [effects]
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

      // Attempt to unlock audio context
      try {
        await engineRef?.current?.ensureAudioUnlocked?.();
      } catch {}
    },
    [effects, engineRef]
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

  // Fallback: persist whenever effects state changes
  useEffect(() => {
    try {
      localStorage.setItem("webamp.effects", JSON.stringify(effects));
    } catch {}
  }, [effects]);

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
      removeEffect,
      activeEffects,
    }),
    [
      userData,
      loading,
      activeProject,
      effects,
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
