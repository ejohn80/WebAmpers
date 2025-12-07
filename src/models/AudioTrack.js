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
   * Effect parameters for this track (e.g. {pitch: 5, volume: 100})
   * @type {Object<string, number>}
   */
  effects;

  /**
   * List of active effect IDs (e.g. ["pitch", "reverb"])
   * @type {Array<string>}
   */
  activeEffectsList;

  /**
   * Map of which effects are enabled (true) or disabled (false)
   * @type {Object<string, boolean>}
   */
  enabledEffects;

  /**
   * @param {object} options - The initial properties of the track.
   * @param {string} [options.name='Untitled Track'] - The name of the track.
   * @param {string} [options.color='#FFFFFF'] - The color of the track.
   * @param {Decibels} [options.volume=0] - The initial volume in decibels.
   * @param {AudioRange} [options.pan=0] - The initial pan, from -1 (L) to 1 (R).
   * @param {boolean} [options.mute=false] - The initial mute state.
   * @param {boolean} [options.solo=false] - The initial solo state.
   * @param {Array<any>} [options.segments=[]] - An initial list of audio segments.
   * @param {Object<string, number>} [options.effects] - Initial effect parameters.
   * @param {Array<string>} [options.activeEffectsList] - List of active effect IDs.
   * @param {Object<string, boolean>} [options.enabledEffects] - Map of enabled/disabled effects.
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

    // Effects properties
    this._effects = options.effects || createDefaultEffects();
    this.effects = this._effects; // call the setter

    this.activeEffectsList = options.activeEffectsList || [];
    this.enabledEffects = options.enabledEffects || {};

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
      } catch {
        // Intentionally empty
      }
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
      } catch {
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
  // eslint-disable-next-line no-dupe-class-members
  get effects() {
    // ES-lint false positive
    return this._effects;
  }

  // eslint-disable-next-line no-dupe-class-members
  set effects(newEffects) {
    // ES-lint false positive
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
      enabledEffects: this.enabledEffects, // ADD THIS LINE
    };
  }

  /**
   * Check if a specific effect is enabled.
   * @param {string} effectId - The effect ID to check
   * @returns {boolean} True if the effect is enabled, false if disabled
   */
  isEffectEnabled(effectId) {
    return this.enabledEffects[effectId] !== false;
  }

  /**
   * Enable or disable an effect.
   * @param {string} effectId - The effect ID to toggle
   * @param {boolean} enabled - True to enable, false to disable
   */
  setEffectEnabled(effectId, enabled) {
    this.enabledEffects = {
      ...this.enabledEffects,
      [effectId]: enabled,
    };
  }

  /**
   * Toggle an effect's enabled state.
   * @param {string} effectId - The effect ID to toggle
   * @returns {boolean} The new enabled state
   */
  toggleEffect(effectId) {
    const currentState = this.isEffectEnabled(effectId);
    const newState = !currentState;
    this.setEffectEnabled(effectId, newState);
    return newState;
  }

  /**
   * Get a filtered effects object containing only enabled effects.
   * @returns {Object<string, number>} Effects object with only enabled effects
   */
  getEnabledEffects() {
    const result = {};
    if (this._effects) {
      Object.keys(this._effects).forEach((effectId) => {
        if (this.isEffectEnabled(effectId)) {
          result[effectId] = this._effects[effectId];
        }
      });
    }
    return result;
  }

  /**
   * Disposes of the track and its associated Tone.js objects.
   */
  dispose() {
    this.channel.dispose();
  }
}
