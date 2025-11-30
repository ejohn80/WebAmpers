import * as Tone from "tone";
import {createDefaultEffects} from "../context/effectsStorage";

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
    this.id =
      options.id || `track_${Math.random().toString(36).substring(2, 9)}`;
    this.name = options.name || "Untitled Track";
    this.color = options.color || "#FFFFFF";
    this.segments = options.segments || [];

    // Serializable primitive fields. These are kept in sync with the
    // underlying Tone.Channel so the values can be stored/loaded easily.
    this._volumeDb = typeof options.volume === "number" ? options.volume : 0; // in dB
    this._pan = typeof options.pan === "number" ? options.pan : 0; // -1 .. 1
    this._mute = !!options.mute;
    this._solo = !!options.solo;

    this._effects = options.effects || createDefaultEffects();
    this.effects = this._effects; // call the setter

    this.activeEffectsList = options.activeEffectsList || [];

    // Initialize the Tone.js Channel for mixer controls and set initial
    // values from the primitive fields. The channel remains the runtime
    // audio object and is not serialized directly.
    this.channel = new Tone.Channel({
      volume: this._volumeDb,
      pan: this._pan,
      mute: this._mute,
      solo: this._solo,
    }).toDestination(); // Connect it to the master output by default
  }

  // Volume in decibels (primitive). Update Tone.Channel when changed.
  get volume() {
    return this._volumeDb;
  }

  set volume(v) {
    this._volumeDb = typeof v === "number" ? v : 0;
    if (this.channel) {
      try {
        if (
          this.channel.volume &&
          typeof this.channel.volume.value === "number"
        ) {
          this.channel.volume.value = this._volumeDb;
        } else {
          this.channel.volume = this._volumeDb;
        }
      } catch (e) {}
    }
  }

  // Pan (-1 left .. +1 right)
  get pan() {
    return this._pan;
  }

  set pan(v) {
    this._pan = typeof v === "number" ? v : 0;
    if (this.channel) {
      try {
        if (this.channel.pan && typeof this.channel.pan.value === "number") {
          this.channel.pan.value = this._pan;
        } else {
          this.channel.pan = this._pan;
        }
      } catch (e) {
        // swallow
      }
    }
  }

  // Mute / Solo primitive flags
  get mute() {
    return this._mute;
  }

  set mute(isMuted) {
    this._mute = !!isMuted;
    if (this.channel) this.channel.mute = this._mute;
  }

  get solo() {
    return this._solo;
  }

  set solo(isSoloed) {
    this._solo = !!isSoloed;
    if (this.channel) this.channel.solo = this._solo;
  }

  /**
   * Effect parameters for this track (e.g. {pitch: 5, volume: 100})
   * @type {Object<string, number>}
   */
  get effects() {
    return this._effects;
  }

  set effects(newEffects) {
    this._effects = newEffects;
  }

  /**
   * Return a serializable representation suitable for DB storage.
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      volume: this._volumeDb,
      pan: this._pan,
      mute: this._mute,
      solo: this._solo,
      segments: this.segments,
      effects: this.effects,
      activeEffectsList: this.activeEffectsList,
    };
  }

  /**
   * Disposes of the track and its associated Tone.js objects.
   */
  dispose() {
    this.channel.dispose();
  }
}
