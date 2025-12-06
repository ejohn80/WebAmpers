import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {vi, describe, test, beforeEach, afterEach, expect} from "vitest";
import "@testing-library/jest-dom";

// --- Vitest Mocking Configuration ---

global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

// Mock document methods used for file download in JSDOM environment
const mockAnchorElement = {
  click: vi.fn(),
  download: "",
  href: "",
  style: {},
  parentNode: null,
  remove: vi.fn(),
};

// Store the original createElement before mocking
const originalCreateElement = document.createElement.bind(document);

// More selective mocking - only mock when creating anchor elements
const createElementSpy = vi.spyOn(document, "createElement");
createElementSpy.mockImplementation((tag) => {
  if (tag === "a") {
    return mockAnchorElement;
  }
  // Use original for everything else
  return originalCreateElement(tag);
});

// Mock appendChild/removeChild only for anchor elements
const originalAppendChild = document.body.appendChild.bind(document.body);
const originalRemoveChild = document.body.removeChild.bind(document.body);

vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
  if (node === mockAnchorElement) {
    return node;
  }
  return originalAppendChild(node);
});

vi.spyOn(document.body, "removeChild").mockImplementation((node) => {
  if (node === mockAnchorElement) {
    return node;
  }
  return originalRemoveChild(node);
});

// Create mock functions that we can access
const mockExportAudio = vi.fn();
const mockDownloadBlob = vi.fn();
const mockIsBackendAvailable = vi.fn().mockResolvedValue(true);
const mockBufferToWavFile = vi.fn();
const mockCreateWavBlob = vi.fn();

// Mock PythonApiClient
vi.mock("../../backend/PythonApiClient", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      exportAudio: vi
        .fn()
        .mockResolvedValue(new Blob(["mock"], {type: "audio/mp3"})),
      downloadBlob: mockDownloadBlob,
      healthCheck: vi.fn().mockResolvedValue(true),
    })),
  };
});

vi.mock("../components/AudioExport/ExportManager", () => {
  return {
    default: class MockExportManager {
      constructor() {
        this.exportAudio = mockExportAudio;
        this.isBackendAvailable = mockIsBackendAvailable;
        this.bufferToWavFile = mockBufferToWavFile;
        this.createWavBlob = mockCreateWavBlob;
      }
    },
  };
});

// Now import the component after mocks are set up
import AudioExporter from "../components/AudioExport/AudioExporter";

describe("AudioExporter", () => {
  let mockAudioBuffer;
  let mockOnExportComplete;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Reset mock implementations
    mockExportAudio.mockResolvedValue({success: true, format: "mp3"});
    mockBufferToWavFile.mockReturnValue(
      new File(["mock"], "temp.wav", {type: "audio/wav"})
    );
    mockCreateWavBlob.mockReturnValue(new Blob(["mock"], {type: "audio/wav"}));

    // Mock ToneAudioBuffer
    mockAudioBuffer = {
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 100,
      getChannelData: vi.fn((channel) => new Float32Array(100).fill(0.5)),
      get: vi.fn().mockReturnValue({
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 100,
        getChannelData: vi.fn((channel) => new Float32Array(100).fill(0.5)),
      }),
    };

    mockOnExportComplete = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  // ------------------------------------
  // ## Rendering and Input Tests
  // ------------------------------------

  test("renders the form correctly", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    expect(screen.getByText(/Export Audio Settings/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Output Format/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filename/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {name: /Export Audio/i})
    ).toBeInTheDocument();
  });

  test("updates filename extension when format changes", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    const formatSelect = screen.getByLabelText(/Output Format/i);
    const filenameInput = screen.getByLabelText(/Filename/i);

    // Initial format is MP3
    expect(filenameInput.value).toContain(".mp3");

    // Change to WAV
    fireEvent.change(formatSelect, {target: {value: "wav"}});
    expect(filenameInput.value).toContain(".wav");

    // Change to OGG
    fireEvent.change(formatSelect, {target: {value: "ogg"}});
    expect(filenameInput.value).toContain(".ogg");
  });

  test("shows bitrate selector only for MP3 format", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    const formatSelect = screen.getByLabelText(/Output Format/i);

    // MP3 format - bitrate should be visible
    expect(screen.getByLabelText(/MP3 Bitrate/i)).toBeInTheDocument();

    // Change to WAV - bitrate should disappear
    fireEvent.change(formatSelect, {target: {value: "wav"}});
    expect(screen.queryByLabelText(/MP3 Bitrate/i)).not.toBeInTheDocument();

    // Change back to MP3 - bitrate should reappear
    fireEvent.change(formatSelect, {target: {value: "mp3"}});
    expect(screen.getByLabelText(/MP3 Bitrate/i)).toBeInTheDocument();
  });

  test("allows changing bitrate for MP3", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    const bitrateSelect = screen.getByLabelText(/MP3 Bitrate/i);

    // Default is 320k
    expect(bitrateSelect.value).toBe("320k");

    // Change to 128k
    fireEvent.change(bitrateSelect, {target: {value: "128k"}});
    expect(bitrateSelect.value).toBe("128k");

    // Change to 192k
    fireEvent.change(bitrateSelect, {target: {value: "192k"}});
    expect(bitrateSelect.value).toBe("192k");
  });

  test("allows custom filename", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    const filenameInput = screen.getByLabelText(/Filename/i);

    // Change filename
    fireEvent.change(filenameInput, {
      target: {value: "my-custom-song.mp3"},
    });

    expect(filenameInput.value).toBe("my-custom-song.mp3");
  });

  // ------------------------------------
  // ## Export Logic Tests
  // ------------------------------------

  test("handles WAV export successfully", async () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    // Change format to WAV
    fireEvent.change(screen.getByLabelText(/Output Format/i), {
      target: {value: "wav"},
    });

    // Click export button
    fireEvent.click(screen.getByRole("button", {name: /Export Audio/i}));

    await waitFor(() => {
      // Verify that the mocked exportAudio was called with the 'wav' format
      expect(mockExportAudio).toHaveBeenCalledWith(
        mockAudioBuffer,
        expect.objectContaining({format: "wav"})
      );
      // Verify callback was called
      expect(mockOnExportComplete).toHaveBeenCalledWith(
        expect.objectContaining({success: true})
      );
    });
  });

  test("handles MP3 export successfully", async () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    // Default format is MP3
    fireEvent.click(screen.getByRole("button", {name: /Export Audio/i}));

    await waitFor(() => {
      // Verify that the mocked exportAudio was called with the 'mp3' format
      expect(mockExportAudio).toHaveBeenCalledWith(
        mockAudioBuffer,
        expect.objectContaining({format: "mp3", bitrate: "320k"})
      );
      // Verify callback was called
      expect(mockOnExportComplete).toHaveBeenCalledWith(
        expect.objectContaining({success: true})
      );
    });
  });

  test("shows an error if audio buffer is missing", async () => {
    render(
      <AudioExporter
        audioBuffer={null}
        onExportComplete={mockOnExportComplete}
      />
    );

    fireEvent.click(screen.getByRole("button", {name: /Export Audio/i}));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Error: Please load or generate an audio track before exporting/i
        )
      ).toBeInTheDocument();
    });

    expect(mockOnExportComplete).not.toHaveBeenCalled();
    expect(mockExportAudio).not.toHaveBeenCalled();
  });

  test("displays error when export fails", async () => {
    // Mock exportAudio to reject for this test
    mockExportAudio.mockRejectedValueOnce(new Error("Export failed"));

    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    // Click export button
    fireEvent.click(screen.getByRole("button", {name: /Export Audio/i}));

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/Error: Export failed/i)).toBeInTheDocument();
    });

    expect(mockOnExportComplete).not.toHaveBeenCalled();
  });

  test("disables export button while exporting", async () => {
    // Make the export take a bit longer so we can test the loading state
    let resolveExport;
    const exportPromise = new Promise((resolve) => {
      resolveExport = resolve;
    });
    mockExportAudio.mockReturnValue(exportPromise);

    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />
    );

    const exportButton = screen.getByRole("button", {name: /Export Audio/i});

    // Initially enabled
    expect(exportButton).not.toBeDisabled();

    // Click export
    fireEvent.click(exportButton);

    // Should be disabled immediately
    await waitFor(() => {
      expect(exportButton).toBeDisabled();
    });

    // Resolve the export
    resolveExport({success: true, format: "mp3"});

    // Wait for export to complete and button to be re-enabled
    await waitFor(() => {
      expect(exportButton).not.toBeDisabled();
      expect(exportButton).toHaveTextContent(/Export Audio/i);
    });
  });
});
