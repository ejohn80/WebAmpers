import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import PlaybackUI from "../components/Layout/PlaybackUI.jsx";

// Mock Tone for jsdom similar to other tests
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
  lengthMs: 60000,
  tracks: [{id: "t1", gainDb: 0, pan: 0, mute: false, solo: false}],
  segments: [],
  loop: {enabled: false},
});

const getTimeText = () => {
  // The first code element in the transport shows the time label
  return screen.getByText(/\d+:\d{2}/);
};

describe("Arrow keys seek in PlaybackUI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ArrowRight advances ~10s; ArrowLeft rewinds", async () => {
    render(<PlaybackUI version={makeVersion()} />);

    // Wait for UI to render time label
    const initial = await screen.findByText(/0:\d{2}/);
    expect(initial).toBeInTheDocument();

    // Right arrow should advance by 10s
    fireEvent.keyDown(window, {
      code: "ArrowRight",
      key: "ArrowRight",
      bubbles: true,
    });

    await waitFor(() => {
      expect(getTimeText().textContent?.startsWith("0:10")).toBe(true);
    });

    // Left arrow should go back to 0:00
    fireEvent.keyDown(window, {
      code: "ArrowLeft",
      key: "ArrowLeft",
      bubbles: true,
    });

    await waitFor(() => {
      expect(getTimeText().textContent?.startsWith("0:00")).toBe(true);
    });
  });

  it("does not seek when an input is focused", async () => {
    render(
      <div>
        <input aria-label="field" />
        <PlaybackUI version={makeVersion()} />
      </div>
    );

    // Focus input and try right arrow
    const input = screen.getByLabelText("field");
    input.focus();

    const timeBefore = await screen.findByText(/0:\d{2}/);
    fireEvent.keyDown(input, {
      code: "ArrowRight",
      key: "ArrowRight",
      bubbles: true,
    });

    // Time stays the same (still 0:00)
    expect(timeBefore.textContent?.startsWith("0:00")).toBe(true);
  });
});
