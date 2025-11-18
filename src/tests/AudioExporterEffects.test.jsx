import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import AudioExporter from "../components/AudioExport/AudioExporter";
import {AppContext} from "../context/AppContext";
import * as Tone from "tone";

// Mock Tone.js with more complete effects support
vi.mock("tone", () => {
  // Track offline rendering calls to verify effects are applied
  const mockOfflineRenders = [];

  return {
    context: {
      state: "suspended",
      createBuffer: vi.fn((channels, length, sampleRate) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length).fill(0.5)),
      })),
    },
    start: vi.fn().mockResolvedValue(undefined),

    // Mock offline rendering to capture effects processing
    Offline: vi.fn((renderCallback, duration) => {
      const mockContext = {
        destination: {connect: vi.fn()},
        sampleRate: 44100,
      };

      const renderPromise = renderCallback(mockContext);

      // Store render info for verification
      mockOfflineRenders.push({
        duration,
        context: mockContext,
        renderCallback,
      });

      // Return a mock rendered buffer with different characteristics
      const renderedBuffer = {
        numberOfChannels: 2,
        sampleRate: 44100,
        length: Math.floor(duration * 44100),
        duration,
        _effectsApplied: true, // Flag to identify processed buffer
        getChannelData: vi.fn(() => {
          // Create slightly different audio data to simulate effect processing
          const data = new Float32Array(Math.floor(duration * 44100));
          for (let i = 0; i < data.length; i++) {
            data[i] = 0.3 * Math.sin(i * 0.01); // Different from original
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
              data[i] = 0.3 * Math.sin(i * 0.01); // Processed audio signature
            }
            return data;
          }),
        }),
      };

      return Promise.resolve(renderedBuffer);
    }),

    // Mock effects
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

    Gain: class MockGain {
      constructor(opts = {}) {
        this.gain = {value: opts.gain || 1};
        this.context = opts.context;
        this._effectType = "gain";
      }
    },

    // Expose mock data for testing
    __mockData: {
      getOfflineRenders: () => mockOfflineRenders,
      clearOfflineRenders: () =>
        mockOfflineRenders.splice(0, mockOfflineRenders.length),
    },
  };
});

// Mock ExportManager
const mockExportAudio = vi.fn();
const mockCreateWavBlob = vi.fn();

vi.mock("../components/AudioExport/ExportManager", () => {
  return {
    default: class MockExportManager {
      constructor() {
        this.exportAudio = mockExportAudio;
        this.createWavBlob = mockCreateWavBlob;
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
  let mockAudioBuffer;
  let mockEngine;
  let mockContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    Tone.__mockData.clearOfflineRenders();

    // Create mock audio buffer
    mockAudioBuffer = {
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 44100, // 1 second
      duration: 1,
      getChannelData: vi.fn(() => {
        const data = new Float32Array(44100);
        data.fill(0.5); // Original audio signature
        return data;
      }),
      get: vi.fn().mockReturnValue({
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 44100,
        getChannelData: vi.fn(() => {
          const data = new Float32Array(44100);
          data.fill(0.5); // Original audio signature
          return data;
        }),
      }),
    };

    // Create mock engine with renderAudioWithEffects
    mockEngine = {
      renderAudioWithEffects: vi
        .fn()
        .mockImplementation(async (buffer, effects) => {
          // Simulate the actual renderAudioWithEffects method
          const hasEffects =
            (effects?.pitch && effects.pitch !== 0) ||
            (effects?.reverb && effects.reverb > 0) ||
            (effects?.volume !== undefined && effects.volume !== 100);

          if (!hasEffects) {
            return buffer;
          }

          // Use Tone.Offline to simulate rendering
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
                new Tone.Freeverb({
                  roomSize: 0.1 + 0.85 * wet,
                  wet,
                  context,
                })
              );
            }

            if (effects?.volume !== undefined && effects.volume !== 100) {
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
        }),
    };

    // Mock context value with effects
    mockContextValue = {
      effects: {
        pitch: 2, // 2 semitones up
        volume: 150, // 150% volume
        reverb: 30, // 30% reverb
      },
      engineRef: {current: mockEngine},
    };

    // Setup export manager mocks
    mockExportAudio.mockResolvedValue({success: true, format: "mp3"});
    mockCreateWavBlob.mockReturnValue(new Blob(["mock"], {type: "audio/wav"}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies effects when getProcessedBuffer is provided", async () => {
    const mockGetProcessedBuffer = vi.fn().mockResolvedValue({
      ...mockAudioBuffer,
      _effectsApplied: true,
      getChannelData: vi.fn(() => {
        const data = new Float32Array(44100);
        // Simulate processed audio with different characteristics
        for (let i = 0; i < data.length; i++) {
          data[i] = 0.3 * Math.sin(i * 0.01);
        }
        return data;
      }),
    });

    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        getProcessedBuffer={mockGetProcessedBuffer}
        onExportComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockGetProcessedBuffer).toHaveBeenCalled();
      expect(mockExportAudio).toHaveBeenCalled();
    });

    // Verify that the processed buffer was used for export
    const exportCall = mockExportAudio.mock.calls[0];
    const usedBuffer = exportCall[0];
    expect(usedBuffer._effectsApplied).toBe(true);
  });

  it("uses original buffer when getProcessedBuffer is not provided", async () => {
    render(
      <AudioExporter audioBuffer={mockAudioBuffer} onExportComplete={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockExportAudio).toHaveBeenCalled();
    });

    // Verify that the original buffer was used for export
    const exportCall = mockExportAudio.mock.calls[0];
    const usedBuffer = exportCall[0];
    expect(usedBuffer._effectsApplied).toBeUndefined();
  });

  it("processes audio with pitch shift effects", async () => {
    const TestComponent = () => {
      const getProcessedBuffer = async () => {
        return await mockEngine.renderAudioWithEffects(mockAudioBuffer, {
          pitch: 5, // 5 semitones up
          volume: 100,
          reverb: 0,
        });
      };

      return (
        <AudioExporter
          audioBuffer={mockAudioBuffer}
          getProcessedBuffer={getProcessedBuffer}
          onExportComplete={vi.fn()}
        />
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockEngine.renderAudioWithEffects).toHaveBeenCalledWith(
        mockAudioBuffer,
        expect.objectContaining({pitch: 5})
      );
    });

    // Verify offline rendering was triggered
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders).toHaveLength(1);
  });

  it("processes audio with reverb effects", async () => {
    const TestComponent = () => {
      const getProcessedBuffer = async () => {
        return await mockEngine.renderAudioWithEffects(mockAudioBuffer, {
          pitch: 0,
          volume: 100,
          reverb: 50, // 50% reverb
        });
      };

      return (
        <AudioExporter
          audioBuffer={mockAudioBuffer}
          getProcessedBuffer={getProcessedBuffer}
          onExportComplete={vi.fn()}
        />
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockEngine.renderAudioWithEffects).toHaveBeenCalledWith(
        mockAudioBuffer,
        expect.objectContaining({reverb: 50})
      );
    });

    // Verify offline rendering was triggered
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders).toHaveLength(1);
  });

  it("processes audio with volume effects", async () => {
    const TestComponent = () => {
      const getProcessedBuffer = async () => {
        return await mockEngine.renderAudioWithEffects(mockAudioBuffer, {
          pitch: 0,
          volume: 200, // 200% volume
          reverb: 0,
        });
      };

      return (
        <AudioExporter
          audioBuffer={mockAudioBuffer}
          getProcessedBuffer={getProcessedBuffer}
          onExportComplete={vi.fn()}
        />
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockEngine.renderAudioWithEffects).toHaveBeenCalledWith(
        mockAudioBuffer,
        expect.objectContaining({volume: 200})
      );
    });

    // Verify offline rendering was triggered
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders).toHaveLength(1);
  });

  it("processes audio with multiple effects combined", async () => {
    const TestComponent = () => {
      const getProcessedBuffer = async () => {
        return await mockEngine.renderAudioWithEffects(mockAudioBuffer, {
          pitch: 3, // 3 semitones up
          volume: 80, // 80% volume
          reverb: 25, // 25% reverb
        });
      };

      return (
        <AudioExporter
          audioBuffer={mockAudioBuffer}
          getProcessedBuffer={getProcessedBuffer}
          onExportComplete={vi.fn()}
        />
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockEngine.renderAudioWithEffects).toHaveBeenCalledWith(
        mockAudioBuffer,
        expect.objectContaining({
          pitch: 3,
          volume: 80,
          reverb: 25,
        })
      );
    });

    // Verify offline rendering was triggered
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders).toHaveLength(1);
  });

  it("skips processing when no effects are applied", async () => {
    const TestComponent = () => {
      const getProcessedBuffer = async () => {
        return await mockEngine.renderAudioWithEffects(mockAudioBuffer, {
          pitch: 0, // No pitch change
          volume: 100, // Default volume
          reverb: 0, // No reverb
        });
      };

      return (
        <AudioExporter
          audioBuffer={mockAudioBuffer}
          getProcessedBuffer={getProcessedBuffer}
          onExportComplete={vi.fn()}
        />
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockEngine.renderAudioWithEffects).toHaveBeenCalled();
    });

    // Should return original buffer without offline rendering
    const offlineRenders = Tone.__mockData.getOfflineRenders();
    expect(offlineRenders).toHaveLength(0);
  });

  it("handles processing errors gracefully", async () => {
    const mockGetProcessedBuffer = vi
      .fn()
      .mockRejectedValue(new Error("Effects processing failed"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        getProcessedBuffer={mockGetProcessedBuffer}
        onExportComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(mockGetProcessedBuffer).toHaveBeenCalled();
      // The AudioExporter logs "Export Error:" followed by the error object
      expect(consoleSpy).toHaveBeenCalledWith(
        "Export Error:",
        expect.any(Error)
      );
    });

    // Also verify the error message appears in the UI
    expect(screen.getByText(/Effects processing failed/i)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("verifies audio characteristics change after effect processing", async () => {
    let processedBuffer;

    const TestComponent = () => {
      const getProcessedBuffer = async () => {
        processedBuffer = await mockEngine.renderAudioWithEffects(
          mockAudioBuffer,
          {
            pitch: 7, // Significant pitch change
            volume: 150, // Volume boost
            reverb: 40, // Moderate reverb
          }
        );
        return processedBuffer;
      };

      return (
        <AudioExporter
          audioBuffer={mockAudioBuffer}
          getProcessedBuffer={getProcessedBuffer}
          onExportComplete={vi.fn()}
        />
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByRole("button", {name: /export audio/i}));

    await waitFor(() => {
      expect(processedBuffer).toBeDefined();
      expect(processedBuffer._effectsApplied).toBe(true);
    });

    // Verify that the processed audio has different characteristics
    const originalData = mockAudioBuffer.getChannelData(0);
    const processedData = processedBuffer.getChannelData(0);

    // Check that data is different (processed vs original)
    let isDifferent = false;
    for (
      let i = 0;
      i < Math.min(originalData.length, processedData.length);
      i++
    ) {
      if (Math.abs(originalData[i] - processedData[i]) > 0.01) {
        isDifferent = true;
        break;
      }
    }

    expect(isDifferent).toBe(true);
  });
});
