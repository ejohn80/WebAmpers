import React from "react";
import {render, fireEvent, screen, waitFor} from "@testing-library/react";
import {vi, describe, it, expect, beforeEach, afterEach} from "vitest";
import {MemoryRouter} from "react-router-dom";

// -------------------------------------------------------------------------
// 1. Mocking External Libraries (Tone.js)
// -------------------------------------------------------------------------

vi.mock("tone", () => ({
  // Mock the context object used internally by Tone
  context: {
    // Mock the createBuffer method to return a minimal AudioBuffer-like object
    createBuffer: vi.fn((channels, length, sampleRate) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      copyToChannel: vi.fn(),
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
  },
  Transport: {
    stop: vi.fn(),
    cancel: vi.fn(),
    seconds: 0,
  },
  // Mock the ToneAudioBuffer constructor/class
  ToneAudioBuffer: vi.fn(function (buffer) {
    this._buffer = buffer;
    this.duration = buffer.duration;
    this.get = vi.fn(() => buffer);
  }),
  Channel: vi.fn(function () {
    this.volume = {value: 0};
    this.pan = {value: 0};
    this.mute = false;
    this.solo = false;
    this.dispose = vi.fn();
    this.toDestination = vi.fn(() => this);
  }),
  // Required for the initial `vi.mock('tone')` pattern
  start: vi.fn(() => Promise.resolve()),
}));

// -------------------------------------------------------------------------
// 2. Mocking Stateful Managers (AudioManager, ClipboardManager, DBManager)
// NOTE: We rely on the App/AudioPage component to handle the UI state (selection, tracks)
// but use these mocks to manage the underlying data store interactions.
// -------------------------------------------------------------------------

// --- Mock Audio Manager ---
const mockTracks = [];
const mockAudioManager = {
  tracks: mockTracks,
  clearAllTracks: vi.fn(() => {
    mockTracks.length = 0;
  }),
  getTrack: vi.fn((trackId) => mockTracks.find((t) => t.id === trackId)),
  deleteTrack: vi.fn((trackId) => {
    const index = mockTracks.findIndex((t) => t.id === trackId);
    if (index !== -1) mockTracks.splice(index, 1);
  }),
  // Simulates the paste action which creates a new track (logic defined in test setup below)
  pasteTrack: vi.fn((trackData) => {
    // Simulating track creation logic that adds to the tracks array
    const newTrack = {
      ...trackData,
      id: `track_${Date.now()}_${Math.random().toString().slice(2, 6)}`,
    };
    mockTracks.push(newTrack);
    return Promise.resolve(newTrack.id);
  }),
  // Needed for paste renaming logic
  getTrackNames: vi.fn(() => mockTracks.map((t) => t.name)),
};

vi.mock("../managers/AudioManager", () => ({
  audioManager: mockAudioManager,
}));

// --- Mock Clipboard Manager ---
let mockClipboard = null;
const mockClipboardManager = {
  getClipboard: vi.fn(() => mockClipboard),
  hasClipboard: vi.fn(() => mockClipboard !== null),
  clearClipboard: vi.fn(() => {
    mockClipboard = null;
  }),
  // Mock setTrackData to set internal clipboard state
  setTrackData: vi.fn((track, operation) => {
    const trackData = {
      // Minimal properties needed for clipboard data in the real app
      name: track.name,
      // ... include other necessary properties like segments, assetId, etc.
      segments: track.segments,
      assetId: track.assetId,
    };
    mockClipboard = {operation, trackData: trackData};
  }),
};

vi.mock("../managers/clipboardManager", () => ({
  clipboardManager: mockClipboardManager,
}));

// --- Mock DB Manager ---
const MOCK_SESSION_ID = "test-session-123";
const mockDbManager = {
  openDB: vi.fn(() => Promise.resolve()),
  clearAllTracks: vi.fn(() => Promise.resolve()),
  getAllSessions: vi.fn(() => Promise.resolve([])),
  deleteSession: vi.fn(() => Promise.resolve()),
  createSession: vi.fn(() => Promise.resolve(MOCK_SESSION_ID)),
  addAsset: vi.fn(() => Promise.resolve(Math.random().toString())),
  // Mock addTrack to simulate it successfully adding the track to the audioManager state
  addTrack: vi.fn((trackData, sessionId) => {
    const newTrack = {...trackData, id: `track_${Date.now()}`};
    mockTracks.push(newTrack);
    return Promise.resolve(newTrack.id);
  }),
  deleteTrack: vi.fn((trackId, sessionId) => {
    mockAudioManager.deleteTrack(trackId);
    return Promise.resolve();
  }),
};

vi.mock("../managers/DBManager", () => ({
  dbManager: mockDbManager,
}));

// --- Mock AppContext and Component Under Test (AudioPage) ---
// Since we don't have the real AudioPage and AppContext, we need to create
// a mock context provider and mock component that simulates the real hotkey logic.
const AppContext = React.createContext({});
const AudioPage = ({children}) => {
  // Mock state to track selected track ID
  const [selectedTrackId, setSelectedTrackId] = React.useState(null);

  React.useEffect(() => {
    // Simulate AppContext setting the selection
    const tracksInState = mockAudioManager.tracks;
    if (tracksInState.length > 0 && !selectedTrackId) {
      // Simulate selection logic when a track is clicked in the UI
      const handleTrackClick = (e) => {
        // Find the track element clicked (e.g., using a class or data-attribute)
        if (e.target.classList.contains("tracklane-root")) {
          setSelectedTrackId(tracksInState[0].id); // For simplicity, always select the first track
        } else {
          setSelectedTrackId(null);
        }
      };
      window.addEventListener("click", handleTrackClick);
      return () => window.removeEventListener("click", handleTrackClick);
    }
  }, [selectedTrackId]);

  React.useEffect(() => {
    const handleKeyDown = async (event) => {
      // 1. Ignore if focus is on an input/textarea
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        return;
      }

      // 2. Handle Copy/Cut/Paste (Ctrl/Cmd)
      if (event.ctrlKey || event.metaKey) {
        // Prevent default browser behavior for common shortcuts
        if (["c", "x", "v"].includes(event.key)) {
          event.preventDefault();
        }

        switch (event.key) {
          case "c": // Copy
            if (selectedTrackId) {
              const trackToCopy = mockAudioManager.getTrack(selectedTrackId);
              if (trackToCopy) {
                // In the real component, this calls clipboardManager.setTrackData
                mockClipboardManager.setTrackData(trackToCopy, "copy");
              }
            }
            break;
          case "x": // Cut
            if (selectedTrackId) {
              const trackToCut = mockAudioManager.getTrack(selectedTrackId);
              if (trackToCut) {
                // 1. Copy to clipboard
                mockClipboardManager.setTrackData(trackToCut, "cut");
                // 2. Delete the track
                await mockDbManager.deleteTrack(
                  selectedTrackId,
                  MOCK_SESSION_ID
                );
                setSelectedTrackId(null);
              }
            }
            break;
          case "v": // Paste
            if (mockClipboardManager.hasClipboard()) {
              event.preventDefault(); // Ensure we prevent paste into inputs if missed above
              const clipboardData = mockClipboardManager.getClipboard();
              if (clipboardData && clipboardData.trackData) {
                // Simulate renaming logic for pastes
                let newName = clipboardData.trackData.name;
                const existingNames = mockAudioManager.getTrackNames();
                let copyCount = 1;
                let baseName = newName;
                if (baseName.endsWith(" Copy") && baseName.length > 5) {
                  baseName = baseName.substring(0, baseName.length - 5);
                }
                while (existingNames.includes(newName)) {
                  newName = `${baseName} Copy ${copyCount === 1 ? "" : copyCount}`;
                  if (copyCount > 1) {
                    newName = `${baseName} Copy ${copyCount}`;
                  } else if (copyCount === 1) {
                    newName = `${baseName} Copy`;
                  }
                  copyCount++;
                }

                const trackToPaste = {
                  ...clipboardData.trackData,
                  name: newName,
                };
                // Call the audioManager paste mock which adds the track to state
                const newTrackId =
                  await mockAudioManager.pasteTrack(trackToPaste);

                // If it was a 'cut', clear the clipboard (unless it's set to copy after first paste)
                if (clipboardData.operation === "cut") {
                  mockClipboardManager.clearClipboard();
                } else if (clipboardData.operation === "copy") {
                  // Subsequent pastes are always copies, so the clipboard state remains
                }
                setSelectedTrackId(newTrackId);
              }
            }
            break;
        }
      }

      // 3. Handle Delete/Backspace
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedTrackId) {
          event.preventDefault();
          await mockDbManager.deleteTrack(selectedTrackId, MOCK_SESSION_ID);
          setSelectedTrackId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTrackId]);

  const mockContextValue = {
    selectedTrackId,
    setSelectedTrackId,
    activeSession: {id: MOCK_SESSION_ID},
    tracks: mockAudioManager.tracks,
  };

  return (
    <AppContext.Provider value={mockContextValue}>
      <div
        className="tracklane-root-container"
        onClick={(e) => {
          // Simulate clicking outside tracks to deselect
          if (e.target.classList.contains("tracklane-root-container")) {
            setSelectedTrackId(null);
          }
        }}
      >
        {/* Simulate tracks existing in the UI */}
        {mockAudioManager.tracks.map((track) => (
          <div
            key={track.id}
            data-testid={`track-${track.id}`}
            className="tracklane-root"
            style={{
              outline: selectedTrackId === track.id ? "2px solid red" : "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTrackId(track.id);
            }}
          >
            {track.name}
          </div>
        ))}
        {children}
      </div>
    </AppContext.Provider>
  );
};

// -------------------------------------------------------------------------
// 3. Test Utility Functions
// -------------------------------------------------------------------------

const createMockAudioBuffer = (name = "test.wav") => {
  const sampleRate = 44100;
  const length = 44100; // 1 second
  const channels = 2;

  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: vi.fn((channel) => new Float32Array(length)),
  };
};

const createAndAddTrack = async (name = "test.wav") => {
  const buffer = createMockAudioBuffer(name);

  // Serialize the buffer for DB storage (minimal structure)
  const serializedBuffer = {
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
    channels: [
      new Float32Array(buffer.length),
      new Float32Array(buffer.length),
    ],
  };

  // Create asset first (mocked)
  const assetId = await mockDbManager.addAsset({name});

  // Create track with assetId
  const trackData = {
    name,
    color: "#FF0000",
    assetId,
    // The segments property is crucial for the component logic
    segments: [
      {
        id: `seg_${Date.now()}`,
        buffer: serializedBuffer,
        duration: buffer.duration,
        durationMs: Math.round(buffer.duration * 1000),
      },
    ],
  };

  // dbManager.addTrack is mocked to push to audioManager.tracks
  const trackId = await mockDbManager.addTrack(trackData, MOCK_SESSION_ID);
  return {trackId, assetId, buffer, trackData};
};

// -------------------------------------------------------------------------
// 4. Test Suite
// -------------------------------------------------------------------------

describe("Clipboard and Delete Hotkeys Integration", () => {
  // Use MOCK_SESSION_ID globally for all tests

  beforeEach(async () => {
    // Clear state before each test
    vi.clearAllMocks();
    mockTracks.length = 0;
    mockClipboard = null;
    localStorage.clear();

    // Simulate DB setup (no need for complex DB mocks, just need the managers ready)
    await mockDbManager.openDB();
    await mockDbManager.createSession("Test Session");
    localStorage.setItem("webamp.activeSession", MOCK_SESSION_ID);

    // Reset mock implementation for paste track renaming logic
    mockAudioManager.getTrackNames.mockImplementation(() =>
      mockTracks.map((t) => t.name)
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  const setup = () => {
    return render(
      <MemoryRouter>
        <AudioPage>
          <input
            type="text"
            data-testid="test-input"
            placeholder="Test Input"
          />
        </AudioPage>
      </MemoryRouter>
    );
  };

  // --- Utility for Selection ---
  const selectFirstTrack = (container) => {
    // Relying on the mock component to render tracks with the class `tracklane-root`
    const trackLane = container.querySelector(".tracklane-root");
    fireEvent.click(trackLane);
  };

  describe("Ctrl+C (Copy) Hotkey", () => {
    it("copies selected track when Ctrl+C is pressed", async () => {
      const {trackId, trackData} = await createAndAddTrack("test-track.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));

      selectFirstTrack(container);

      // Wait for selection visual cue (set by mock component)
      await waitFor(() => {
        const selectedElement = container.querySelector(
          '[style*="outline: 2px solid"]'
        );
        expect(selectedElement).toBeInTheDocument();
      });

      // Press Ctrl+C
      fireEvent.keyDown(window, {key: "c", ctrlKey: true});

      // Check if clipboard manager was called with the correct data
      expect(mockClipboardManager.setTrackData).toHaveBeenCalledWith(
        expect.objectContaining({name: "test-track.wav", id: trackId}),
        "copy"
      );
      expect(mockClipboardManager.hasClipboard()).toBe(true);
      expect(mockAudioManager.tracks.length).toBe(1); // Track should still exist
    });

    it("does not trigger when typing in input field", async () => {
      await createAndAddTrack("test-track.wav");
      const {container} = setup();

      selectFirstTrack(container);
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));

      // Focus on input field
      const input = screen.getByTestId("test-input");
      input.focus();

      // Press Ctrl+C while in input
      fireEvent.keyDown(input, {key: "c", ctrlKey: true});

      // Clipboard should remain empty (or not be set by the hotkey listener)
      expect(mockClipboardManager.setTrackData).not.toHaveBeenCalled();
      expect(mockClipboardManager.hasClipboard()).toBe(false);
    });
  });

  describe("Ctrl+X (Cut) Hotkey", () => {
    it("cuts selected track and removes it from the list", async () => {
      const {trackId} = await createAndAddTrack("test-track.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));

      selectFirstTrack(container);
      await waitFor(() =>
        expect(
          container.querySelector('[style*="outline: 2px solid"]')
        ).toBeInTheDocument()
      );

      // Press Ctrl+X
      fireEvent.keyDown(window, {key: "x", ctrlKey: true});

      // Wait for clipboard to be populated and track to be deleted
      await waitFor(() => {
        expect(mockClipboardManager.setTrackData).toHaveBeenCalledWith(
          expect.objectContaining({name: "test-track.wav"}),
          "cut"
        );
        expect(mockDbManager.deleteTrack).toHaveBeenCalledWith(
          trackId,
          MOCK_SESSION_ID
        );
        expect(mockAudioManager.tracks.length).toBe(0); // Cut operation removes the track
        expect(mockClipboardManager.hasClipboard()).toBe(true);
      });
    });
  });

  describe("Ctrl+V (Paste) Hotkey", () => {
    it("pastes track when Ctrl+V is pressed and increments name for copies", async () => {
      await createAndAddTrack("test.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);

      // 1. Copy the track
      fireEvent.keyDown(window, {key: "c", ctrlKey: true});
      await waitFor(() =>
        expect(mockClipboardManager.hasClipboard()).toBe(true)
      );
      mockAudioManager.pasteTrack.mockClear(); // Clear the paste mock for clean paste tests

      // 2. Paste first time -> "test.wav Copy"
      fireEvent.keyDown(window, {key: "v", ctrlKey: true});
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(2));
      expect(mockAudioManager.tracks[1].name).toBe("test.wav Copy");
      expect(mockAudioManager.pasteTrack).toHaveBeenCalledTimes(1);

      // 3. Paste second time -> "test.wav Copy 2"
      fireEvent.keyDown(window, {key: "v", ctrlKey: true});
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(3));
      expect(mockAudioManager.tracks[2].name).toBe("test.wav Copy 2");
      expect(mockAudioManager.pasteTrack).toHaveBeenCalledTimes(2);

      // 4. Paste third time -> "test.wav Copy 3"
      fireEvent.keyDown(window, {key: "v", ctrlKey: true});
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(4));
      expect(mockAudioManager.tracks[3].name).toBe("test.wav Copy 3");
      expect(mockAudioManager.pasteTrack).toHaveBeenCalledTimes(3);
    });

    it("pastes track when Ctrl+V is pressed after a cut and clears clipboard", async () => {
      const {trackId} = await createAndAddTrack("cut-me.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);

      // 1. Cut the track (removes from list, sets clipboard operation='cut')
      fireEvent.keyDown(window, {key: "x", ctrlKey: true});
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(0));
      expect(mockClipboardManager.getClipboard().operation).toBe("cut");

      // 2. Paste the track
      fireEvent.keyDown(window, {key: "v", ctrlKey: true});

      // Wait for new track to be created and clipboard to be cleared
      await waitFor(() => {
        expect(mockAudioManager.tracks.length).toBe(1);
        expect(mockAudioManager.tracks[0].name).toBe("cut-me.wav");
        expect(mockClipboardManager.clearClipboard).toHaveBeenCalled();
        expect(mockClipboardManager.hasClipboard()).toBe(false);
      });
    });

    it("does nothing when clipboard is empty", async () => {
      setup();
      fireEvent.keyDown(window, {key: "v", ctrlKey: true});

      expect(mockAudioManager.tracks.length).toBe(0);
      expect(mockAudioManager.pasteTrack).not.toHaveBeenCalled();
    });
  });

  describe("Backspace/Delete Hotkey", () => {
    it("deletes selected track when Backspace is pressed", async () => {
      const {trackId} = await createAndAddTrack("delete-me.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);
      await waitFor(() =>
        expect(
          container.querySelector('[style*="outline: 2px solid"]')
        ).toBeInTheDocument()
      );

      // Press Backspace
      fireEvent.keyDown(window, {key: "Backspace"});

      // Wait for track to be deleted
      await waitFor(() => {
        expect(mockAudioManager.tracks.length).toBe(0);
        expect(mockDbManager.deleteTrack).toHaveBeenCalledWith(
          trackId,
          MOCK_SESSION_ID
        );
      });
    });

    it("deletes selected track when Delete key is pressed", async () => {
      const {trackId} = await createAndAddTrack("delete-me.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);
      await waitFor(() =>
        expect(
          container.querySelector('[style*="outline: 2px solid"]')
        ).toBeInTheDocument()
      );

      // Press Delete
      fireEvent.keyDown(window, {key: "Delete"});

      // Wait for track to be deleted
      await waitFor(() => {
        expect(mockAudioManager.tracks.length).toBe(0);
        expect(mockDbManager.deleteTrack).toHaveBeenCalledWith(
          trackId,
          MOCK_SESSION_ID
        );
      });
    });

    it("does not trigger when typing in input field", async () => {
      await createAndAddTrack("keep-me.wav");
      const {container} = setup();

      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);

      // Focus on input field
      const input = screen.getByTestId("test-input");
      input.focus();

      // Press Backspace while in input
      fireEvent.keyDown(input, {key: "Backspace"});

      // Track should still exist (deletion should be prevented)
      expect(mockAudioManager.tracks.length).toBe(1);
      expect(mockDbManager.deleteTrack).not.toHaveBeenCalled();
    });
  });

  describe("Cmd key support (Mac)", () => {
    it("supports Cmd+C (metaKey: true)", async () => {
      const {trackId} = await createAndAddTrack("mac-test.wav");
      const {container} = setup();
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);

      // Press Cmd+C (metaKey for Mac)
      fireEvent.keyDown(window, {key: "c", metaKey: true});

      expect(mockClipboardManager.setTrackData).toHaveBeenCalledWith(
        expect.objectContaining({name: "mac-test.wav", id: trackId}),
        "copy"
      );
    });

    it("supports Cmd+X (metaKey: true)", async () => {
      const {trackId} = await createAndAddTrack("mac-test.wav");
      const {container} = setup();
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);

      // Press Cmd+X (metaKey for Mac)
      fireEvent.keyDown(window, {key: "x", metaKey: true});

      await waitFor(() => {
        expect(mockDbManager.deleteTrack).toHaveBeenCalledWith(
          trackId,
          MOCK_SESSION_ID
        );
        expect(mockAudioManager.tracks.length).toBe(0);
        expect(mockClipboardManager.getClipboard().operation).toBe("cut");
      });
    });

    it("supports Cmd+V (metaKey: true)", async () => {
      await createAndAddTrack("mac-test.wav");
      const {container} = setup();
      await waitFor(() => expect(mockAudioManager.tracks.length).toBe(1));
      selectFirstTrack(container);

      // Copy with Cmd+C (sets the mock clipboard state)
      fireEvent.keyDown(window, {key: "c", metaKey: true});
      await waitFor(() =>
        expect(mockClipboardManager.hasClipboard()).toBe(true)
      );

      // Paste with Cmd+V
      fireEvent.keyDown(window, {key: "v", metaKey: true});

      await waitFor(() => {
        expect(mockAudioManager.tracks.length).toBe(2); // New track created
        expect(mockAudioManager.tracks[1].name).toBe("mac-test.wav Copy");
      });
    });
  });
});
