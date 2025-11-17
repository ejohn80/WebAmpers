/**
 * ExportManager - Mix and export multiple audio tracks
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
   * Mix multiple tracks into a single audio buffer
   * @param {Array} tracks - Array of track objects with segments
   * @param {number} totalLengthMs - Total length of the mix in milliseconds
   * @returns {AudioBuffer} - Mixed audio buffer
   */
  async mixTracks(tracks, totalLengthMs) {
    if (!tracks || tracks.length === 0) {
      throw new Error("No tracks to mix");
    }

    // Get the audio context
    const audioContext = Tone.context.rawContext;
    
    // Calculate total length in samples
    const sampleRate = audioContext.sampleRate;
    const totalLengthSec = totalLengthMs / 1000;
    const totalSamples = Math.ceil(totalLengthSec * sampleRate);

    // Create output buffer (stereo)
    const mixedBuffer = audioContext.createBuffer(2, totalSamples, sampleRate);
    const leftChannel = mixedBuffer.getChannelData(0);
    const rightChannel = mixedBuffer.getChannelData(1);

    // Process each track
    for (const track of tracks) {
      // Skip muted tracks
      if (track.mute) continue;

      // Check if any other track is soloed
      const anySolo = tracks.some(t => t.solo);
      // Skip non-soloed tracks if any track is soloed
      if (anySolo && !track.solo) continue;

      // Process each segment in the track
      for (const segment of track.segments || []) {
        try {
          // Get the audio buffer from the segment
          let sourceBuffer = segment.buffer;
          if (!sourceBuffer) continue;

          // Unwrap Tone.ToneAudioBuffer if needed
          if (sourceBuffer.get) {
            sourceBuffer = sourceBuffer.get();
          }
          if (sourceBuffer._buffer) {
            sourceBuffer = sourceBuffer._buffer;
          }

          // Calculate segment timing
          const startTimeMs = segment.startOnTimelineMs || 0;
          const startSample = Math.floor((startTimeMs / 1000) * sampleRate);
          const offsetMs = segment.startInFileMs || 0;
          const offsetSample = Math.floor((offsetMs / 1000) * sourceBuffer.sampleRate);
          const durationMs = segment.durationMs || (sourceBuffer.duration * 1000);
          const durationSamples = Math.floor((durationMs / 1000) * sourceBuffer.sampleRate);

          // Calculate track volume (convert dB to linear gain)
          const volumeDb = typeof track.volume === "number" ? track.volume : 0;
          const volumeGain = Math.pow(10, volumeDb / 20);

          // Calculate pan (-1 to 1)
          const pan = typeof track.pan === "number" ? track.pan : 0;
          const leftGain = volumeGain * (pan <= 0 ? 1 : 1 - pan);
          const rightGain = volumeGain * (pan >= 0 ? 1 : 1 + pan);

          // Mix the segment into the output buffer
          for (let i = 0; i < durationSamples; i++) {
            const outputIndex = startSample + i;
            if (outputIndex >= totalSamples) break;

            const sourceIndex = offsetSample + i;
            if (sourceIndex >= sourceBuffer.length) break;

            // Get source samples (handle mono/stereo)
            const leftSample = sourceBuffer.getChannelData(0)[sourceIndex] || 0;
            const rightSample = sourceBuffer.numberOfChannels > 1
              ? sourceBuffer.getChannelData(1)[sourceIndex]
              : leftSample;

            // Mix with gain and pan
            leftChannel[outputIndex] += leftSample * leftGain;
            rightChannel[outputIndex] += rightSample * rightGain;
          }
        } catch (error) {
          console.warn(`Failed to mix segment ${segment.id}:`, error);
        }
      }
    }

    // Normalize to prevent clipping
    let maxSample = 0;
    for (let i = 0; i < totalSamples; i++) {
      maxSample = Math.max(maxSample, Math.abs(leftChannel[i]), Math.abs(rightChannel[i]));
    }
    if (maxSample > 1) {
      const normalizeFactor = 0.95 / maxSample; // Leave some headroom
      for (let i = 0; i < totalSamples; i++) {
        leftChannel[i] *= normalizeFactor;
        rightChannel[i] *= normalizeFactor;
      }
    }

    return mixedBuffer;
  }

  /**
   * Create WAV blob from a native AudioBuffer
   */
  createWavBlob(audioBuffer) {
    const numOfChan = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const channels = [];
    let l = len * numOfChan * 2 + 44;
    let offset = 0;
    let bufferArray = new ArrayBuffer(l);
    let view = new DataView(bufferArray);
    let sampleRate = audioBuffer.sampleRate;

    for (let i = 0; i < numOfChan; i++) {
      channels.push(audioBuffer.getChannelData(i));
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
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, numOfChan, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * 2, true);
    offset += 4;
    view.setUint16(offset, numOfChan * 2, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    this._writeString(view, offset, "data");
    offset += 4;
    view.setUint32(offset, l - offset - 4, true);
    offset += 4;

    // Write audio data
    let index = 0;
    const maxVal = 32767;
    while (index < len) {
      for (let i = 0; i < numOfChan; i++) {
        let s = Math.max(-1, Math.min(1, channels[i][index]));
        view.setInt16(offset, s * maxVal, true);
        offset += 2;
      }
      index++;
    }

    return new Blob([bufferArray], { type: "audio/wav" });
  }

  /**
   * Export mixed audio from multiple tracks
   * @param {Array} tracks - Array of track objects
   * @param {number} totalLengthMs - Total length in milliseconds
   * @param {Object} options - Export options (format, filename, bitrate)
   */
  async exportAudio(tracks, totalLengthMs, options = {}) {
    const format = options.format || "mp3";
    const filename = options.filename || `export.${format}`;

    // Mix all tracks into a single buffer
    const mixedBuffer = await this.mixTracks(tracks, totalLengthMs);

    switch (format) {
      case "wav": {
        const wavBlob = this.createWavBlob(mixedBuffer);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true, format: "wav" };
      }

      case "mp3":
      case "ogg": {
        // Create WAV file first
        const wavBlob = this.createWavBlob(mixedBuffer);
        const wavFile = new File([wavBlob], "temp.wav", { type: "audio/wav" });

        // Send to Python backend for conversion
        const resultBlob = await this.pythonApi.exportAudio(wavFile, {
          format: format,
          sampleRate: mixedBuffer.sampleRate,
          bitrate: options.bitrate,
        });
        this.pythonApi.downloadBlob(resultBlob, filename);
        return { success: true, format };
      }

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

export default ExportManager;