import {AudioTrack} from "../models/AudioTrack";
import {AudioSegment} from "../models/AudioSegment";
import * as Tone from "tone";

/**
 * @class AudioManager
 * @classdesc Manages all audio tracks and their state for the application.
 * This class is a singleton, and you should only use the exported `audioManager` instance.
 */
class AudioManager {
  /**
   * A list of all audio tracks in the project.
   * @type {Array<AudioTrack>}
   */
  tracks = [];

  constructor() {
    if (AudioManager._instance) {
      return AudioManager._instance;
    }
    AudioManager._instance = this;
  }

  /**
   * Creates a new AudioTrack and an AudioSegment from an imported audio buffer.
   * @param {object} audioData - The data from the audio import.
   * @param {Tone.ToneAudioBuffer} audioData.buffer - The audio buffer of the imported file.
   * @param {File} audioData.file - The original file object.
   * @returns {AudioTrack} The newly created audio track.
   */
  addTrackFromBuffer(data) {
    // Accept either the importer shape ({ buffer, originalFile }) or a
    // saved track object from the DB which may include primitive mixer
    // fields and optionally `segments`.

    const buffer = data?.buffer;
    const file = data?.originalFile || data?.file || null;

    // Prefer explicit name, else derive from filename or default
    const name =
      data?.name || (file ? file.name.replace(/\.[^/.]+$/, "") : "Imported");
    const color = data?.color || this.getNewTrackColor();

    const volume =
      typeof data?.volume === "number"
        ? data.volume
        : typeof data?._volumeDb === "number"
          ? data._volumeDb
          : 0;
    const pan =
      typeof data?.pan === "number"
        ? data.pan
        : typeof data?._pan === "number"
          ? data._pan
          : 0;
    const mute = typeof data?.mute !== "undefined" ? data.mute : !!data?._mute;
    const solo = typeof data?.solo !== "undefined" ? data.solo : !!data?._solo;

    // 1. Create a new AudioTrack with primitive fields so state is persisted.
    const newTrack = new AudioTrack({
      id: data?.id,
      name,
      color,
      volume,
      pan,
      mute,
      solo,
    });

    // 2. Restore segments if supplied, otherwise create a single segment
    // using the provided buffer (if any).
    if (Array.isArray(data?.segments) && data.segments.length > 0) {
      data.segments.forEach((s) => {
        try {
          // If the saved segment contains a Tone.ToneAudioBuffer in s.buffer,
          // use it. Otherwise, if the segment stores raw channel data (from DB),
          // reconstruct a Tone.ToneAudioBuffer. If neither, fall back to the
          // track-level buffer passed in.
          let segBuffer = null;

          if (s.buffer instanceof AudioSegment) {
            // unlikely: defensive
            segBuffer = s.buffer;
          } else if (s.buffer && typeof s.buffer.get === "function") {
            // already a Tone.ToneAudioBuffer
            segBuffer = s.buffer;
          } else if (s.buffer && s.buffer.channels) {
            // stored raw channel data from DB: reconstruct native AudioBuffer
            try {
              const bd = s.buffer;
              const audioBuffer = Tone.context.createBuffer(
                bd.numberOfChannels,
                bd.length,
                bd.sampleRate
              );
              for (let i = 0; i < bd.numberOfChannels; i++) {
                audioBuffer.copyToChannel(bd.channels[i], i);
              }
              segBuffer = new Tone.ToneAudioBuffer(audioBuffer);
            } catch (e) {
              console.warn("Failed to reconstruct segment AudioBuffer:", e);
              segBuffer = null;
            }
          }

          if (!segBuffer && buffer) segBuffer = buffer;

          if (segBuffer) {
            const offset =
              typeof s.offset === "number"
                ? s.offset
                : typeof s.startInFileMs === "number"
                  ? s.startInFileMs / 1000
                  : 0;
            const duration =
              typeof s.duration === "number"
                ? s.duration
                : typeof s.durationMs === "number"
                  ? s.durationMs / 1000
                  : undefined;

            const seg = new AudioSegment({
              id: s.id,
              buffer: segBuffer,
              offset,
              duration,
              effects: s.effects || [],
            });
            newTrack.segments.push(seg);
          }
        } catch (e) {
          // Skip malformed segments but continue restoring others.
          console.warn("Failed to restore segment for track", newTrack.id, e);
        }
      });
    } else if (buffer) {
      // Create a single segment that covers the entire buffer
      try {
        const seg = new AudioSegment({buffer});
        newTrack.segments.push(seg);
      } catch (e) {
        console.warn("Failed to create segment from buffer:", e);
      }
    }

    // 3. Add the new track to the manager's list.
    this.tracks.push(newTrack);

    console.log("New track added:", newTrack);
    return newTrack;
  }

  getNewTrackColor() {
    // Simple color rotation for new tracks
    const colors = [
      "#FF5733",
      "#33FF57",
      "#3357FF",
      "#FF33A1",
      "#A133FF",
      "#33FFA1",
    ];
    return colors[this.tracks.length % colors.length];
  }
}

export const audioManager = new AudioManager();
