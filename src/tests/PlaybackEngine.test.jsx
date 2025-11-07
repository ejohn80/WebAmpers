import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, waitFor} from "@testing-library/react";
import WebAmpPlayback from "../playback/playback.jsx";

// Provide a mock implementation of Tone used by playback.jsx. This mock is
// deliberately minimal and focused on the Gain/panning/mute/solo behavior we
// want to test.
vi.mock("tone", () => {
  // Simple mock playback time source
  let now = 0;
  return {
    context: {state: "suspended"},
    start: vi.fn().mockResolvedValue(undefined),
    now: () => now,
    // Minimal Gain that provides the API the engine expects
    Gain: class MockGain {
      constructor(initial = 1) {
        this.gain = {
          value: initial,
          // These methods are called by the engine; make them update value
          cancelAndHoldAtTime: () => {},
          exponentialRampToValueAtTime: (v) => {
            this.gain.value = v;
          },
        };
      }
      connect() {}
      disconnect() {}
      dispose() {}
    },
    // Minimal Panner
    Panner: class MockPan {
      constructor(v = 0) {
        this.pan = {value: v};
      }
      connect() {}
      disconnect() {}
      dispose() {}
    },
    // Minimal Player that supports sync/start API but does nothing
    Player: class MockPlayer {
      constructor(opts = {}) {
        this.url = opts.url;
        this.autostart = opts.autostart;
        this._started = false;
      }
      connect() {}
      sync() {}
      start() {
        this._started = true;
      }
      unsync() {}
      dispose() {}
    },
    ToneAudioBuffer: class MockToneAudioBuffer {
      constructor(native) {
        this._native = native;
      }
      get() {
        return this._native || {};
      }
    },
    // Very small Transport mock
    Transport: {
      bpm: {value: 120},
      timeSignature: 4,
      start: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seconds: 0,
      setLoopPoints: vi.fn(),
      loop: false,
      cancel: vi.fn(),
    },
    // Tone.Destination placeholder
    Destination: {},
    // helper shorthand for naming used in code (Panner vs Tone.Panner)
    Panner: class MockPanner {
      constructor(v = 0) {
        this.pan = {value: v};
      }
      connect() {}
      disconnect() {}
      dispose() {}
    },
  };
});

// Helper: create a very small "version" object with tracks but no segments.
const makeVersion = (tracks) => ({
  bpm: 120,
  timeSig: [4, 4],
  lengthMs: 60000,
  tracks: tracks.map((t) => ({
    id: t.id,
    gainDb: typeof t.gainDb === "number" ? t.gainDb : 0,
    pan: typeof t.pan === "number" ? t.pan : 0,
    mute: !!t.mute,
    solo: !!t.solo,
    color: t.color || "#888",
  })),
  segments: [],
  loop: {enabled: false},
});

describe("PlaybackEngine mute/solo behavior (via WebAmpPlayback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies mute correctly and unmute restores track gain", async () => {
    let engineInstance = null;
    const v = makeVersion([
      {id: "t1", gainDb: 0, mute: false, solo: false},
      {id: "t2", gainDb: -6, mute: false, solo: false},
    ]);

    // Render with onEngineReady to capture the engine instance
    render(
      <WebAmpPlayback
        version={v}
        onEngineReady={(eng) => (engineInstance = eng)}
      />
    );

    // Wait for engine to load and create track buses
    await waitFor(() => {
      if (!engineInstance) throw new Error("no engine yet");
      if (!engineInstance.trackBuses || engineInstance.trackBuses.size === 0)
        throw new Error("no buses yet");
    });

    // Ensure initial gains match dbToGain conversion
    const bus1 = engineInstance.trackBuses.get("t1");
    const bus2 = engineInstance.trackBuses.get("t2");
    expect(bus1).toBeDefined();
    expect(bus2).toBeDefined();
    // initial gain for gainDb=0 -> 1
    expect(bus1.gain.gain.value).toBeCloseTo(1);
    // gainDb=-6 -> ~0.501
    expect(bus2.gain.gain.value).toBeGreaterThan(0);

    // Mute t1
    engineInstance.setTrackMute("t1", true);
    // _applyMuteSolo uses exponentialRampToValueAtTime which in our mock sets value
    expect(bus1.gain.gain.value).toBeCloseTo(0.0001);

    // Unmute t1
    engineInstance.setTrackMute("t1", false);
    expect(bus1.gain.gain.value).toBeCloseTo(1);
  });

  it("solo mutes other tracks and mute overrides solo", async () => {
    let engineInstance = null;
    const v = makeVersion([
      {id: "a", gainDb: 0, mute: false, solo: false},
      {id: "b", gainDb: 0, mute: true, solo: false},
      {id: "c", gainDb: 0, mute: false, solo: false},
    ]);

    render(
      <WebAmpPlayback
        version={v}
        onEngineReady={(eng) => (engineInstance = eng)}
      />
    );

    await waitFor(() => {
      if (!engineInstance) throw new Error("no engine yet");
      if (!engineInstance.trackBuses || engineInstance.trackBuses.size < 3)
        throw new Error("buses not ready");
    });

    const a = engineInstance.trackBuses.get("a");
    const b = engineInstance.trackBuses.get("b");
    const c = engineInstance.trackBuses.get("c");

    // Sanity initial: b is muted from metadata
    expect(b.gain.gain.value).toBeCloseTo(0.0001);

    // Solo track 'a'
    engineInstance.setTrackSolo("a", true);
    // a should be audible, c should be muted because not soloed
    expect(a.gain.gain.value).toBeGreaterThan(0.1);
    expect(c.gain.gain.value).toBeCloseTo(0.0001);

    // Now solo 'b' as well, but b has explicit mute true — mute should take precedence
    engineInstance.setTrackSolo("b", true);
    expect(b.gain.gain.value).toBeCloseTo(0.0001); // still muted despite being soloed
  });
});
