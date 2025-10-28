import * as Tone from 'tone';

/**
 * @class AudioTrack
 * @classdesc A class to manage the state and properties of a single audio track.
 * This is a data/model class and is not a React component.
 */
export class AudioTrack {
  /**
   * The unique ID for the track.
   * @type {string}
   */
  id;

  /**
   * The name of the track.
   * @type {string}
   */
  name;

  /**
   * The color associated with the track for UI purposes.
   * @type {string}
   */
  color;

  /**
   * The Tone.js Channel which handles volume, pan, mute, and solo.
   * @type {Tone.Channel}
   */
  channel;

  /**
   * An array of audio segments belonging to this track.
   * @type {Array<any>}
   */
  segments;

  /**
   * @param {object} options - The initial properties of the track.
   * @param {string} [options.name='Untitled Track'] - The name of the track.
   * @param {string} [options.color='#FFFFFF'] - The color of the track.
   * @param {Decibels} [options.volume=0] - The initial volume in decibels.
   * @param {AudioRange} [options.pan=0] - The initial pan, from -1 (L) to 1 (R).
   * @param {boolean} [options.mute=false] - The initial mute state.
   * @param {boolean} [options.solo=false] - The initial solo state.
   * @param {Array<any>} [options.segments=[]] - An initial list of audio segments.
   */
  constructor(options = {}) {
    this.id = options.id || `track_${Math.random().toString(36).substring(2, 9)}`;
    this.name = options.name || 'Untitled Track';
    this.color = options.color || '#FFFFFF';
    this.segments = options.segments || [];

    // Initialize the Tone.js Channel for mixer controls
    this.channel = new Tone.Channel({
      volume: options.volume || 0,
      pan: options.pan || 0,
      mute: options.mute || false,
      solo: options.solo || false,
    }).toDestination(); // Connect it to the master output by default
  }

  // --- Mixer Parameter Getters/Setters ---

  get volume() {
    return this.channel.volume;
  }

  get pan() {
    return this.channel.pan;
  }

  get mute() {
    return this.channel.mute;
  }

  set mute(isMuted) {
    this.channel.mute = isMuted;
  }

  get solo() {
    return this.channel.solo;
  }

  set solo(isSoloed) {
    this.channel.solo = isSoloed;
  }

  /**
   * Disposes of the track and its associated Tone.js objects.
   */
  dispose() {
    this.channel.dispose();
  }
}
