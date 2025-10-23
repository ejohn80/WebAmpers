import * as Tone from "tone";

/**
 * Handles file uploads and conversions to Tone.js audio buffers
 */
class AudioImporter {
  constructor() {
    this.supportedFormats = ["audio/wav", "audio/mp3", "audio/mpeg"]; // Added 'audio/mpeg' for broader mp3 support
  }

  /**
   * Validates if the file type is supported
   * @param {File} file - the file to validate
   * @returns {boolean} - whether the file is valid
   * @throws {Error} - if the given file is invalid
   */
  validateFile(file) {
    if (!file) {
      throw new Error("No file provided");
    }

    if (!this.supportedFormats.includes(file.type)) {
      throw new Error(
        `Unsupported file format: ${file.type}. Only .wav and .mp3 are supported.`,
      );
    }

    return true;
  }

  /**
   * Imports an audio file and converts it to an audio buffer
   * @param {File} file - the audio file to import
   * @returns {Object} - object containing buffer and metadata
   * @throws {Error} - if any part of the import process fails
   */
  async importFile(file) {
    this.validateFile(file);

    // // Ensure Tone.js AudioContext is running, as it's required for decoding.
    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    try {
      const arrayBuffer = await this.fileToArrayBuffer(file);
      const toneBuffer = await this.decodeAudioData(arrayBuffer);
      const metadata = this.extractMetadata(file, toneBuffer);

      return {
        buffer: toneBuffer,
        metadata: metadata,
        originalFile: file,
      };
    } catch (error) {
      throw new Error(`Failed to import audio file: ${error.message}`);
    }
  }

  /**
   * Converts the given file to ArrayBuffer
   * @param {File} file - the file to convert
   * @returns {ArrayBuffer} - promise that resolves to an ArrayBuffer
   * @throws {Error} - if the file could not be read
   */
  async fileToArrayBuffer(file) {
    const reader = new FileReader();
    const result = await new Promise((resolve, reject) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });

    return result;
  }

  /**
   * Decodes audio data into an audio buffer
   * @param {ArrayBuffer} arrayBuffer - provided audio data
   * @returns {Tone.ToneAudioBuffer} -
   * @throws {Error} - if the audio could not be decoded
   */
  async decodeAudioData(arrayBuffer) {
    try {
      const audioBuffer =
        await Tone.context.rawContext.decodeAudioData(arrayBuffer);
      const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
      return toneBuffer;
    } catch {
      throw new Error("Failed to decode audio data");
    }
  }

  /**
   * Extracts metadata from the file and buffer
   * @param {File} file - original file
   * @param {Tone.ToneAudioBuffer} buffer - decoded buffer
   * @returns {Object} - metadata object
   */
  extractMetadata(file, buffer) {
    const formatDuration = (seconds) => {
      const min = Math.floor(seconds / 60);
      const sec = (seconds % 60).toFixed(2);
      return `${min}m ${sec}s`;
    };

    return {
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      type: file.type,
      duration: formatDuration(buffer.duration),
      sampleRate: buffer.sampleRate + " Hz",
      numberOfChannels: buffer.numberOfChannels,
      uploadedAt: new Date().toISOString(),
    };
  }
}

export default AudioImporter;
