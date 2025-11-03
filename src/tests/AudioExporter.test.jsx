import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import AudioExporter from "../components/AudioExport/AudioExporter";

// Mock ExportManager completely
jest.mock("../components/AudioExport/ExportManager", () => {
  return jest.fn().mockImplementation(() => {
    return {
      exportAudio: jest
        .fn()
        .mockResolvedValue({ success: true, format: "mp3" }),
      exportWav: jest.fn().mockResolvedValue({ success: true, format: "wav" }),
      exportMp3: jest.fn().mockResolvedValue({ success: true, format: "mp3" }),
      isBackendAvailable: jest.fn().mockResolvedValue(true),
    };
  });
});

// Mock PythonApiClient completely
jest.mock("../backend/PythonApiClient", () => {
  return jest.fn().mockImplementation(() => {
    return {
      downloadBlob: jest.fn(),
      exportAudio: jest
        .fn()
        .mockResolvedValue(new Blob(["mock"], { type: "audio/mp3" })),
      healthCheck: jest.fn().mockResolvedValue(true),
    };
  });
});

// Import after mocking
import ExportManager from "../components/AudioExport/ExportManager";

describe("AudioExporter", () => {
  let mockAudioBuffer;
  let mockOnExportComplete;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock audio buffer
    mockAudioBuffer = {
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 100,
      getChannelData: jest.fn((channel) => new Float32Array(100).fill(0.5)),
    };

    mockOnExportComplete = jest.fn();
  });

  it("renders the form correctly", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    expect(screen.getByText(/Export Audio Settings/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Output Format/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filename/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Export Audio/i }),
    ).toBeInTheDocument();
  });

  it("handles WAV export successfully", async () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    // Change format to WAV
    fireEvent.change(screen.getByLabelText(/Output Format/i), {
      target: { value: "wav" },
    });

    // Click export button
    fireEvent.click(screen.getByRole("button", { name: /Export Audio/i }));

    // Wait for export to complete
    await waitFor(() => {
      expect(mockOnExportComplete).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });

  it("handles MP3 export successfully", async () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    // Default format is MP3
    fireEvent.click(screen.getByRole("button", { name: /Export Audio/i }));

    // Wait for export to complete
    await waitFor(() => {
      expect(mockOnExportComplete).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });

  it("shows an error if audio buffer is missing", async () => {
    render(
      <AudioExporter
        audioBuffer={null}
        onExportComplete={mockOnExportComplete}
      />,
    );

    // Click export button
    fireEvent.click(screen.getByRole("button", { name: /Export Audio/i }));

    // Wait for error message
    await waitFor(() => {
      expect(
        screen.getByText(
          /Error: Please load or generate an audio track before exporting/i,
        ),
      ).toBeInTheDocument();
    });

    // Verify callback was not called
    expect(mockOnExportComplete).not.toHaveBeenCalled();
  });

  it("displays error when export fails", async () => {
    // Create a new mock instance that throws an error
    ExportManager.mockImplementationOnce(() => ({
      exportAudio: jest.fn().mockRejectedValue(new Error("Export failed")),
    }));

    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    // Click export button
    fireEvent.click(screen.getByRole("button", { name: /Export Audio/i }));

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/Error: Export failed/i)).toBeInTheDocument();
    });

    // Verify callback was not called
    expect(mockOnExportComplete).not.toHaveBeenCalled();
  });

  it("updates filename extension when format changes", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    const formatSelect = screen.getByLabelText(/Output Format/i);
    const filenameInput = screen.getByLabelText(/Filename/i);

    // Initial format is MP3
    expect(filenameInput.value).toContain(".mp3");

    // Change to WAV
    fireEvent.change(formatSelect, { target: { value: "wav" } });
    expect(filenameInput.value).toContain(".wav");

    // Change to OGG
    fireEvent.change(formatSelect, { target: { value: "ogg" } });
    expect(filenameInput.value).toContain(".ogg");
  });

  it("shows bitrate selector only for MP3 format", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    const formatSelect = screen.getByLabelText(/Output Format/i);

    // MP3 format - bitrate should be visible
    expect(screen.getByLabelText(/MP3 Bitrate/i)).toBeInTheDocument();

    // Change to WAV - bitrate should disappear
    fireEvent.change(formatSelect, { target: { value: "wav" } });
    expect(screen.queryByLabelText(/MP3 Bitrate/i)).not.toBeInTheDocument();

    // Change back to MP3 - bitrate should reappear
    fireEvent.change(formatSelect, { target: { value: "mp3" } });
    expect(screen.getByLabelText(/MP3 Bitrate/i)).toBeInTheDocument();
  });

  it("disables export button while exporting", async () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    const exportButton = screen.getByRole("button", { name: /Export Audio/i });

    // Initially enabled
    expect(exportButton).not.toBeDisabled();

    // Click export
    fireEvent.click(exportButton);

    // Should be disabled immediately (before async completes)
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveTextContent(/Processing/i);

    // Wait for export to complete
    await waitFor(() => {
      expect(exportButton).not.toBeDisabled();
      expect(exportButton).toHaveTextContent(/Export Audio/i);
    });
  });

  it("allows changing bitrate for MP3", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    const bitrateSelect = screen.getByLabelText(/MP3 Bitrate/i);

    // Default is 320k
    expect(bitrateSelect.value).toBe("320k");

    // Change to 128k
    fireEvent.change(bitrateSelect, { target: { value: "128k" } });
    expect(bitrateSelect.value).toBe("128k");

    // Change to 192k
    fireEvent.change(bitrateSelect, { target: { value: "192k" } });
    expect(bitrateSelect.value).toBe("192k");
  });

  it("allows custom filename", () => {
    render(
      <AudioExporter
        audioBuffer={mockAudioBuffer}
        onExportComplete={mockOnExportComplete}
      />,
    );

    const filenameInput = screen.getByLabelText(/Filename/i);

    // Change filename
    fireEvent.change(filenameInput, {
      target: { value: "my-custom-song.mp3" },
    });

    expect(filenameInput.value).toBe("my-custom-song.mp3");
  });
});
