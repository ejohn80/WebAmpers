import * as Tone from "tone";

/**
 * @class AudioSegment
 * @classdesc A class to manage a segment of a larger audio buffer.
 * This is a data/model class and is not a React component. It represents a single audio clip on a track.
 */
export class AudioSegment {
  /**
   * The unique ID for the segment.
   * @type {string}
   */
  id;

  /**
   * The name of the segment (e.g., the original filename).
   * @type {string}
   */
  name;

  /**
   * The original filename of the audio asset.
   * @type {string}
   */
  fileName;

  /**
   * A reference to the full audio buffer (e.g., a Tone.ToneAudioBuffer).
   * @type {Tone.ToneAudioBuffer}
   */
  buffer;

  /**
   * The start time of the segment within the full audio buffer, in seconds.
   * @type {number}
   */
  offset;

  /**
   * The duration of the segment to be played, in seconds.
   * @type {number}
   */
  duration;

  /**
   * An array of audio effects specific to this segment.
   * @type {Array<any>}
   */
  effects;

  /**
   * The color for this segment's waveform display.
   * @type {string|null}
   */
  color;

  /**
   * @param {object} options - The initial properties of the segment.
   * @param {Tone.ToneAudioBuffer} options.buffer - The full audio buffer. This is required.
   * @param {string} [options.name] - The display name for the segment.
   * @param {string} [options.fileName] - The original filename of the audio asset.
   * @param {string} [options.color] - The color for the segment's waveform.
   * @param {number} [options.offset=0] - The start offset in seconds.
   * @param {number} [options.duration] - The duration in seconds. Defaults to the buffer's duration minus the offset.
   * @param {Array<any>} [options.effects=[]] - An initial list of effects for this segment.
   */
  constructor(options = {}) {
    if (!options.buffer || !(options.buffer instanceof Tone.ToneAudioBuffer)) {
      throw new Error("AudioSegment requires a valid Tone.ToneAudioBuffer.");
    }

    this.id =
      options.id || `segment_${Math.random().toString(36).substring(2, 9)}`;

    // Store name and fileName
    this.name = options.name || options.fileName || null;
    this.fileName = options.fileName || options.name || null;
    this.color = options.color || null;

    this.buffer = options.buffer;
    this.offset = options.offset || 0;

    // If duration is not provided, calculate it from the buffer length and offset.
    this.duration = options.duration || this.buffer.duration - this.offset;
    this.effects = options.effects || [];

    // Ensure duration doesn't exceed buffer length
    if (this.offset + this.duration > this.buffer.duration) {
      this.duration = this.buffer.duration - this.offset;
    }
  }

  /**
   * Creates a Tone.Player and schedules it to play the segment at a specific time.
   * The player is disposed of automatically after it's finished playing.
   * @param {Time} time The time from the Transport to start playing the segment.
   * @param {Tone.Channel | Tone.AudioNode} destination The destination to connect the player to (e.g., an AudioTrack's channel).
   */
  start(time, destination) {
    if (!destination) {
      console.error("AudioSegment.start requires a destination node.");
      return;
    }

    // Create a new player for this specific playback event.
    // This is the recommended approach by Tone.js for scheduling one-off sounds.
    const player = new Tone.Player(this.buffer).toDestination();

    // If there are effects, chain them.
    if (this.effects.length > 0) {
      player.chain(...this.effects, destination);
    } else {
      player.connect(destination);
    }

    // Schedule the playback of the specific segment.
    player.start(time, this.offset, this.duration);

    // Automatically dispose of the player once it's done to free up resources.
    const stopTime = Tone.Transport.toSeconds(time) + this.duration;
    Tone.Transport.scheduleOnce(() => {
      player.dispose();
    }, stopTime);
  }

  /**
   * Returns a plain object representation for serialization.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      fileName: this.fileName,
      color: this.color,
      offset: this.offset,
      duration: this.duration,
      // Note: buffer is not serialized, it should be stored separately
      // effects: this.effects, // Serialize effects if needed
    };
  }
}
