// /**
//  * ExportManager handles exporting audio in different formats
//  * Coordinates between Tone.js (browser) and Python backend
//  */
// import * as Tone from "tone";
// import PythonApiClient from "../../backend/PythonApiClient";

// class ExportManager {
//   constructor() {
//     this.pythonApi = new PythonApiClient();
//   }

//   /**
//    * Convert Tone.js buffer to WAV file (browser-side)
//    * @param {Tone.ToneAudioBuffer} buffer - Audio buffer
//    * @param {string} filename - Output filename
//    * @returns {File} - WAV file
//    */
//   bufferToWavFile(buffer, filename = "audio.wav") {
//     // Get audio data
//     const channelData = [];
//     for (let i = 0; i < buffer.numberOfChannels; i++) {
//       channelData.push(buffer.getChannelData(i));
//     }

//     // Create WAV file
//     const wavBlob = this.createWavBlob(channelData, buffer.sampleRate);

//     return new File([wavBlob], filename, { type: "audio/wav" });
//   }

//   /**
//    * Create WAV blob from audio data
//    * @param {Float32Array[]} channels - Audio channel data
//    * @param {number} sampleRate - Sample rate
//    * @returns {Blob} - WAV blob
//    */
//   createWavBlob(channels, sampleRate) {
//     const numChannels = channels.length;
//     const length = channels[0].length;

//     // WAV file format specs
//     const bytesPerSample = 2;
//     const blockAlign = numChannels * bytesPerSample;
//     const byteRate = sampleRate * blockAlign;
//     const dataSize = length * blockAlign;

//     const buffer = new ArrayBuffer(44 + dataSize);
//     const view = new DataView(buffer);

//     // RIFF chunk descriptor
//     this.writeString(view, 0, "RIFF");
//     view.setUint32(4, 36 + dataSize, true);
//     this.writeString(view, 8, "WAVE");

//     // fmt sub-chunk
//     this.writeString(view, 12, "fmt ");
//     view.setUint32(16, 16, true); // fmt chunk size
//     view.setUint16(20, 1, true); // audio format (1 = PCM)
//     view.setUint16(22, numChannels, true);
//     view.setUint32(24, sampleRate, true);
//     view.setUint32(28, byteRate, true);
//     view.setUint16(32, blockAlign, true);
//     view.setUint16(34, bytesPerSample * 8, true); // bits per sample

//     // data sub-chunk
//     this.writeString(view, 36, "data");
//     view.setUint32(40, dataSize, true);

//     // Write audio data
//     let offset = 44;
//     for (let i = 0; i < length; i++) {
//       for (let channel = 0; channel < numChannels; channel++) {
//         const sample = Math.max(-1, Math.min(1, channels[channel][i]));
//         const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
//         view.setInt16(offset, int16, true);
//         offset += 2;
//       }
//     }

//     return new Blob([buffer], { type: "audio/wav" });
//   }

//   /**
//    * Helper to write string to DataView
//    * @param {DataView} view - DataView to write to
//    * @param {number} offset - Offset position
//    * @param {string} string - String to write
//    */
//   writeString(view, offset, string) {
//     for (let i = 0; i < string.length; i++) {
//       view.setUint8(offset + i, string.charCodeAt(i));
//     }
//   }

//   /**
//    * Export audio as WAV (browser-side, no backend needed)
//    * @param {Tone.ToneAudioBuffer} buffer - Audio buffer
//    * @param {string} filename - Download filename
//    */
//   async exportWav(buffer, filename = "audio.wav") {
//     try {
//       const wavFile = this.bufferToWavFile(buffer, filename);
//       this.pythonApi.downloadBlob(wavFile, filename);
//       return { success: true, format: "wav" };
//     } catch (error) {
//       throw new Error(`WAV export failed: ${error.message}`);
//     }
//   }

//   /**
//    * Export audio as MP3 (requires Python backend)
//    * @param {Tone.ToneAudioBuffer} buffer - Audio buffer
//    * @param {string} filename - Download filename
//    * @param {string} bitrate - MP3 bitrate (e.g., '192k')
//    */
//   async exportMp3(buffer, filename = "audio.mp3", bitrate = "192k") {
//     try {
//       const wavFile = this.bufferToWavFile(buffer, "temp.wav");
//       // Send to Python backend for MP3 conversion
//       const mp3Blob = await this.pythonApi.exportAudio(wavFile, {
//         format: "mp3",
//         bitrate: bitrate,
//         sampleRate: buffer.sampleRate,
//       });

//       this.pythonApi.downloadBlob(mp3Blob, filename);
//       return { success: true, format: "mp3" };
//     } catch (error) {
//       throw new Error(`MP3 export failed: ${error.message}`);
//     }
//   }

//   /**
//    * Export audio in any format
//    * @param {Tone.ToneAudioBuffer} buffer - Audio buffer
//    * @param {Object} options - Export options
//    * @param {string} options.format - Format (wav, mp3, ogg)
//    * @param {string} options.filename - Filename
//    * @param {string} options.bitrate - Bitrate for compressed formats
//    * @returns {Promise<Object>} - Export result
//    */
//   async exportAudio(buffer, options = {}) {
//     const {
//       format = "mp3",
//       filename = `audio.${format}`,
//       bitrate = "192k",
//     } = options;

//     switch (format.toLowerCase()) {
//       case "wav":
//         return await this.exportWav(buffer, filename);

//       case "mp3":
//         return await this.exportMp3(buffer, filename, bitrate);

//       case "ogg": {
//         const wavFile = this.bufferToWavFile(buffer, "temp.wav");
//         const oggBlob = await this.pythonApi.exportAudio(wavFile, {
//           format: "ogg",
//           sampleRate: buffer.sampleRate,
//         });
//         this.pythonApi.downloadBlob(oggBlob, filename);
//         return { success: true, format: "ogg" };
//       }

//       default:
//         throw new Error(`Unsupported format: ${format}`);
//     }
//   }

//   /**
//    * Merge multiple Tone.js buffers and export
//    * @param {Tone.ToneAudioBuffer[]} buffers - Array of buffers to merge
//    * @param {Object} options - Export options
//    * @returns {Promise<Object>} - Export result
//    */
//   async mergeAndExport(buffers, options = {}) {
//     try {
//       if (buffers.length < 2) {
//         throw new Error("Need at least 2 buffers to merge");
//       }
//       const wavFiles = buffers.map((buffer, index) =>
//         this.bufferToWavFile(buffer, `temp_${index}.wav`),
//       );

//       // Merge via Python backend
//       const format = options.format || "mp3";
//       const mergedBlob = await this.pythonApi.mergeFiles(wavFiles, format);

//       const filename = options.filename || `merged.${format}`;
//       this.pythonApi.downloadBlob(mergedBlob, filename);

//       return { success: true, format };
//     } catch (error) {
//       throw new Error(`Merge and export failed: ${error.message}`);
//     }
//   }

//   /**
//    * Check if Python backend is available
//    * @returns {Promise<boolean>} - Backend availability
//    */
//   async isBackendAvailable() {
//     return await this.pythonApi.healthCheck();
//   }
// }

// const bufferToWave = (buffer, len) => {
//     const numOfChan = buffer.numberOfChannels;
//     const channels = [];
//     let l = len * numOfChan * 2 + 44;
//     let offset = 0;
//     let bufferArray = new ArrayBuffer(l);
//     let view = new DataView(bufferArray);
//     let sampleRate = buffer.sampleRate;

//     function writeString(view, offset, string) {
//         for (let i = 0; i < string.length; i++) {
//             view.setUint8(offset + i, string.charCodeAt(i));
//         }
//     }

//     for (let i = 0; i < numOfChan; i++) {
//         channels.push(buffer.getChannelData(i));
//     }

//     // Write WAV file headers
//     writeString(view, offset, 'RIFF'); offset += 4;
//     view.setUint32(offset, l - 8, true); offset += 4;
//     writeString(view, offset, 'WAVE'); offset += 4;
//     writeString(view, offset, 'fmt '); offset += 4;
//     view.setUint32(offset, 16, true); offset += 4; // Sub-chunk size
//     view.setUint16(offset, 1, true); offset += 2; // Audio Format (1 = PCM)
//     view.setUint16(offset, numOfChan, true); offset += 2; // Number of Channels
//     view.setUint32(offset, sampleRate, true); offset += 4; // Sample Rate
//     view.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4; // Byte Rate
//     view.setUint16(offset, numOfChan * 2, true); offset += 2; // Block Align
//     view.setUint16(offset, 16, true); offset += 2; // Bits Per Sample (16-bit)
//     writeString(view, offset, 'data'); offset += 4;
//     view.setUint32(offset, l - offset - 4, true); offset += 4; // Data size

//     // Write audio data (interleaved 16-bit PCM)
//     let index = 0;
//     const maxVal = 32767; // Max value for 16-bit
//     while (index < len) {
//         for (let i = 0; i < numOfChan; i++) {
//             // Convert Float32 data (-1.0 to 1.0) to 16-bit integer
//             let s = Math.max(-1, Math.min(1, channels[i][index]));
//             view.setInt16(offset, s * maxVal, true);
//             offset += 2;
//         }
//         index++;
//     }

//     return new Blob([bufferArray], { type: 'audio/wav' });
// };

// export default ExportManager;

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
