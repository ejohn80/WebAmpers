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
  const [selectedTrackActiveEffects, setSelectedTrackActiveEffects] = useState(
    []
  );

  // Derived state: The list of active effect IDs for the CURRENTLY selected track.
  // This replaces the global list so tracks don't share the same UI toggles.
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

  const applyEffectsToEngine = useCallback(
    (currentEffects) => {
      if (!engineRef) {
        return;
      }
      try {
        // This handles MASTER effects
        if (
          engineRef.current.effects &&
          !shallowEqualEffects(currentEffects, engineRef.current.effects)
        ) {
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("webamp.masterEffects");
      if (saved) {
        const parsed = JSON.parse(saved);
        setEffects(mergeWithDefaults(parsed));
      }
    } catch (e) {
      console.warn("Failed to load master effects:", e);
    }
  }, []);

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
      engineRef,
      isEffectsMenuOpen,
      openEffectsMenu,
      closeEffectsMenu,
      addEffect,
      removeEffect,
      selectedTrackActiveEffects,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export default AppContextProvider;
