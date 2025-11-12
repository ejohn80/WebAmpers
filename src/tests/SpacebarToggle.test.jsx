import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import PlaybackUI from "../playback/playback.jsx";

// Mock Tone similarly to other playback tests so engine methods work in jsdom
vi.mock("tone", () => {
  let now = 0;
  return {
    context: {state: "suspended", createBuffer: () => ({})},
    start: vi.fn().mockResolvedValue(undefined),
    now: () => now,
    Gain: class MockGain {
      constructor(initial = 1) {
        this.gain = {
          value: initial,
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
    Panner: class MockPanner {
      constructor(v = 0) {
        this.pan = {value: v};
      }
      connect() {}
      disconnect() {}
      dispose() {}
    },
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
      // static load is used by _preload in some paths – mock to resolve
      static load() {
        return Promise.resolve();
      }
    },
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
    Destination: {},
  };
});

const makeVersion = () => ({
  bpm: 120,
  timeSig: [4, 4],
  lengthMs: 10000,
  tracks: [{id: "t1", gainDb: 0, pan: 0, mute: false, solo: false}],
  segments: [],
  loop: {enabled: false},
});

describe("Spacebar toggles PlaybackUI play/pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toggles when space is pressed and focus not in input", async () => {
    render(<PlaybackUI version={makeVersion()} />);

    // Initially should show Play button
    expect(
      await screen.findByRole("button", {name: /play/i})
    ).toBeInTheDocument();

    // Press Space on window
    fireEvent.keyDown(window, {code: "Space", key: " ", bubbles: true});

    // Should now show Pause button
    await waitFor(() =>
      expect(screen.getByRole("button", {name: /pause/i})).toBeInTheDocument()
    );

    // Press Space again, it should return to Play
    fireEvent.keyDown(window, {code: "Space", key: " ", bubbles: true});
    await waitFor(() =>
      expect(screen.getByRole("button", {name: /play/i})).toBeInTheDocument()
    );
  });

  it("does not toggle when typing in an input", async () => {
    render(
      <div>
        <input aria-label="name" />
        <PlaybackUI version={makeVersion()} />
      </div>
    );

    const playBtn = await screen.findByRole("button", {name: /play/i});
    expect(playBtn).toBeInTheDocument();

    const input = screen.getByLabelText("name");
    input.focus();

    fireEvent.keyDown(input, {code: "Space", key: " ", bubbles: true});

    // Still Play because input is focused
    expect(screen.getByRole("button", {name: /play/i})).toBeInTheDocument();
  });
});
