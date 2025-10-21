import * as Tone from 'tone';

/**
 * Handles file uploads and conversions to Tone.js audio buffers
 */
class AudioImporter {
  constructor() {
    this.supportedFormats = ['audio/wav', 'audio/mp3'];
  }

  /**
   * Validates if the file type is supported
   * @param {File} file - the file to validate
   * @returns {boolean} - whether the file is valid
   * @throws {Error} - if the given file is invalid
   */
  validateFile(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!this.supportedFormats.includes(file.type)) {
      throw new Error(`Unsupported file format: ${file.type}`);
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

    try {
      const arrayBuffer = await this.fileToArrayBuffer(file);
      const toneBuffer = await this.decodeAudioData(arrayBuffer);
      const metadata = this.extractMetadata(file, toneBuffer);

      return {
        buffer: toneBuffer,
        metadata: metadata,
        originalFile: file
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
    const fileReader = new FileReader();
    const result = await new Promise((resolve, reject) => {
      fileReader.onload = (e) => resolve(e.target.result);
      fileReader.onerror = () => reject(new Error('Failed to read file'));
      fileReader.readAsArrayBuffer(file);
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
      const audioBuffer = await Tone.context.rawContext.decodeAudioData(arrayBuffer);
      const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
      return toneBuffer;
    } catch (error) {
      throw new Error('Failed to decode audio data');
    }
  }

  /**
   * Extracts metadata from the file and buffer
   * @param {File} file - original file
   * @param {Tone.ToneAudioBuffer} buffer - decoded buffer
   * @returns {Object} - metadata object
   */
  extractMetadata(file, buffer) {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate
    };
  }
}

export default AudioImporter;