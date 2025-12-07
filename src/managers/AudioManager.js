import {AudioTrack} from "../models/AudioTrack";
import {AudioSegment} from "../models/AudioSegment";
import {createDefaultEffects} from "../context/effectsStorage";
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
      "#00e5ff",
      "#1aff00",
      "#f8dc6f",
      "#ff6eff",
      "#b32595",
      "#ff89b5",
      "#7a1cee",
      "#fe4467",
      "#eb7813",
    ];
    const color = colors[this.tracks.length % colors.length];

    // Build segments
    let builtSegments = [];
    if (Array.isArray(audioData.segments) && audioData.segments.length > 0) {
      // Rehydrate each segment from stored data
      for (const s of audioData.segments) {
        let segToneBuf = s.buffer || toneBuffer;

        console.log(`[AudioManager] Processing segment ${s.id}:`, {
          hasOwnBuffer: !!s.buffer,
          ownBufferDuration: s.buffer
            ? s.buffer.duration || s.buffer.get?.()?.duration
            : null,
          willUseTrackBuffer: !s.buffer,
          assetId: s.assetId,
        });

        // Try to reconstruct buffer from serialized data if present
        // (This is only needed for segments with inline buffers, not asset references)
        if (!segToneBuf) {
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
              console.log(
                `[AudioManager] Reconstructed buffer from serialized data for segment ${s.id}`
              );
            }
          } catch (err) {
            console.warn(
              `[AudioManager] Failed to reconstruct buffer for segment ${s.id}, using track buffer:`,
              err
            );
            // fallback to main toneBuffer
            segToneBuf = toneBuffer;
          }
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
          console.log(`[AudioManager] Reconstructing segment:`, {
            id: s.id,
            name: s.name,
            fileName: s.fileName,
            hasName: !!s.name,
            hasFileName: !!s.fileName,
          });

          const seg = new AudioSegment({
            buffer: segToneBuf,
            offset: offsetSec,
            duration: durationSec,
            name: s.name || s.fileName || null,
            fileName: s.fileName || s.name || null,
          });

          // Preserve metadata used by UI/engine
          if (typeof s.durationMs === "number") seg.durationMs = s.durationMs;
          if (typeof s.startOnTimelineMs === "number")
            seg.startOnTimelineMs = s.startOnTimelineMs;
          if (typeof s.startInFileMs === "number")
            seg.startInFileMs = s.startInFileMs;
          if (s.id) seg.id = s.id;

          // CRITICAL: Preserve assetId from the segment data
          const segmentAssetId = s.assetId ?? audioData.assetId ?? null;
          seg.assetId = segmentAssetId;

          console.log(`[AudioManager] Built segment ${seg.id}:`, {
            assetId: seg.assetId,
            bufferDuration: segToneBuf
              ? segToneBuf.duration || segToneBuf.get?.()?.duration
              : null,
            offset: offsetSec,
            duration: durationSec,
          });

          builtSegments.push(seg);
        } catch (e) {
          console.warn(
            "[AudioManager] Failed to rebuild segment, skipping:",
            e
          );
        }
      }

      // Verify all segments have assetIds
      console.log(
        `[AudioManager] Built ${builtSegments.length} segments for track ${audioData.id || "NEW"}:`
      );
      builtSegments.forEach((seg, idx) => {
        console.log(
          `  Segment ${idx}: id=${seg.id}, assetId=${seg.assetId}, bufferDuration=${seg.buffer ? seg.buffer.duration || seg.buffer.get?.()?.duration : null}`
        );
      });
    } else {
      // Single segment built from the provided buffer
      const segment = new AudioSegment({
        buffer: toneBuffer,
        offset: 0,
        duration: toneBuffer.duration,
        name: audioData.name || null,
        fileName: audioData.name || null,
      });
      const durationMs = Math.round(toneBuffer.duration * 1000);
      segment.durationMs = durationMs;
      segment.startOnTimelineMs = 0;
      segment.startInFileMs = 0;
      segment.assetId = audioData.assetId ?? null;

      console.log(
        `[AudioManager] Created single segment with assetId ${segment.assetId}`
      );

      builtSegments = [segment];
    }

    const trackEffects = audioData.effects || createDefaultEffects();
    const trackActiveEffectsList = audioData.activeEffectsList || [];
    const trackEnabledEffects = audioData.enabledEffects || {};

    // Create the new track
    const track = new AudioTrack({
      id: audioData.id,
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
      effects: trackEffects,
      enabledEffects: trackEnabledEffects,
      activeEffectsList: trackActiveEffectsList,
    });

    console.log(`[AudioManager] Creating track from audioData:`, {
      id: audioData.id,
      hasEnabledEffects: !!audioData.enabledEffects,
      enabledEffects: audioData.enabledEffects,
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
