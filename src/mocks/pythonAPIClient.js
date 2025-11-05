/**
 * PythonApiClient.js
 *
 * This is a mock/placeholder class designed to interface with a Python backend
 * for heavy-duty tasks like MP3/OGG conversion and file merging.
 *
 * This mock implementation ensures the application compiles and allows the
 * ExportManager to be tested without needing a live backend connection.
 */

export default class PythonApiClient {
  constructor() {
    // Log initialization for debugging purposes
    console.log("PythonApiClient initialized (MOCK).");
    this.isHealthy = true; // Assume healthy for mock purposes
  }

  /**
   * Mocks the process of sending a WAV file to the backend for conversion.
   * @param {File} wavFile - The audio file to convert.
   * @param {Object} options - Conversion parameters (format, bitrate, sampleRate).
   * @returns {Promise<Blob>} - A promise that resolves with a mock resulting Blob.
   */
  async exportAudio(wavFile, options) {
    console.log(
      `MOCK API: Received request to convert ${wavFile.name} to ${options.format}.`
    );

    if (!this.isHealthy) {
      throw new Error("Python backend is currently unavailable.");
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Return a mock Blob representing the converted file
    return new Blob([`Mock ${options.format} data for ${wavFile.name}`], {
      type: `audio/${options.format}`,
    });
  }

  /**
   * Mocks the process of merging multiple WAV files on the backend.
   * @param {File[]} wavFiles - Array of WAV files to merge.
   * @param {string} format - The desired output format (e.g., 'mp3').
   * @returns {Promise<Blob>} - A promise that resolves with a mock merged Blob.
   */
  async mergeFiles(wavFiles, format) {
    console.log(`MOCK API: Merging ${wavFiles.length} files into ${format}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return new Blob([`Mock merged ${format} data`], {
      type: `audio/${format}`,
    });
  }

  /**
   * Mocks triggering the file download mechanism via the browser.
   * @param {Blob} blob - The file content to download.
   * @param {string} filename - The name of the file.
   */
  downloadBlob(blob, filename) {
    // In a real browser environment, this triggers a download.
    // For testing, we just log it.
    console.log(
      `MOCK API: Triggered browser download for: ${filename} (${blob.type})`
    );
  }

  /**
   * Mocks a health check for the backend service.
   * @returns {Promise<boolean>} - True if the backend is available.
   */
  async healthCheck() {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this.isHealthy;
  }
}
