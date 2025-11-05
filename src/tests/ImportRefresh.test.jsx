import { dbManager } from '../managers/DBManager';
import { audioManager } from '../managers/AudioManager';
import * as Tone from 'tone';

// Mock Tone.js runtime pieces used by AudioTrack so tests can run in Node
jest.mock('tone');

// Provide minimal stubs for the Tone pieces used by the code under test.
beforeEach(() => {
  Tone.context = {
    state: 'suspended',
    rawContext: { decodeAudioData: jest.fn() },
    resume: jest.fn().mockResolvedValue(undefined),
    createBuffer: (numberOfChannels, length, sampleRate) => {
      // Simple in-memory buffer that supports copyToChannel and getChannelData
      const channels = [];
      for (let i = 0; i < numberOfChannels; i++) channels.push(new Float32Array(length));
      return {
        numberOfChannels,
        length,
        sampleRate,
        duration: length / sampleRate,
        copyToChannel: (data, ch) => {
          channels[ch].set(data);
        },
        getChannelData: (i) => channels[i],
      };
    },
  };
  Tone.start = jest.fn().mockResolvedValue(undefined);
  // Minimal ToneAudioBuffer constructor used in tests. Instances must pass
  // `instanceof Tone.ToneAudioBuffer` checks in AudioSegment.
  Tone.ToneAudioBuffer = class {
    constructor(native) {
      this.duration = native.duration || 1;
      this.sampleRate = native.sampleRate || 44100;
      this.numberOfChannels = native.numberOfChannels || 1;
      this.get = () => ({
        numberOfChannels: this.numberOfChannels,
        sampleRate: this.sampleRate,
        length: native.length || 44100,
        duration: this.duration,
        getChannelData: native.getChannelData,
      });
    }
  };
  // Minimal Channel stub that exposes expected fields/methods used by AudioTrack
  Tone.Channel = function (opts) {
    this.volume = { value: typeof opts.volume === 'number' ? opts.volume : 0 };
    this.pan = { value: typeof opts.pan === 'number' ? opts.pan : 0 };
    this.mute = !!opts.mute;
    this.solo = !!opts.solo;
    this.toDestination = () => this;
  };
});

// Create an import-like object that AudioManager.addTrackFromBuffer can consume
const makeImport = (name, seed = 1) => {
  // Use a Tone.ToneAudioBuffer instance so AudioManager will create a
  // proper AudioSegment from it.
  const mockNative = {
    duration: 1,
    sampleRate: 44100,
    numberOfChannels: 1,
    length: 44100,
    getChannelData: (i) => new Float32Array([seed, seed + 0.1, seed + 0.2]),
  };

  const toneBuf = new Tone.ToneAudioBuffer(mockNative);
  return {
    name,
    buffer: toneBuf,
  };
};

describe('Import + Refresh workflow', () => {
  beforeEach(async () => {
    await dbManager.openDB();
    await dbManager.clearAllTracks();
    // Reset in-memory tracks
    audioManager.tracks.length = 0;
  });

  afterEach(async () => {
    await dbManager.clearAllTracks();
    if (dbManager.db) {
      dbManager.db.close();
      dbManager.db = null;
    }
    audioManager.tracks.length = 0;
  });

  it('should preserve the latest imported track after successive refreshes', async () => {
    // Import file1
    const imp1 = makeImport('file1', 1);
    const t1 = audioManager.addTrackFromBuffer(imp1);
    await dbManager.addTrack(t1);

    // Refresh: reload from DB
    audioManager.tracks.length = 0;
    const savedAfter1 = await dbManager.getAllTracks();
    savedAfter1.forEach((s) => audioManager.addTrackFromBuffer(s));
    expect(audioManager.tracks).toHaveLength(1);
    expect(audioManager.tracks[0].name).toBe('file1');

    // Import file2
    const imp2 = makeImport('file2', 2);
    const t2 = audioManager.addTrackFromBuffer(imp2);
    await dbManager.addTrack(t2);

    // Refresh
    audioManager.tracks.length = 0;
    const savedAfter2 = await dbManager.getAllTracks();
    savedAfter2.forEach((s) => audioManager.addTrackFromBuffer(s));
    expect(audioManager.tracks).toHaveLength(2);
    expect(audioManager.tracks[audioManager.tracks.length - 1].name).toBe('file2');

    // Import file3
    const imp3 = makeImport('file3', 3);
    const t3 = audioManager.addTrackFromBuffer(imp3);
    await dbManager.addTrack(t3);

    // Refresh
    audioManager.tracks.length = 0;
    const savedAfter3 = await dbManager.getAllTracks();
    savedAfter3.forEach((s) => audioManager.addTrackFromBuffer(s));

    // Expect the last track to be file3
    expect(audioManager.tracks).toHaveLength(3);
    expect(audioManager.tracks[audioManager.tracks.length - 1].name).toBe('file3');
  });
});
