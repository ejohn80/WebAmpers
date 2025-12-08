/**
 * effectsStorage.js
 *
 * Storage utility for persisting audio effect settings across sessions.
 * Manages both effect parameters and active effects dropdown state.
 * Supports per-session storage with fallback to global defaults.
 */

// Storage keys
const EFFECTS_STORAGE_KEY = "webamp.effectsBySession"; // Main effects parameters
const LEGACY_EFFECTS_KEY = "webamp.effects"; // Legacy key for migration
const GLOBAL_SESSION_KEY = "__global"; // Key for global/default settings
const ACTIVE_EFFECTS_STORAGE_KEY = "webamp.activeEffectsBySession"; // Active effects dropdown

// Default effect values
const DEFAULT_EFFECTS = Object.freeze({
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
});

// Check if localStorage is available
const canUseStorage = () => {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined"
    );
  } catch (error) {
    console.warn("effectsStorage: localStorage unavailable", error);
    return false;
  }
};

// Read JSON from localStorage
const readJSON = (key) => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`effectsStorage: failed to read ${key}`, error);
    return null;
  }
};

// Write JSON to localStorage
const writeJSON = (key, value) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`effectsStorage: failed to write ${key}`, error);
  }
};

// Remove key from localStorage
const removeKey = (key) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`effectsStorage: failed to remove ${key}`, error);
  }
};

// Normalize session ID (null/undefined becomes global)
const normalizeSessionKey = (sessionId) =>
  sessionId === null || sessionId === undefined
    ? GLOBAL_SESSION_KEY
    : String(sessionId);

// Create empty storage structure
const createEmptyStore = () => ({sessions: {}});

// Read and validate the main effects store
const readStore = () => {
  const store = readJSON(EFFECTS_STORAGE_KEY);
  if (!store || typeof store !== "object" || Array.isArray(store)) {
    return createEmptyStore();
  }
  if (!store.sessions || typeof store.sessions !== "object") {
    store.sessions = {};
  }
  return store;
};

// Merge partial effects with defaults
export const mergeWithDefaults = (effects) => ({
  ...DEFAULT_EFFECTS,
  ...(effects || {}),
});

// Deep clone store
const cloneStore = (store) => ({
  global: store.global ? {...store.global} : undefined,
  sessions: {...(store.sessions || {})},
});

// Internal: persist effects for session
const persistEffectsForSessionWithStore = (
  sessionId,
  effects,
  existingStore
) => {
  if (!canUseStorage()) return;
  const store = cloneStore(existingStore || readStore());
  const payload = mergeWithDefaults(effects);
  const sessionKey = normalizeSessionKey(sessionId);

  if (sessionKey === GLOBAL_SESSION_KEY) {
    store.global = payload; // Store as global default
  } else {
    store.sessions[sessionKey] = payload; // Store per-session
  }

  writeJSON(EFFECTS_STORAGE_KEY, store);
};

// Create default effects object
export const createDefaultEffects = () => ({...DEFAULT_EFFECTS});

// Public API: persist effects
export const persistEffectsForSession = (sessionId, effects) => {
  persistEffectsForSessionWithStore(sessionId, effects);
};

// Load effects for session with fallback logic
export const loadEffectsForSession = (sessionId) => {
  const store = readStore();
  const sessionKey = normalizeSessionKey(sessionId);
  const sessionEffects =
    sessionKey === GLOBAL_SESSION_KEY
      ? store.global
      : store.sessions && store.sessions[sessionKey];

  // Found session-specific effects
  if (sessionEffects) {
    return mergeWithDefaults(sessionEffects);
  }

  // Fallback to global effects
  if (sessionKey !== GLOBAL_SESSION_KEY && store.global) {
    const mergedGlobal = mergeWithDefaults(store.global);
    persistEffectsForSessionWithStore(sessionId, mergedGlobal, store);
    return mergedGlobal;
  }

  // Migrate from legacy storage
  const legacy = readJSON(LEGACY_EFFECTS_KEY);
  if (legacy) {
    const mergedLegacy = mergeWithDefaults(legacy);
    persistEffectsForSessionWithStore(sessionId, mergedLegacy, store);
    removeKey(LEGACY_EFFECTS_KEY); // Clean up old key
    return mergedLegacy;
  }

  // Return and persist defaults
  const defaults = createDefaultEffects();
  persistEffectsForSessionWithStore(sessionId, defaults, store);
  return defaults;
};

// ==========================================================
// ACTIVE EFFECTS LIST FUNCTIONS (FOR DROPDOWN PERSISTENCE)
// ==========================================================

// Default empty active effects list
export const createDefaultActiveEffects = () => [];

// Internal: persist active effects for session
const persistActiveEffectsForSessionWithStore = (sessionId, payload, store) => {
  if (!canUseStorage()) return;
  const sessionKey = normalizeSessionKey(sessionId);

  if (!store) {
    // Read the active effects store (different key)
    store = readJSON(ACTIVE_EFFECTS_STORAGE_KEY) || {
      sessions: {},
      global: createDefaultActiveEffects(),
    };
  }

  if (sessionKey === GLOBAL_SESSION_KEY) {
    store.global = payload;
  } else {
    if (!store.sessions) {
      store.sessions = {};
    }
    store.sessions[sessionKey] = payload;
  }

  writeJSON(ACTIVE_EFFECTS_STORAGE_KEY, store);
};

// Public API: persist active effects dropdown
export const persistActiveEffectsForSession = (
  sessionId,
  activeEffectsList
) => {
  persistActiveEffectsForSessionWithStore(sessionId, activeEffectsList);
};

// Load active effects for session
export const loadActiveEffectsForSession = (sessionId) => {
  if (!canUseStorage()) return createDefaultActiveEffects();

  const store = readJSON(ACTIVE_EFFECTS_STORAGE_KEY) || {
    sessions: {},
    global: createDefaultActiveEffects(),
  };
  const sessionKey = normalizeSessionKey(sessionId);

  const sessionActiveEffects =
    sessionKey === GLOBAL_SESSION_KEY
      ? store.global
      : store.sessions && store.sessions[sessionKey];

  if (sessionActiveEffects) {
    return sessionActiveEffects;
  }

  // Persist and return defaults
  const defaults = createDefaultActiveEffects();
  persistActiveEffectsForSessionWithStore(sessionId, defaults, store);
  return defaults;
};

// Export for testing
export const __TESTING__ = {
  DEFAULT_EFFECTS,
  mergeWithDefaults,
  normalizeSessionKey,
  readStore,
  persistEffectsForSessionWithStore,
  EFFECTS_STORAGE_KEY,
  LEGACY_EFFECTS_KEY,
};
