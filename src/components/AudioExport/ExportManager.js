/**
 * ExportManager - Mix and export multiple tracks with master effects
 */
import {PlaybackEngine} from "../../playback/playback";
import * as Tone from "tone";
import PythonApiClient from "../../backend/PythonApiClient";

const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

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
   * Apply master effects to the mixed buffer using Tone.Offline rendering
   */
  async applyMasterEffects(buffer, effects = {}) {
    if (!effects || Object.keys(effects).length === 0) {
      return buffer;
    }
    const hasEQChanges = EQ_BANDS.some(
      (freq) => effects[freq] !== undefined && Math.abs(effects[freq]) > 0.01
    );

    // Check if there are any actual effects to apply
    const hasEffects =
      (effects?.pitch && effects.pitch !== 0) ||
      (effects?.reverb && effects.reverb > 0) ||
      (effects?.volume && effects.volume !== 100) ||
      (effects?.delay && effects.delay > 0) ||
      (effects?.bass && effects.bass !== 0) ||
      (effects?.distortion && effects.distortion > 0) ||
      (effects?.pan && effects.pan !== 0) ||
      (effects?.tremolo && effects.tremolo > 0) ||
      (effects?.vibrato && effects.vibrato > 0) ||
      (effects?.chorus && effects.chorus > 0) ||
      (effects?.highpass && effects.highpass > 20) ||
      (effects?.lowpass && effects.lowpass < 20000) ||
      hasEQChanges;

    if (!hasEffects) {
      return buffer;
    }

    console.log("Applying master effects to mixed buffer:", effects);

    // Convert native AudioBuffer to Tone.ToneAudioBuffer
    const toneBuffer = new Tone.ToneAudioBuffer(buffer);
    const durationSeconds = buffer.duration;

    try {
      // Use Tone.Offline to render with effects
      const renderedBuffer = await Tone.Offline(async (context) => {
        // Create player with the mixed buffer
        const player = new Tone.Player({
          url: toneBuffer,
          context: context,
        });

        // Build effects chain
        const effectsChain = [];

        // Pitch shift
        if (typeof effects.pitch === "number" && effects.pitch !== 0) {
          const pitchShift = new Tone.PitchShift({
            pitch: effects.pitch,
            context: context,
          });
          effectsChain.push(pitchShift);
        }

        // Reverb
        if (typeof effects.reverb === "number" && effects.reverb > 0) {
          const wet = Math.max(0, Math.min(1, effects.reverb / 100));
          const roomSize = 0.1 + 0.85 * wet;
          const reverb = new Tone.Freeverb({
            roomSize: roomSize,
            dampening: 3000,
            wet: wet,
            context: context,
          });
          effectsChain.push(reverb);
        }

        // Distortion
        if (typeof effects.distortion === "number" && effects.distortion > 0) {
          const distortionAmount = Math.max(
            0,
            Math.min(1, effects.distortion / 100)
          );
          const distortion = new Tone.Distortion({
            distortion: distortionAmount,
            wet: 1, // Full wet blend for distortion
            context: context,
          });
          effectsChain.push(distortion);
        }

        // Delay
        if (typeof effects.delay === "number" && effects.delay > 0) {
          const wet = Math.max(0, Math.min(1, effects.delay / 100));
          const delay = new Tone.PingPongDelay({
            delayTime: "8n", // 8th note delay time
            feedback: 0.2 + 0.6 * wet, // Increase feedback with wet level
            wet: wet,
            context: context,
          });
          effectsChain.push(delay);
        }

        // Bass Boost
        if (typeof effects.bass === "number" && effects.bass !== 0) {
          const bassFilter = new Tone.Filter({
            type: "lowshelf",
            frequency: 250,
            gain: effects.bass,
            context: context,
          });
          effectsChain.push(bassFilter);
        }

        // Full EQ
        if (hasEQChanges) {
          EQ_BANDS.forEach((freq) => {
            const gain = effects[freq];
            if (gain !== undefined && Math.abs(gain) > 0.01) {
              const filter = new Tone.Filter({
                frequency: freq,
                type: "peaking",
                Q: 1.0,
                gain: gain,
                context: context,
              });
              effectsChain.push(filter);
            }
          });
        }

        // Pan
        if (typeof effects.pan === "number" && effects.pan !== 0) {
          const panValue = Math.max(-1, Math.min(1, effects.pan / 100));
          const panner = new Tone.Panner({
            pan: panValue,
            context: context,
          });
          effectsChain.push(panner);
        }

        // Tremolo
        if (typeof effects.tremolo === "number" && effects.tremolo > 0) {
          const wet = Math.max(0, Math.min(1, effects.tremolo / 100));
          const tremolo = new Tone.Tremolo({
            frequency: 0.1 + wet * 19.9,
            depth: wet,
            wet: wet,
            context: context,
          }).start();
          effectsChain.push(tremolo);
        }

        // Vibrato
        if (typeof effects.vibrato === "number" && effects.vibrato > 0) {
          const wet = Math.max(0, Math.min(1, effects.vibrato / 100));
          const vibrato = new Tone.Vibrato({
            frequency: 0.1 + wet * 19.9,
            depth: wet,
            context: context,
          });
          effectsChain.push(vibrato);
        }

        // Chorus
        if (typeof effects.chorus === "number" && effects.chorus > 0) {
          const wet = Math.max(0, Math.min(1, effects.chorus / 100));
          const chorus = new Tone.Chorus({
            frequency: 1.5,
            delayTime: 3.5,
            depth: 0.7,
            type: "sine",
            spread: 180,
            wet: wet,
            context: context,
          }).start();
          effectsChain.push(chorus);
        }

        // High-pass Filter
        if (typeof effects.highpass === "number" && effects.highpass > 20) {
          const highpass = new Tone.Filter({
            frequency: effects.highpass,
            type: "highpass",
            context: context,
          });
          effectsChain.push(highpass);
        }

        // Low-pass Filter
        if (typeof effects.lowpass === "number" && effects.lowpass < 20000) {
          const lowpass = new Tone.Filter({
            frequency: effects.lowpass,
            type: "lowpass",
            context: context,
          });
          effectsChain.push(lowpass);
        }

        // Volume/Gain - Should always be the last effect before the destination
        if (typeof effects.volume === "number" && effects.volume !== 100) {
          const gain = Math.max(0, Math.min(2, effects.volume / 100));
          const gainNode = new Tone.Gain({
            gain: gain,
            context: context,
          });
          effectsChain.push(gainNode);
        }

        // Connect chain
        if (effectsChain.length > 0) {
          player.chain(...effectsChain, context.destination);
        } else {
          player.toDestination();
        }

        // Start playback
        player.start(0);
      }, durationSeconds);

      console.log("Master effects applied successfully");

      // Convert Tone.ToneAudioBuffer back to native AudioBuffer
      return renderedBuffer.get();
    } catch (error) {
      console.error("Failed to apply master effects:", error);
      // Return original buffer if effects fail
      return buffer;
    }
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

    const renderedBuffer = await Tone.Offline(
      async (context) => {
        const tempEngine = new PlaybackEngine();

        for (const track of tracks) {
          if (track.mute) continue;

          const anySolo = tracks.some((t) => t.solo);
          if (anySolo && !track.solo) continue;

          const effects = track.effects || {};
          const enabledEffects = track.enabledEffects || {};

          // IMPORTANT: Filter effects to only include enabled ones
          const filteredEffects = {};
          Object.keys(effects).forEach((key) => {
            // Pan is always enabled (not part of toggle system)
            if (key === "pan") {
              filteredEffects[key] = effects[key];
            } else if (enabledEffects[key] !== false) {
              // Only include effect if it's explicitly enabled (or not set, defaulting to enabled)
              filteredEffects[key] = effects[key];
            }
          });

          console.log(
            `[Export] Track ${track.id} - Original effects:`,
            effects
          );
          console.log(
            `[Export] Track ${track.id} - Enabled map:`,
            enabledEffects
          );
          console.log(
            `[Export] Track ${track.id} - Filtered effects:`,
            filteredEffects
          );

          // Build effects chain with filtered effects
          const effectsChain = tempEngine._buildEffectsChain(
            filteredEffects,
            context
          );

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

              const toneBuffer = new Tone.ToneAudioBuffer(sourceBuffer);
              const player = new Tone.Player({url: toneBuffer, context});

              if (effectsChain.length > 0) {
                player.chain(...effectsChain, context.destination);
              } else {
                player.connect(context.destination);
              }

              const startTimeSec = (segment.startOnTimelineMs || 0) / 1000;
              const offsetSec = (segment.startInFileMs || 0) / 1000;
              const durationSec =
                (segment.durationMs || sourceBuffer.duration * 1000) / 1000;

              player.start(startTimeSec, offsetSec, durationSec);
            } catch (error) {
              console.warn(`Failed to mix segment ${segment.id}:`, error);
            }
          }
        }
      },
      totalLengthSec,
      2,
      sampleRate
    );

    // Get the native AudioBuffer
    const mixedBuffer = renderedBuffer.get();

    // Normalize to prevent clipping
    const leftChannel = mixedBuffer.getChannelData(0);
    const rightChannel = mixedBuffer.getChannelData(1);
    const totalSamples = mixedBuffer.length;

    let maxSample = 0;
    for (let i = 0; i < totalSamples; i++) {
      maxSample = Math.max(
        maxSample,
        Math.abs(leftChannel[i]),
        Math.abs(rightChannel[i])
      );
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

    return new Blob([bufferArray], {type: "audio/wav"});
  }

  /**
   * Export mixed audio from multiple tracks with effects applied
   */
  async exportAudio(tracks, totalLengthMs, effects = {}, options = {}) {
    const format = options.format || "mp3";
    const filename = options.filename || `export.${format}`;

    // Mix all tracks (now respects enabledEffects)
    let mixedBuffer = await this.mixTracks(tracks, totalLengthMs);

    // Apply master effects to the mixed buffer using Tone.Offline
    if (effects && Object.keys(effects).length > 0) {
      try {
        mixedBuffer = await this.applyMasterEffects(mixedBuffer, effects);
      } catch (error) {
        console.warn(
          "Failed to apply effects, exporting without effects:",
          error
        );
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
        return {success: true, format: "wav"};
      }

      case "mp3":
      case "ogg": {
        const wavBlob = this.createWavBlob(mixedBuffer);
        const wavFile = new File([wavBlob], "temp.wav", {type: "audio/wav"});

        const resultBlob = await this.pythonApi.exportAudio(wavFile, {
          format: format,
          sampleRate: mixedBuffer.sampleRate,
          bitrate: options.bitrate,
        });
        this.pythonApi.downloadBlob(resultBlob, filename);
        return {success: true, format};
      }

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

export default ExportManager;
