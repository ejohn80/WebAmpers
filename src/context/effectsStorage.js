const EFFECTS_STORAGE_KEY = "webamp.effectsBySession";
const LEGACY_EFFECTS_KEY = "webamp.effects";
const GLOBAL_SESSION_KEY = "__global";
const ACTIVE_EFFECTS_STORAGE_KEY = "webamp.activeEffectsBySession";

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

const writeJSON = (key, value) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`effectsStorage: failed to write ${key}`, error);
  }
};

const removeKey = (key) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`effectsStorage: failed to remove ${key}`, error);
  }
};

const normalizeSessionKey = (sessionId) =>
  sessionId === null || sessionId === undefined
    ? GLOBAL_SESSION_KEY
    : String(sessionId);

const createEmptyStore = () => ({sessions: {}});

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

export const mergeWithDefaults = (effects) => ({
  ...DEFAULT_EFFECTS,
  ...(effects || {}),
});

const cloneStore = (store) => ({
  global: store.global ? {...store.global} : undefined,
  sessions: {...(store.sessions || {})},
});

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
    store.global = payload;
  } else {
    store.sessions[sessionKey] = payload;
  }

  writeJSON(EFFECTS_STORAGE_KEY, store);
};

export const createDefaultEffects = () => ({...DEFAULT_EFFECTS});

export const persistEffectsForSession = (sessionId, effects) => {
  persistEffectsForSessionWithStore(sessionId, effects);
};

export const loadEffectsForSession = (sessionId) => {
  const store = readStore();
  const sessionKey = normalizeSessionKey(sessionId);
  const sessionEffects =
    sessionKey === GLOBAL_SESSION_KEY
      ? store.global
      : store.sessions && store.sessions[sessionKey];

  if (sessionEffects) {
    return mergeWithDefaults(sessionEffects);
  }

  if (sessionKey !== GLOBAL_SESSION_KEY && store.global) {
    const mergedGlobal = mergeWithDefaults(store.global);
    persistEffectsForSessionWithStore(sessionId, mergedGlobal, store);
    return mergedGlobal;
  }

  const legacy = readJSON(LEGACY_EFFECTS_KEY);
  if (legacy) {
    const mergedLegacy = mergeWithDefaults(legacy);
    persistEffectsForSessionWithStore(sessionId, mergedLegacy, store);
    removeKey(LEGACY_EFFECTS_KEY);
    return mergedLegacy;
  }

  const defaults = createDefaultEffects();
  persistEffectsForSessionWithStore(sessionId, defaults, store);
  return defaults;
};

// ==========================================================
// ACTIVE EFFECTS LIST FUNCTIONS (FOR DROPDOWN PERSISTENCE)
// ==========================================================

export const createDefaultActiveEffects = () => [];

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

export const persistActiveEffectsForSession = (
  sessionId,
  activeEffectsList
) => {
  persistActiveEffectsForSessionWithStore(sessionId, activeEffectsList);
};

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

  const defaults = createDefaultActiveEffects();

  persistActiveEffectsForSessionWithStore(sessionId, defaults, store);

  return defaults;
};

export const __TESTING__ = {
  DEFAULT_EFFECTS,
  mergeWithDefaults,
  normalizeSessionKey,
  readStore,
  persistEffectsForSessionWithStore,
  EFFECTS_STORAGE_KEY,
  LEGACY_EFFECTS_KEY,
};
