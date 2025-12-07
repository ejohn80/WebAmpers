/* global global */
// ^ Ignores for Vitest globals. ESlint sees these as undefined otherwise.

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import AudioExporter from "../components/AudioExport/AudioExporter";
import {AppContext} from "../context/AppContext";
import * as Tone from "tone";

// Mock Tone.js with more complete effects support
vi.mock("tone", () => {
  const mockOfflineRenders = [];

  return {
    context: {
      state: "suspended",
      rawContext: {
        sampleRate: 44100,
        createBuffer: vi.fn((channels, length, sampleRate) => ({
          numberOfChannels: channels,
          length,
          sampleRate,
          getChannelData: vi.fn(() => new Float32Array(length).fill(0.5)),
        })),
      },
    },
    start: vi.fn().mockResolvedValue(undefined),

    // Mock ToneAudioBuffer for converting native buffers
    ToneAudioBuffer: vi.fn().mockImplementation((buffer) => {
      return {
        duration: buffer.duration || 1,
        get: () => buffer,
        _buffer: buffer,
      };
    }),

    // Mock offline rendering to capture effects processing
    Offline: vi.fn((renderCallback, duration) => {
      const mockContext = {
        destination: {connect: vi.fn()},
        sampleRate: 44100,
      };

      renderCallback(mockContext);

      mockOfflineRenders.push({
        duration,
        context: mockContext,
        renderCallback,
      });

      const renderedBuffer = {
        numberOfChannels: 2,
        sampleRate: 44100,
        length: Math.floor(duration * 44100),
        duration,
        _effectsApplied: true,
        getChannelData: vi.fn(() => {
          const data = new Float32Array(Math.floor(duration * 44100));
          for (let i = 0; i < data.length; i++) {
            data[i] = 0.3 * Math.sin(i * 0.01);
          }
          return data;
        }),
        get: vi.fn().mockReturnValue({
          numberOfChannels: 2,
          sampleRate: 44100,
          length: Math.floor(duration * 44100),
          getChannelData: vi.fn(() => {
            const data = new Float32Array(Math.floor(duration * 44100));
            for (let i = 0; i < data.length; i++) {
              data[i] = 0.3 * Math.sin(i * 0.01);
            }
            return data;
          }),
        }),
      };

      return Promise.resolve(renderedBuffer);
    }),

    Player: class MockPlayer {
      constructor(opts = {}) {
        this.url = opts.url;
        this.context = opts.context;
        this._connected = [];
      }
      chain(...nodes) {
        this._connected = nodes;
        return this;
      }
      toDestination() {
        this._connected.push("destination");
        return this;
      }
      start(time) {
        this._startTime = time;
      }
      connect(node) {
        this._connected.push(node);
      }
    },

    PitchShift: class MockPitchShift {
      constructor(opts = {}) {
        this.pitch = opts.pitch;
        this.context = opts.context;
        this._effectType = "pitch";
      }
    },

    Freeverb: class MockFreeverb {
      constructor(opts = {}) {
        this.roomSize = opts.roomSize;
        this.dampening = opts.dampening;
        this.wet = opts.wet;
        this.context = opts.context;
        this._effectType = "reverb";
      }
    },

    FeedbackDelay: class MockFeedbackDelay {
      constructor(opts = {}) {
        this.delayTime = opts.delayTime;
        this.feedback = opts.feedback;
        this.wet = opts.wet;
        this.context = opts.context;
        this._effectType = "delay";
      }
    },

    PingPongDelay: class MockPingPongDelay {
      constructor(opts = {}) {
        this.delayTime = opts.delayTime;
        this.feedback = opts.feedback;
        this.wet = opts.wet;
        this.context = opts.context;
        this._effectType = "pingpongdelay";
      }
    },

    EQ3: class MockEQ3 {
      constructor(opts = {}) {
        this.low = opts.low;
        this.mid = opts.mid;
        this.high = opts.high;
        this.context = opts.context;
        this._effectType = "eq3";
      }
    },

    Filter: class MockFilter {
      constructor(opts = {}) {
        this.type = opts.type;
        this.frequency = opts.frequency;
        this.gain = opts.gain;
        this.context = opts.context;
        this._effectType = "filter";
      }
    },

    Distortion: class MockDistortion {
      constructor(opts = {}) {
        this.distortion = opts.distortion;
        this.wet = opts.wet;
        this.context = opts.context;
        this._effectType = "distortion";
      }
    },

    Gain: class MockGain {
      constructor(opts = {}) {
        this.gain = {value: opts.gain || 1};
        this.context = opts.context;
        this._effectType = "gain";
      }
    },

    __mockData: {
      getOfflineRenders: () => mockOfflineRenders,
      clearOfflineRenders: () =>
        mockOfflineRenders.splice(0, mockOfflineRenders.length),
    },
  };
});

// Create shared mock instance that we can spy on
let mockExportManagerInstance = null;

// Mock ExportManager
vi.mock("../components/AudioExport/ExportManager", () => {
  return {
    default: class MockExportManager {
      constructor() {
        mockExportManagerInstance = this;
      }

      async applyMasterEffects(buffer, effects) {
        // Simulate the actual method from ExportManager
        if (!effects || Object.keys(effects).length === 0) {
          return buffer;
        }

        const hasEffects =
          (effects?.pitch && effects.pitch !== 0) ||
          (effects?.reverb && effects.reverb > 0) ||
          (effects?.volume && effects.volume !== 100) ||
          (effects?.delay && effects.delay > 0) ||
          (effects?.bass && effects.bass !== 0) ||
          (effects?.distortion && effects.distortion > 0);

        if (!hasEffects) {
          return buffer;
        }

        console.log("Applying effects:", effects);

        // Use Tone.Offline to simulate processing
        return await Tone.Offline(async (context) => {
          const player = new Tone.Player({url: buffer, context});
          const effectsChain = [];

          if (effects?.pitch && effects.pitch !== 0) {
            effectsChain.push(
              new Tone.PitchShift({pitch: effects.pitch, context})
            );
          }

          if (effects?.reverb && effects.reverb > 0) {
            const wet = Math.max(0, Math.min(1, effects.reverb / 100));
            effectsChain.push(
              new Tone.Freeverb({roomSize: 0.1 + 0.85 * wet, wet, context})
            );
          }

          if (effects?.distortion && effects.distortion > 0) {
            const amount = Math.max(0, Math.min(1, effects.distortion / 100));
            effectsChain.push(
              new Tone.Distortion({distortion: amount, wet: 1, context})
            );
          }

          if (effects?.delay && effects.delay > 0) {
            const wet = Math.max(0, Math.min(1, effects.delay / 100));
            effectsChain.push(
              new Tone.PingPongDelay({
                delayTime: "8n",
                feedback: 0.2 + 0.6 * wet,
                wet,
                context,
              })
            );
          }

          if (effects?.bass && effects.bass !== 0) {
            effectsChain.push(
              new Tone.Filter({
                type: "lowshelf",
                frequency: 250,
                gain: effects.bass,
                context,
              })
            );
          }

          if (effects?.volume && effects.volume !== 100) {
            const gain = Math.max(0, Math.min(2, effects.volume / 100));
            effectsChain.push(new Tone.Gain({gain, context}));
          }

          if (effectsChain.length > 0) {
            player.chain(...effectsChain, context.destination);
          } else {
            player.toDestination();
          }

          player.start(0);
        }, buffer.duration);
      }

      async mixTracks(tracks, totalLengthMs) {
        // Return a simple mock buffer
        const mockBuffer = {
          numberOfChannels: 2,
          sampleRate: 44100,
          length: Math.floor((totalLengthMs / 1000) * 44100),
          duration: totalLengthMs / 1000,
          getChannelData: vi.fn(() =>
            new Float32Array(Math.floor((totalLengthMs / 1000) * 44100)).fill(
              0.5
            )
          ),
        };
        return mockBuffer;
      }

      createWavBlob(_audioBuffer) {
        return new Blob(["mock-wav"], {type: "audio/wav"});
      }

      async exportAudio(tracks, totalLengthMs, effects = {}, options = {}) {
        // Simulate the full export flow
        let MIXED_BUFFER = await this.mixTracks(tracks, totalLengthMs);

        if (effects && Object.keys(effects).length > 0) {
          MIXED_BUFFER = await this.applyMasterEffects(MIXED_BUFFER, effects);
        }

        const format = options.format || "mp3";
        return {success: true, format};
      }
    },
  };
});

// Mock PythonApiClient
vi.mock("../../backend/PythonApiClient", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      exportAudio: vi
        .fn()
        .mockResolvedValue(new Blob(["mock"], {type: "audio/mp3"})),
      downloadBlob: vi.fn(),
    })),
  };
});

// Mock DOM methods for file downloads
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

const mockAnchorElement = {
  click: vi.fn(),
  download: "",
  href: "",
  remove: vi.fn(),
};

const originalCreateElement = document.createElement.bind(document);
const createElementSpy = vi.spyOn(document, "createElement");
createElementSpy.mockImplementation((tag) => {
  if (tag === "a") return mockAnchorElement;
  return originalCreateElement(tag);
});

const originalAppendChild = document.body.appendChild.bind(document.body);
const originalRemoveChild = document.body.removeChild.bind(document.body);

vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
  if (node === mockAnchorElement) return node;
  return originalAppendChild(node);
});

vi.spyOn(document.body, "removeChild").mockImplementation((node) => {
  if (node === mockAnchorElement) return node;
  return originalRemoveChild(node);
});

describe("AudioExporter with Effects", () => {
  let mockTracks;
  let mockContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    Tone.__mockData.clearOfflineRenders();
    mockExportManagerInstance = null;

    // Create mock tracks with segments
    mockTracks = [
      {
        id: "track-1",
        name: "Track 1",
        mute: false,
        solo: false,
        volume: 0,
        pan: 0,
        segments: [
          {
            id: "seg-1",
            trackId: "track-1",
            startOnTimelineMs: 0,
            startInFileMs: 0,
            durationMs: 1000,
            buffer: {
              numberOfChannels: 2,
              sampleRate: 44100,
              length: 44100,
              duration: 1,
              getChannelData: vi.fn(() => new Float32Array(44100).fill(0.5)),
            },
          },
        ],
      },
    ];

    // Mock context value with effects
    mockContextValue = {
      effects: {
        pitch: 2,
        volume: 150,
        reverb: 30,
        delay: 0,
        bass: 0,
        distortion: 0,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports audio with effects applied from context", async () => {
    render(
      <AppContext.Provider value={mockContextValue}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    // Wait a bit more for the async export to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The export should have been called (the button should be back to normal state)
    expect(
      screen.getByRole("button", {name: /export audio/i})
    ).not.toBeDisabled();
  });

  it("processes audio with pitch shift effects", async () => {
    const contextWithPitch = {
      effects: {
        pitch: 5,
        volume: 100,
        reverb: 0,
        delay: 0,
        bass: 0,
        distortion: 0,
      },
    };

    render(
      <AppContext.Provider value={contextWithPitch}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    // Wait for the export to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify offline rendering was triggered
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("processes audio with reverb effects", async () => {
    const contextWithReverb = {
      effects: {
        pitch: 0,
        volume: 100,
        reverb: 50,
        delay: 0,
        bass: 0,
        distortion: 0,
      },
    };

    render(
      <AppContext.Provider value={contextWithReverb}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("processes audio with volume effects", async () => {
    const contextWithVolume = {
      effects: {
        pitch: 0,
        volume: 200,
        reverb: 0,
        delay: 0,
        bass: 0,
        distortion: 0,
      },
    };

    render(
      <AppContext.Provider value={contextWithVolume}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("processes audio with delay effects", async () => {
    const contextWithDelay = {
      effects: {
        pitch: 0,
        volume: 100,
        reverb: 0,
        delay: 40,
        bass: 0,
        distortion: 0,
      },
    };

    render(
      <AppContext.Provider value={contextWithDelay}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("processes audio with bass boost effects", async () => {
    const contextWithBass = {
      effects: {
        pitch: 0,
        volume: 100,
        reverb: 0,
        delay: 0,
        bass: 6,
        distortion: 0,
      },
    };

    render(
      <AppContext.Provider value={contextWithBass}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("processes audio with distortion effects", async () => {
    const contextWithDistortion = {
      effects: {
        pitch: 0,
        volume: 100,
        reverb: 0,
        delay: 0,
        bass: 0,
        distortion: 60,
      },
    };

    render(
      <AppContext.Provider value={contextWithDistortion}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("processes audio with multiple effects combined", async () => {
    const contextWithMultiple = {
      effects: {
        pitch: 3,
        volume: 80,
        reverb: 25,
        delay: 15,
        bass: -3,
        distortion: 20,
      },
    };

    render(
      <AppContext.Provider value={contextWithMultiple}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders.length).toBeGreaterThan(0);
  });

  it("skips processing when no effects are applied", async () => {
    const contextNoEffects = {
      effects: {
        pitch: 0,
        volume: 100,
        reverb: 0,
        delay: 0,
        bass: 0,
        distortion: 0,
      },
    };

    render(
      <AppContext.Provider value={contextNoEffects}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should not trigger offline rendering when no effects
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders).toHaveLength(0);
  });

  it("handles export errors gracefully", async () => {
    // Make the exportAudio method throw an error
    const contextValue = {
      effects: {
        pitch: 0,
        volume: 100,
        reverb: 0,
        delay: 0,
        bass: 0,
        distortion: 0,
      },
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppContext.Provider value={contextValue}>
        <AudioExporter
          tracks={mockTracks}
          totalLengthMs={1000}
          onExportComplete={vi.fn()}
        />
      </AppContext.Provider>
    );

    // Wait for component to mount and create the manager instance
    await waitFor(() => {
      expect(mockExportManagerInstance).toBeTruthy();
    });

    // Now spy on the exportAudio method to make it fail
    const exportSpy = vi
      .spyOn(mockExportManagerInstance, "exportAudio")
      .mockRejectedValueOnce(new Error("Export failed"));

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalled();
    });

    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText(/Export failed/i)).toBeInTheDocument();
    });

    expect(consoleSpy).toHaveBeenCalledWith("Export Error:", expect.any(Error));

    consoleSpy.mockRestore();
  });
});
