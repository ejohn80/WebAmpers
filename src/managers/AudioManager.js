import { AudioTrack } from "../models/AudioTrack";
import { AudioSegment } from "../models/AudioSegment";

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
    if (!audioData || !audioData.buffer) {
      console.error("Invalid audio data provided to addTrackFromBuffer");
      return null;
    }

    // Check if this track already exists by ID to prevent duplicates
    if (audioData.id && this.tracks.some(t => t.id === audioData.id)) {
      console.warn(`Track with ID ${audioData.id} already exists, skipping duplicate`);
      return this.tracks.find(t => t.id === audioData.id);
    }

    // Generate a unique color for this track
    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", 
      "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"
    ];
    const color = colors[this.tracks.length % colors.length];

    // Create a new AudioSegment from the buffer
    const segment = new AudioSegment({
      buffer: audioData.buffer,
      offset: 0,
      duration: audioData.buffer.duration,
    });

    // Calculate duration in milliseconds
    const durationMs = Math.round(audioData.buffer.duration * 1000);

    // Prepare segment data for storage
    segment.durationMs = durationMs;
    segment.startOnTimelineMs = 0;
    segment.startInFileMs = 0;

    // Create the new track
    const track = new AudioTrack({
      id: audioData.id, // Preserve existing ID
      name: audioData.name || audioData.metadata?.name || `Track ${this.tracks.length + 1}`,
      color: audioData.color || color,
      segments: [segment],
      volume: audioData.volume ?? 0,
      pan: audioData.pan ?? 0,
      mute: audioData.mute ?? false,
      solo: audioData.solo ?? false,
    });

    // Add buffer reference at track level for compatibility
    track.buffer = audioData.buffer;

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
    const index = this.tracks.findIndex(t => t.id === trackId);
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
    return this.tracks.find(t => t.id === trackId) || null;
  }

  /**
   * Clear all tracks
   */
  clearAllTracks() {
    this.tracks.forEach(track => {
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