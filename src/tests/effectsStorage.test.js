import {describe, it, expect, beforeEach} from "vitest";
import {
  createDefaultEffects,
  loadEffectsForSession,
  persistEffectsForSession,
} from "../context/effectsStorage";

const getLocalStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("localStorage is not available in this test environment");
  }
  return window.localStorage;
};

describe("effectsStorage", () => {
  beforeEach(() => {
    const storage = getLocalStorage();
    storage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    const defaults = createDefaultEffects();
    const loaded = loadEffectsForSession(null);
    expect(loaded).toEqual(defaults);
  });

  it("persists and loads session-specific effects", () => {
    persistEffectsForSession(123, {reverb: 45, volume: 80});
    const loaded = loadEffectsForSession(123);
    expect(loaded.reverb).toBe(45);
    expect(loaded.volume).toBe(80);
    expect(loaded.pitch).toBe(createDefaultEffects().pitch);
  });

  it("falls back to global effects for new sessions", () => {
    persistEffectsForSession(null, {volume: 150});
    const loaded = loadEffectsForSession(999);
    expect(loaded.volume).toBe(150);
  });

  it("migrates legacy storage entries", () => {
    const storage = getLocalStorage();
    storage.setItem(
      "webamp.effects",
      JSON.stringify({pitch: 4, distortion: 10})
    );

    const loaded = loadEffectsForSession(77);
    expect(loaded.pitch).toBe(4);
    expect(loaded.distortion).toBe(10);
    expect(storage.getItem("webamp.effects")).toBeNull();
  });
});
