import { AudioTrack } from '../models/AudioTrack';
import { AudioSegment } from '../models/AudioSegment';

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
  addTrackFromBuffer({ buffer, originalFile: file }) {
    // 1. Create a new AudioTrack.
    const newTrack = new AudioTrack({
      name: file.name.replace(/\.[^/.]+$/, ""), // Use the filename without extension
      color: this.getNewTrackColor(),
    });

    // 2. Create a new AudioSegment that covers the entire buffer.
    const newSegment = new AudioSegment({
      buffer: buffer,
      // offset and duration will be calculated by the constructor.
    });

    // 3. Add the segment to the track.
    newTrack.segments.push(newSegment);

    // 4. Add the new track to the manager's list.
    this.tracks.push(newTrack);

    console.log('New track added:', newTrack);
    return newTrack;
  }

  getNewTrackColor() {
    // Simple color rotation for new tracks
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFA1'];
    return colors[this.tracks.length % colors.length];
  }
}

export const audioManager = new AudioManager();
