import {AudioTrack} from "../models/AudioTrack";
import {AudioSegment} from "../models/AudioSegment";
import * as Tone from "tone";

/**
 * AudioManager - Manages multiple audio tracks
 */
class AudioManager {
  constructor() {
    this.tracks = [];
  }

  /**
   * Creates a new track from imported audio data or recording
   * @param {Object} audioData - Contains buffer, metadata, name, etc.
   * @returns {AudioTrack} The newly created track
   */
  addTrackFromBuffer(audioData) {
    if (!audioData) {
      console.error("Invalid audio data provided to addTrackFromBuffer");
      return null;
    }

    // Accept multiple shapes:
    // - { buffer: Tone.ToneAudioBuffer }
    // - { segments: [{ buffer: { channels, sampleRate, length, numberOfChannels } }] } from IndexedDB
    // Attempt to resolve or reconstruct a Tone.ToneAudioBuffer
    let toneBuffer = audioData.buffer || null;
    if (!toneBuffer) {
      try {
        const seg0 = Array.isArray(audioData.segments)
          ? audioData.segments[0]
          : null;
        const b = seg0?.buffer;
        if (b && b.channels && b.sampleRate && b.length && b.numberOfChannels) {
          // Reconstruct native AudioBuffer then wrap in Tone.ToneAudioBuffer
          const native =
            typeof Tone?.context?.createBuffer === "function"
              ? Tone.context.createBuffer(
                  b.numberOfChannels,
                  b.length,
                  b.sampleRate
                )
              : null;
          if (native) {
            for (let i = 0; i < b.numberOfChannels; i++) {
              // If channels[i] is a typed array, copy directly; else coerce
              const arr = b.channels[i];
              if (arr && typeof native.copyToChannel === "function") {
                native.copyToChannel(arr, i);
              }
            }
            toneBuffer = new Tone.ToneAudioBuffer(native);
          }
        }
      } catch (e) {
        console.warn(
          "Failed to reconstruct ToneAudioBuffer from serialized data:",
          e
        );
      }
    }

    if (!toneBuffer) {
      console.error("Invalid or missing audio buffer for addTrackFromBuffer");
      return null;
    }

    // Check if this track already exists by ID to prevent duplicates
    if (audioData.id && this.tracks.some((t) => t.id === audioData.id)) {
      console.warn(
        `Track with ID ${audioData.id} already exists, skipping duplicate`
      );
      return this.tracks.find((t) => t.id === audioData.id);
    }

    // Generate a unique color for this track
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#FFA07A",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E2",
    ];
    const color = colors[this.tracks.length % colors.length];

    // Build segments
    let builtSegments = [];
    if (Array.isArray(audioData.segments) && audioData.segments.length > 0) {
      // Rehydrate each segment from stored data
      for (const s of audioData.segments) {
        let segToneBuf = toneBuffer;
        try {
          const b = s?.buffer;
          if (
            b &&
            b.channels &&
            b.sampleRate &&
            b.length &&
            b.numberOfChannels
          ) {
            const native = Tone.context.createBuffer(
              b.numberOfChannels,
              b.length,
              b.sampleRate
            );
            for (let i = 0; i < b.numberOfChannels; i++) {
              native.copyToChannel(b.channels[i], i);
            }
            segToneBuf = new Tone.ToneAudioBuffer(native);
          }
        } catch {
          // fallback to main toneBuffer
        }

        const offsetSec =
          typeof s.offset === "number"
            ? s.offset
            : typeof s.startInFileMs === "number"
              ? s.startInFileMs / 1000
              : 0;
        const durationSec =
          typeof s.duration === "number"
            ? s.duration
            : typeof s.durationMs === "number"
              ? s.durationMs / 1000
              : undefined;

        try {
          const seg = new AudioSegment({
            buffer: segToneBuf,
            offset: offsetSec,
            duration: durationSec,
          });
          // Preserve metadata used by UI/engine
          if (typeof s.durationMs === "number") seg.durationMs = s.durationMs;
          if (typeof s.startOnTimelineMs === "number")
            seg.startOnTimelineMs = s.startOnTimelineMs;
          if (typeof s.startInFileMs === "number")
            seg.startInFileMs = s.startInFileMs;
          if (s.id) seg.id = s.id;
          builtSegments.push(seg);
        } catch (e) {
          console.warn("Failed to rebuild segment, skipping:", e);
        }
      }
    } else {
      // Single segment built from the provided buffer
      const segment = new AudioSegment({
        buffer: toneBuffer,
        offset: 0,
        duration: toneBuffer.duration,
      });
      const durationMs = Math.round(toneBuffer.duration * 1000);
      segment.durationMs = durationMs;
      segment.startOnTimelineMs = 0;
      segment.startInFileMs = 0;
      builtSegments = [segment];
    }

    // Create the new track
    const track = new AudioTrack({
      id: audioData.id, // Preserve existing ID
      name:
        audioData.name ||
        audioData.metadata?.name ||
        `Track ${this.tracks.length + 1}`,
      color: audioData.color || color,
      segments: builtSegments,
      volume: audioData.volume ?? 0,
      pan: audioData.pan ?? 0,
      mute: audioData.mute ?? false,
      solo: audioData.solo ?? false,
    });

    // Add buffer reference at track level for compatibility
    track.buffer = builtSegments[0]?.buffer || toneBuffer;

    // Add to tracks array
    this.tracks.push(track);

    console.log(`Created new track: ${track.name} (ID: ${track.id})`);
    return track;
  }

  /**
   * Delete a track by ID
   * @param {string} trackId - The ID of the track to delete
   * @returns {boolean} True if deleted, false if not found
   */
  deleteTrack(trackId) {
    const index = this.tracks.findIndex((t) => t.id === trackId);
    if (index === -1) {
      console.warn(`Track ${trackId} not found`);
      return false;
    }

    const track = this.tracks[index];

    // Dispose of Tone.js resources
    try {
      track.dispose();
    } catch (e) {
      console.warn("Error disposing track:", e);
    }

    // Remove from array
    this.tracks.splice(index, 1);

    console.log(`Deleted track: ${track.name} (ID: ${trackId})`);
    return true;
  }

  /**
   * Get a track by ID
   * @param {string} trackId - The ID of the track
   * @returns {AudioTrack|null}
   */
  getTrack(trackId) {
    return this.tracks.find((t) => t.id === trackId) || null;
  }

  /**
   * Clear all tracks
   */
  clearAllTracks() {
    this.tracks.forEach((track) => {
      try {
        track.dispose();
      } catch (e) {
        console.warn("Error disposing track:", e);
      }
    });
    this.tracks = [];
    console.log("Cleared all tracks");
  }

  /**
   * Get track count
   * @returns {number}
   */
  getTrackCount() {
    return this.tracks.length;
  }
}

// Export singleton instance
export const audioManager = new AudioManager();
