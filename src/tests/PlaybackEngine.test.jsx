import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, waitFor} from "@testing-library/react";
import * as Tone from "tone";
import WebAmpPlayback, {PlaybackEngine} from "../playback/playback.jsx";

// Helper function from playback.jsx: Convert decibels to linear gain value
const dbToGain = (db) => (typeof db === "number" ? Math.pow(10, db / 20) : 1);

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
      toDestination() {
        this.connect(this.destination ?? {});
        return this;
      }
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

    // Use dbToGain for precise assertion
    expect(bus1.gain.gain.value).toBeCloseTo(dbToGain(0)); // 0dB -> 1.0
    expect(bus2.gain.gain.value).toBeCloseTo(dbToGain(-6)); // -6dB -> ~0.501

    // Mute t1
    engineInstance.setTrackMute("t1", true);
    // _applyMuteSolo uses 0.0001 for mute target
    expect(bus1.gain.gain.value).toBeCloseTo(0.0001);

    // Unmute t1
    engineInstance.setTrackMute("t1", false);
    // Should restore to initial value (1)
    expect(bus1.gain.gain.value).toBeCloseTo(dbToGain(0));
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

    // Sanity initial: b is muted from metadata (0.0001)
    expect(b.gain.gain.value).toBeCloseTo(0.0001);
    // a and c should be at 1.0 (dbToGain(0))
    expect(a.gain.gain.value).toBeCloseTo(dbToGain(0));
    expect(c.gain.gain.value).toBeCloseTo(dbToGain(0));

    // Solo track 'a'
    engineInstance.setTrackSolo("a", true);
    // a should be audible (1.0) - FIX: use precise assertion
    expect(a.gain.gain.value).toBeCloseTo(dbToGain(0));
    // c should be muted because not soloed (0.0001)
    expect(c.gain.gain.value).toBeCloseTo(0.0001);

    // Now solo 'b' as well, but b has explicit mute true — mute should take precedence
    engineInstance.setTrackSolo("b", true);
    expect(b.gain.gain.value).toBeCloseTo(0.0001); // still muted despite being soloed
  });

  it("loads an empty timeline and stops playback when version becomes empty", async () => {
    let engineInstance = null;
    const utils = render(
      <WebAmpPlayback
        version={makeVersion([{id: "seed"}])}
        onEngineReady={(eng) => (engineInstance = eng)}
      />
    );

    await waitFor(() => {
      if (!engineInstance) throw new Error("no engine yet");
      if (!engineInstance.trackBuses || engineInstance.trackBuses.size === 0)
        throw new Error("buses not ready");
    });

    const loadSpy = vi.spyOn(engineInstance, "load");
    Tone.Transport.stop.mockClear();

    utils.rerender(
      <WebAmpPlayback
        version={null}
        onEngineReady={(eng) => (engineInstance = eng)}
      />
    );

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1);
    });

    const [emptyVersionArg] = loadSpy.mock.calls[0];
    expect(emptyVersionArg.tracks).toHaveLength(0);
    expect(emptyVersionArg.lengthMs).toBe(0);

    await waitFor(() => {
      expect(Tone.Transport.stop).toHaveBeenCalled();
    });
  });
});

describe("PlaybackEngine transport controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Tone.Transport.seconds = 0;
  });

  it("restarts from the beginning when play is invoked at the end of the timeline", async () => {
    const events = {onProgress: vi.fn(), onTransport: vi.fn()};
    const engine = new PlaybackEngine(events);
    await engine.load(makeVersion([{id: "multi"}]));

    Tone.Transport.seconds = engine.version.lengthMs / 1000;
    const seekSpy = vi.spyOn(engine, "seekMs");

    await engine.play();

    expect(seekSpy).toHaveBeenCalledWith(0);
    expect(Tone.Transport.start).toHaveBeenCalledWith("+0.2");
    expect(events.onTransport).toHaveBeenCalledWith(
      expect.objectContaining({playing: true})
    );
  });

  it("applies jog latency and clamps positions when seeking", () => {
    const engine = new PlaybackEngine({});
    engine.version = makeVersion([{id: "mx"}]);

    engine.seekMs(-500);
    expect(Tone.Transport.seconds).toBeCloseTo(engine.jogLatencySec, 5);

    engine.seekMs(2500);
    expect(Tone.Transport.seconds).toBeCloseTo(2.5 + engine.jogLatencySec, 5);
  });
});
