/**
 * Client for communicating with Python backend API
 */
class PythonApiClient {
  constructor(baseUrl = null) {
    // Localhost in development, production URL otherwise
    if (!baseUrl) {
      const isDevelopment = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
      this.baseUrl = isDevelopment 
        ? "http://localhost:8080"
        : "https://webamp-backend-602045977933.us-central1.run.app";
    } else {
      this.baseUrl = baseUrl;
    }
  }

  /**
   * Convert audio file to different format
   * @param {File} file - Audio file to convert
   * @param {string} targetFormat - Target format (wav, mp3, ogg)
   * @returns {Promise<Blob>} - Converted audio file
   */
  async convertFormat(file, targetFormat) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target_format", targetFormat);

      const response = await fetch(`${this.baseUrl}/convert`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Conversion failed");
      }

      return await response.blob();
    } catch (error) {
      throw new Error(`Failed to convert file: ${error.message}`);
    }
  }

  /**
   * Merge multiple audio files
   * @param {File[]} files - Array of audio files to merge
   * @param {string} outputFormat - Output format (wav, mp3)
   * @returns {Promise<Blob>} - Merged audio file
   */
  async mergeFiles(files, outputFormat = "mp3") {
    try {
      if (files.length < 2) {
        throw new Error("At least 2 files required for merging");
      }

      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files[]", file);
      });
      formData.append("output_format", outputFormat);

      const response = await fetch(`${this.baseUrl}/merge`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Merge failed");
      }

      return await response.blob();
    } catch (error) {
      throw new Error(`Failed to merge files: ${error.message}`);
    }
  }

  /**
   * Export audio with specific settings
   * @param {File} file - Audio file to export
   * @param {Object} settings - Export settings
   * @param {string} settings.format - Output format
   * @param {string} settings.bitrate - Bitrate (e.g., '192k')
   * @param {number} settings.sampleRate - Sample rate (e.g., 44100)
   * @returns {Promise<Blob>} - Exported audio file
   */
  async exportAudio(file, settings = {}) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", settings.format || "mp3");

      if (settings.bitrate) {
        formData.append("bitrate", settings.bitrate);
      }
      if (settings.sampleRate) {
        formData.append("sample_rate", settings.sampleRate.toString());
      }

      const response = await fetch(`${this.baseUrl}/export`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Export failed");
      }

      return await response.blob();
    } catch (error) {
      throw new Error(`Failed to export file: ${error.message}`);
    }
  }

  /**
   * Get audio file metadata
   * @param {File} file - Audio file
   * @returns {Promise<Object>} - Audio metadata
   */
  async getMetadata(file) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${this.baseUrl}/metadata`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get metadata");
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  /**
   * Check if backend is healthy
   * @returns {Promise<boolean>} - Health status
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Download blob as file
   * @param {Blob} blob - File blob
   * @param {string} filename - Download filename
   */
  downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export default PythonApiClient;
