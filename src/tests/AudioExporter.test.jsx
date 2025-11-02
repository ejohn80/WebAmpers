// import React from 'react';
// import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'; // Import 'act'
// import '@testing-library/jest-dom';

// import AudioExporter from '../components/AudioExporter';
// import ExportManager from '../backend/ExportManager';
// import PythonApiClient from '../backend/PythonApiClient';
// import * as Tone from 'tone';

// // --- Global JSDOM Environment Mocks ---

// const mockFetch = jest.fn();
// global.fetch = mockFetch;

// // Mock URL.createObjectURL and URL.revokeObjectURL for browser-side downloads (WAV)
// const mockCreateObjectURL = jest.fn(() => 'blob:mockedurl');
// const mockRevokeObjectURL = jest.fn();

// if (typeof window.URL === 'undefined') {
//     window.URL = {};
// }
// window.URL.createObjectURL = mockCreateObjectURL;
// window.URL.revokeObjectURL = mockRevokeObjectURL;

// // --- Mock Tone.js and PythonApiClient Instances ---

// const mockAudioBuffer = {
//     numberOfChannels: 2,
//     sampleRate: 44100,
//     length: 100,
//     // Provide a mocked getChannelData that returns some data
//     getChannelData: (channel) => new Float32Array(100).fill(channel === 0 ? 0.5 : 0.6),
// };

// // Mock the global Tone object
// global.Tone = {
//     // Mock the ToneAudioBuffer constructor
//     ToneAudioBuffer: function() { return mockAudioBuffer; }
// };

// // Spy on the downloadBlob method (WAV/MP3/OGG)
// const mockDownloadBlob = jest.spyOn(PythonApiClient.prototype, 'downloadBlob').mockImplementation(() => {});

// // Spy on the exportAudio method which uses fetch (MP3/OGG backend call)
// const mockExportAudio = jest.spyOn(PythonApiClient.prototype, 'exportAudio');

// beforeEach(() => {
//     // Use modern fake timers for reliable async control
//     jest.useFakeTimers('modern');
//     jest.clearAllMocks();

//     // Reset mocks for successful backend export
//     mockExportAudio.mockResolvedValue(new Blob(['mock-data'], { type: 'application/octet-stream' }));

//     // Ensure ExportManager is instantiated (essential if it's a singleton)
//     new ExportManager();
// });

// afterEach(() => {
//     // Restore real timers after each test
//     jest.useRealTimers();
// });

// // --- Test Suite ---

// describe('AudioExporter', () => {

//     const mockOnExportComplete = jest.fn();

//     it('renders the form correctly', () => {
//         render(<AudioExporter audioBuffer={mockAudioBuffer} onExportComplete={mockOnExportComplete} />);

//         expect(screen.getByText(/Export Audio Settings/i)).toBeInTheDocument();
//         expect(screen.getByLabelText(/Output Format/i)).toBeInTheDocument();
//     });

//     it('handles WAV export (browser-side logic) and uses downloadBlob', async () => {
//         render(<AudioExporter audioBuffer={mockAudioBuffer} onExportComplete={mockOnExportComplete} />);

//         // 1. Wrap the entire async execution path (click, timers, promises) in act
//         await act(async () => {
//             // Select 'WAV' format
//             fireEvent.change(screen.getByLabelText(/Output Format/i), { target: { value: 'wav' } });

//             // Click the export button
//             fireEvent.click(screen.getByRole('button', { name: /Export Audio/i }));

//             // Flush all pending timers (e.g., Tone.Offline processing)
//             jest.runAllTimers();

//             // Flush all microtasks (all promise resolutions, including the final `finally` block with `setIsLoading(false)`)
//             await Promise.resolve();
//             await Promise.resolve(); // Double resolve for robustness
//         });

//         // 2. Assertions after the act block, ensuring all state updates and async logic are complete
//         expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
//         expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
//         expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);

//         // Check for success callback
//         expect(mockOnExportComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true, format: 'wav' }));

//         // Ensure the backend export mock was NOT called for WAV
//         expect(mockExportAudio).not.toHaveBeenCalled();
//     });

//     it('handles MP3 export (backend API logic) and uses exportAudio/downloadBlob', async () => {
//         render(<AudioExporter audioBuffer={mockAudioBuffer} onExportComplete={mockOnExportComplete} />);

//         // Default format is 'mp3'

//         // 1. Wrap the entire async execution path (click, timers, promises) in act
//         await act(async () => {
//             // Click the export button
//             fireEvent.click(screen.getByRole('button', { name: /Export Audio/i }));

//             // Flush all pending timers
//             jest.runAllTimers();

//             // Flush all microtasks (all promise resolutions, including the final `finally` block)
//             await Promise.resolve();
//             await Promise.resolve();
//         });

//         // 2. Assertions after the act block
//         // Check if the mock backend export function was called
//         expect(mockExportAudio).toHaveBeenCalledTimes(1);

//         // Check if the final download was triggered
//         expect(mockDownloadBlob).toHaveBeenCalledTimes(1);

//         // Check for success callback
//         expect(mockOnExportComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true, format: 'mp3' }));
//     });

//     it('shows an error if audio buffer is missing', async () => {
//         // Render with no audioBuffer prop
//         render(<AudioExporter onExportComplete={mockOnExportComplete} />);

//         // We still need to await the final UI change inside waitFor
//         await waitFor(async () => {
//             // 1. Click the export button
//             fireEvent.click(screen.getByRole('button', { name: /Export Audio/i }));
//         });

//         // 2. Wait for the error message to appear
//         await waitFor(() => {
//             expect(screen.getByText(/Error: Please load or generate an audio track before exporting./i)).toBeInTheDocument();
//             // Ensure no side effects occurred
//             expect(mockOnExportComplete).not.toHaveBeenCalled();
//         });
//     });
// });

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
