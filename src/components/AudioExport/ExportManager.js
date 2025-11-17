/**
 * ExportManager - Mix and export multiple tracks with master effects
 */
import * as Tone from "tone";
import PythonApiClient from "../../backend/PythonApiClient";

class ExportManager {
  constructor() {
    this.pythonApi = new PythonApiClient();
  }

  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Apply master effects to the mixed buffer
   */
  async applyMasterEffects(buffer, effects = {}) {
    if (!effects || Object.keys(effects).length === 0) {
      return buffer;
    }

    const audioContext = Tone.context.rawContext;
    
    // Calculate the correct length accounting for pitch shift
    let targetLength = buffer.length;
    let targetSampleRate = buffer.sampleRate;
    
    if (typeof effects.pitch === "number" && effects.pitch !== 0) {
      const semitones = effects.pitch;
      const rate = Math.pow(2, semitones / 12);
      // When pitch shifting, the duration changes
      targetLength = Math.floor(buffer.length / rate);
    }

    const offlineContext = new OfflineAudioContext(
      2, // Always output stereo
      targetLength,
      targetSampleRate
    );

    // Create source
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    let currentNode = source;

    // Apply pitch shift via playback rate
    if (typeof effects.pitch === "number" && effects.pitch !== 0) {
      const semitones = effects.pitch;
      const rate = Math.pow(2, semitones / 12);
      source.playbackRate.value = rate;
    }

    // Apply volume
    if (typeof effects.volume === "number" && effects.volume !== 100) {
      const gainNode = offlineContext.createGain();
      const linear = Math.max(0, Math.min(2, effects.volume / 100));
      gainNode.gain.value = linear;
      currentNode.connect(gainNode);
      currentNode = gainNode;
    }

    // Apply reverb with proper stereo handling
    if (typeof effects.reverb === "number" && effects.reverb > 0) {
      const convolver = offlineContext.createConvolver();
      const wetGain = offlineContext.createGain();
      const dryGain = offlineContext.createGain();
      
      const wet = Math.max(0, Math.min(1, effects.reverb / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;

      // Create STEREO impulse response
      const reverbTime = 2;
      const decay = 2;
      const impulseLength = offlineContext.sampleRate * reverbTime;
      const impulse = offlineContext.createBuffer(2, impulseLength, offlineContext.sampleRate);
      
      // Generate different impulse for each channel for stereo effect
      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < impulseLength; i++) {
          const random = (Math.random() * 2 - 1);
          const envelope = Math.pow(1 - i / impulseLength, decay);
          // Slightly different decay for each channel
          const stereoVariation = channel === 0 ? 1.0 : 0.95;
          channelData[i] = random * envelope * stereoVariation;
        }
      }
      
      convolver.buffer = impulse;

      // Create a splitter to handle stereo properly
      const splitter = offlineContext.createChannelSplitter(2);
      const merger = offlineContext.createChannelMerger(2);

      currentNode.connect(splitter);
      
      // Dry path - both channels
      splitter.connect(dryGain, 0);
      splitter.connect(dryGain, 1);
      
      // Wet path - both channels through convolver
      splitter.connect(convolver, 0);
      splitter.connect(convolver, 1);
      convolver.connect(wetGain);
      
      // Merge back to stereo
      dryGain.connect(merger, 0, 0);
      dryGain.connect(merger, 0, 1);
      wetGain.connect(merger, 0, 0);
      wetGain.connect(merger, 0, 1);
      
      currentNode = merger;
    }

    // Connect to destination
    currentNode.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    
    // Ensure output is stereo
    if (renderedBuffer.numberOfChannels === 1) {
      // Convert mono to stereo by duplicating the channel
      const stereoBuffer = audioContext.createBuffer(
        2,
        renderedBuffer.length,
        renderedBuffer.sampleRate
      );
      const monoData = renderedBuffer.getChannelData(0);
      stereoBuffer.copyToChannel(monoData, 0);
      stereoBuffer.copyToChannel(monoData, 1);
      return stereoBuffer;
    }
    
    return renderedBuffer;
  }

  /**
   * Mix multiple tracks into a single audio buffer
   */
  async mixTracks(tracks, totalLengthMs) {
    if (!tracks || tracks.length === 0) {
      throw new Error("No tracks to mix");
    }

    const audioContext = Tone.context.rawContext;
    const sampleRate = audioContext.sampleRate;
    const totalLengthSec = totalLengthMs / 1000;
    const totalSamples = Math.ceil(totalLengthSec * sampleRate);

    const mixedBuffer = audioContext.createBuffer(2, totalSamples, sampleRate);
    const leftChannel = mixedBuffer.getChannelData(0);
    const rightChannel = mixedBuffer.getChannelData(1);

    for (const track of tracks) {
      if (track.mute) continue;

      const anySolo = tracks.some(t => t.solo);
      if (anySolo && !track.solo) continue;

      for (const segment of track.segments || []) {
        try {
          let sourceBuffer = segment.buffer;
          if (!sourceBuffer) continue;

          if (sourceBuffer.get) {
            sourceBuffer = sourceBuffer.get();
          }
          if (sourceBuffer._buffer) {
            sourceBuffer = sourceBuffer._buffer;
          }

          const startTimeMs = segment.startOnTimelineMs || 0;
          const startSample = Math.floor((startTimeMs / 1000) * sampleRate);
          const offsetMs = segment.startInFileMs || 0;
          const offsetSample = Math.floor((offsetMs / 1000) * sourceBuffer.sampleRate);
          const durationMs = segment.durationMs || (sourceBuffer.duration * 1000);
          const durationSamples = Math.floor((durationMs / 1000) * sourceBuffer.sampleRate);

          const volumeDb = typeof track.volume === "number" ? track.volume : 0;
          const volumeGain = Math.pow(10, volumeDb / 20);

          const pan = typeof track.pan === "number" ? track.pan : 0;
          const leftGain = volumeGain * (pan <= 0 ? 1 : 1 - pan);
          const rightGain = volumeGain * (pan >= 0 ? 1 : 1 + pan);

          for (let i = 0; i < durationSamples; i++) {
            const outputIndex = startSample + i;
            if (outputIndex >= totalSamples) break;

            const sourceIndex = offsetSample + i;
            if (sourceIndex >= sourceBuffer.length) break;

            const leftSample = sourceBuffer.getChannelData(0)[sourceIndex] || 0;
            const rightSample = sourceBuffer.numberOfChannels > 1
              ? sourceBuffer.getChannelData(1)[sourceIndex]
              : leftSample;

            leftChannel[outputIndex] += leftSample * leftGain;
            rightChannel[outputIndex] += rightSample * rightGain;
          }
        } catch (error) {
          console.warn(`Failed to mix segment ${segment.id}:`, error);
        }
      }
    }

    // Normalize
    let maxSample = 0;
    for (let i = 0; i < totalSamples; i++) {
      maxSample = Math.max(maxSample, Math.abs(leftChannel[i]), Math.abs(rightChannel[i]));
    }
    if (maxSample > 1) {
      const normalizeFactor = 0.95 / maxSample;
      for (let i = 0; i < totalSamples; i++) {
        leftChannel[i] *= normalizeFactor;
        rightChannel[i] *= normalizeFactor;
      }
    }

    return mixedBuffer;
  }

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
   * Export mixed audio from multiple tracks with effects applied
   */
  async exportAudio(tracks, totalLengthMs, effects = {}, options = {}) {
    const format = options.format || "mp3";
    const filename = options.filename || `export.${format}`;

    // Mix all tracks
    let mixedBuffer = await this.mixTracks(tracks, totalLengthMs);

    // Apply master effects to the mixed buffer
    if (effects && Object.keys(effects).length > 0) {
      try {
        mixedBuffer = await this.applyMasterEffects(mixedBuffer, effects);
      } catch (error) {
        console.warn("Failed to apply effects, exporting without effects:", error);
      }
    }

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
        const wavBlob = this.createWavBlob(mixedBuffer);
        const wavFile = new File([wavBlob], "temp.wav", { type: "audio/wav" });

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