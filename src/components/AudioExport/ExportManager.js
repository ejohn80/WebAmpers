/**
 * ExportManager handles exporting audio in different formats
 * Coordinates between Tone.js (browser) and Python backend
 */
import * as Tone from "tone";
import PythonApiClient from "../../backend/PythonApiClient";

class ExportManager {
  constructor() {
    this.pythonApi = new PythonApiClient();
  }

  /**
   * Helper function to write a string into a DataView (used for WAV header)
   */
  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Convert Tone.js buffer to WAV file (browser-side)
   * @param {Tone.ToneAudioBuffer} buffer - Audio buffer
   * @param {string} filename - Output filename
   * @returns {File} - WAV file
   */
  bufferToWavFile(buffer, filename = "audio.wav") {
    // This method handles the creation of the Blob and wrapping it in a File
    const wavBlob = this.createWavBlob(buffer);

    return new File([wavBlob], filename, {type: "audio/wav"});
  }

  /**
   * Create WAV blob from a Tone.ToneAudioBuffer (Browser-side export)
   * This logic was moved from AudioPage.jsx to the dedicated manager.
   * @param {Tone.ToneAudioBuffer} toneBuffer - The Tone.js audio buffer.
   * @returns {Blob} - WAV blob
   */
  createWavBlob(toneBuffer) {
    const buffer = toneBuffer.get(); // Get the raw AudioBuffer
    const numOfChan = buffer.numberOfChannels;
    const len = buffer.length;
    const channels = [];
    let l = len * numOfChan * 2 + 44; // Total length of the WAV file
    let offset = 0;
    let bufferArray = new ArrayBuffer(l);
    let view = new DataView(bufferArray);
    let sampleRate = buffer.sampleRate;

    for (let i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }

    // Write WAV file headers
    this._writeString(view, offset, "RIFF");
    offset += 4;
    view.setUint32(offset, l - 8, true);
    offset += 4;
    this._writeString(view, offset, "WAVE");
    offset += 4;
    this._writeString(view, offset, "fmt ");
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4; // Sub-chunk size
    view.setUint16(offset, 1, true);
    offset += 2; // Audio Format (1 = PCM)
    view.setUint16(offset, numOfChan, true);
    offset += 2; // Number of Channels
    view.setUint32(offset, sampleRate, true);
    offset += 4; // Sample Rate
    view.setUint32(offset, sampleRate * numOfChan * 2, true);
    offset += 4; // Byte Rate
    view.setUint16(offset, numOfChan * 2, true);
    offset += 2; // Block Align
    view.setUint16(offset, 16, true);
    offset += 2; // Bits Per Sample (16-bit)
    this._writeString(view, offset, "data");
    offset += 4;
    view.setUint32(offset, l - offset - 4, true);
    offset += 4; // Data size

    // Write audio data (interleaved 16-bit PCM)
    let index = 0;
    const maxVal = 32767; // Max value for 16-bit
    while (index < len) {
      for (let i = 0; i < numOfChan; i++) {
        // Convert Float32 data (-1.0 to 1.0) to 16-bit integer
        let s = Math.max(-1, Math.min(1, channels[i][index]));
        view.setInt16(offset, s * maxVal, true);
        offset += 2;
      }
      index++;
    }

    return new Blob([bufferArray], {type: "audio/wav"});
  }

  /**
   * Export audio buffer to the selected format.
   * @param {Tone.ToneAudioBuffer} buffer - The audio buffer to export.
   * @param {Object} options - Export options (format, filename, bitrate).
   * @returns {Promise<Object>} - Export result.
   */
  async exportAudio(buffer, options = {}) {
    const format = options.format || "mp3";
    const filename = options.filename || `export.${format}`;

    switch (format) {
      case "wav": {
        // Browser-side WAV export
        const wavBlob = this.createWavBlob(buffer);

        // Download the file in the browser
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return {success: true, format: "wav"};
      }

      case "mp3":
      case "ogg": {
        // For MP3/OGG, use the Python backend, which requires a WAV file first.
        const wavFile = this.bufferToWavFile(buffer, "temp.wav");

        const resultBlob = await this.pythonApi.exportAudio(wavFile, {
          format: format,
          sampleRate: buffer.sampleRate,
          bitrate: options.bitrate, // Pass bitrate for MP3
        });
        this.pythonApi.downloadBlob(resultBlob, filename);
        return {success: true, format};
      }

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Merge multiple Tone.js buffers and export
   * @param {Tone.ToneAudioBuffer[]} buffers - Array of buffers to merge
   * @param {Object} options - Export options
   * @returns {Promise<Object>} - Export result
   */
  async mergeAndExport(buffers, options = {}) {
    try {
      if (buffers.length < 2) {
        throw new Error("Need at least 2 buffers to merge");
      }
      const wavFiles = buffers.map((buffer, index) =>
        this.bufferToWavFile(buffer, `temp_${index}.wav`)
      );

      // Merge via Python backend
      const format = options.format || "mp3";
      const mergedBlob = await this.pythonApi.mergeFiles(wavFiles, format);

      const filename = options.filename || `merged.${format}`;
      this.pythonApi.downloadBlob(mergedBlob, filename);

      return {success: true, format};
    } catch (error) {
      throw new Error(`Merge and export failed: ${error.message}`);
    }
  }
}

export default ExportManager;
