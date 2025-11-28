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

  // Derived state: The list of active effect IDs for the CURRENTLY selected track.
  // This replaces the global list so tracks don't share the same UI toggles.
  const activeEffects = useMemo(() => {
    if (!selectedTrackEffects) return [];
    // We filter keys to ensure they are valid effect names
    const defaults = createDefaultEffects();
    // Return all keys present in the selectedTrackEffects object
    return Object.keys(selectedTrackEffects).filter(k => defaults.hasOwnProperty(k));
  }, [selectedTrackEffects]);

  const refreshSelectedTrackEffects = useCallback(() => {
    if (!selectedTrackId) {
      setSelectedTrackEffects(null);
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (track) {
      // Ensure the track has an effects object, if not create defaults
      if (!track.effects) {
        track.effects = createDefaultEffects();
      }
      // Create a copy to trigger React updates
      setSelectedTrackEffects({...track.effects});
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

      console.log(`[updateEffect] Updating ${effectName} to ${numValue} for track ${selectedTrackId}`);

      // 1. Update the Track Model (Source of truth)
      const newEffects = {
        ...track.effects,
        [effectName]: numValue,
      };
      track.effects = newEffects;

      // 2. Update UI State
      setSelectedTrackEffects(newEffects);

      // 3. Update Audio Engine if available
      if (engineRef?.current && typeof engineRef.current.setTrackEffects === 'function') {
        try {
          engineRef.current.setTrackEffects(selectedTrackId, newEffects);
        } catch (e) {
          console.error(`[updateEffect] Failed to set effect ${effectName} on engine:`, e);
        }
      }

      // 4. Persist to DB
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
    if (engineRef?.current && typeof engineRef.current.setTrackEffects === 'function') {
      try {
        engineRef.current.setTrackEffects(selectedTrackId, defaultEffects);
      } catch (e) {
        console.error("[resetAllEffects] Failed to reset all effects on engine:", e);
      }
    }

    // 4. Persist to DB
    try {
      await dbManager.updateTrack(track); 
    } catch (e) {
      console.error("[resetAllEffects] Failed to persist track effect reset:", e);
    }
  }, [selectedTrackId, engineRef]);

  const openEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(true);
  }, []);

  const closeEffectsMenu = useCallback(() => {
    setIsEffectsMenuOpen(false);
  }, []);

  const addEffect = useCallback((effectId) => {
    if (!selectedTrackId) return;
    
    // To "Add" an effect to the list, we make sure it exists in the track.effects object.
    const defaults = createDefaultEffects();
    // We use the current value if it exists, otherwise default
    const track = audioManager.getTrack(selectedTrackId);
    const currentValue = track?.effects?.[effectId] ?? defaults[effectId];
    
    updateEffect(effectId, currentValue);
  }, [selectedTrackId, updateEffect]);

  const removeEffect = useCallback(async (effectId) => {
    if (!selectedTrackId) return;
    
    const track = audioManager.getTrack(selectedTrackId);
    if (!track) return;

    // To remove from the UI list, we actually delete the key from the object
    const newEffects = { ...track.effects };
    delete newEffects[effectId];
    
    track.effects = newEffects;
    setSelectedTrackEffects(newEffects);

    // Reset in engine (effectively turning it off)
    // We pass the new object (missing the key) -> Engine should interpret missing key as "no effect"
    if (engineRef?.current && typeof engineRef.current.setTrackEffects === 'function') {
        try {
            engineRef.current.setTrackEffects(selectedTrackId, newEffects);
        } catch(e) { console.error(e); }
    }

    try {
        await dbManager.updateTrack(track);
    } catch (e) { console.error(e); }

  }, [selectedTrackId, engineRef]);

  const applyEffectsToEngine = useCallback(
    (currentEffects) => {
      if (!engineRef) {
        return;
      }
      try {
        // This handles MASTER effects
        if (engineRef.current.effects && !shallowEqualEffects(currentEffects, engineRef.current.effects)) {
          engineRef.current.applyEffects(currentEffects);
        }
      } catch (e) {
        console.error("Failed to apply master effects to engine:", e);
      }
    },
    [engineRef]
  );

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

    // Load MASTER active effects whenever activeSession changes
    if (typeof activeSession === "number") {
      const loadedEffectsParams = loadEffectParametersForSession(activeSession);
      setEffects(loadedEffectsParams);
    }
  }, [activeSession]);

  // Apply Master Effect Parameter Values to Engine
  useEffect(() => {
    applyEffectsToEngine(effects);
  }, [effects, applyEffectsToEngine]);

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
      engineRef,
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,
      addEffect,
      removeEffect,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;