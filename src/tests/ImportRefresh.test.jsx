import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {dbManager} from "../managers/DBManager";
import {audioManager} from "../managers/AudioManager";
import * as Tone from "tone";

// Mock Tone.js runtime pieces used by AudioTrack so tests can run in Node
vi.mock("tone", () => {
  // Create mock classes that will be returned
  class MockToneAudioBuffer {
    constructor(native) {
      this.duration = native?.duration || 1;
      this.sampleRate = native?.sampleRate || 44100;
      this.numberOfChannels = native?.numberOfChannels || 1;
      this._native = native;
    }

    get() {
      return {
        numberOfChannels: this.numberOfChannels,
        sampleRate: this.sampleRate,
        length: this._native?.length || 44100,
        duration: this.duration,
        getChannelData:
          this._native?.getChannelData || (() => new Float32Array(44100)),
      };
    }
  }

  class MockChannel {
    constructor(opts = {}) {
      this.volume = {value: typeof opts.volume === "number" ? opts.volume : 0};
      this.pan = {value: typeof opts.pan === "number" ? opts.pan : 0};
      this.mute = !!opts.mute;
      this.solo = !!opts.solo;
    }

    toDestination() {
      return this;
    }
  }

  return {
    context: {
      state: "suspended",
      rawContext: {decodeAudioData: vi.fn()},
      resume: vi.fn().mockResolvedValue(undefined),
      createBuffer: (numberOfChannels, length, sampleRate) => {
        // Simple in-memory buffer that supports copyToChannel and getChannelData
        const channels = [];
        for (let i = 0; i < numberOfChannels; i++) {
          channels.push(new Float32Array(length));
        }
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
    },
    start: vi.fn().mockResolvedValue(undefined),
    ToneAudioBuffer: MockToneAudioBuffer,
    Channel: MockChannel,
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

describe("Import + Refresh workflow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await dbManager.openDB();
    await dbManager.clearAllTracks();
    // Reset in-memory tracks
    audioManager.tracks.length = 0;
  });

  afterEach(async () => {
    try {
      await dbManager.clearAllTracks();
      if (dbManager.db) {
        dbManager.db.close();
        dbManager.db = null;
      }
      audioManager.tracks.length = 0;
    } catch (error) {
      // Ignore cleanup errors
      console.warn("Cleanup error:", error);
    }
  });

  it("should preserve the latest imported track after successive refreshes", async () => {
    // Import file1
    const imp1 = makeImport("file1", 1);
    const t1 = audioManager.addTrackFromBuffer(imp1);
    await dbManager.addTrack(t1);

    // Refresh: reload from DB
    audioManager.tracks.length = 0;
    const savedAfter1 = await dbManager.getAllTracks();
    savedAfter1.forEach((s) => audioManager.addTrackFromBuffer(s));
    expect(audioManager.tracks).toHaveLength(1);
    expect(audioManager.tracks[0].name).toBe("file1");

    // Import file2
    const imp2 = makeImport("file2", 2);
    const t2 = audioManager.addTrackFromBuffer(imp2);
    await dbManager.addTrack(t2);

    // Refresh
    audioManager.tracks.length = 0;
    const savedAfter2 = await dbManager.getAllTracks();
    savedAfter2.forEach((s) => audioManager.addTrackFromBuffer(s));
    expect(audioManager.tracks).toHaveLength(2);
    expect(audioManager.tracks[audioManager.tracks.length - 1].name).toBe(
      "file2"
    );

    // Import file3
    const imp3 = makeImport("file3", 3);
    const t3 = audioManager.addTrackFromBuffer(imp3);
    await dbManager.addTrack(t3);

    // Refresh
    audioManager.tracks.length = 0;
    const savedAfter3 = await dbManager.getAllTracks();
    savedAfter3.forEach((s) => audioManager.addTrackFromBuffer(s));

    // Expect the last track to be file3
    expect(audioManager.tracks).toHaveLength(3);
    expect(audioManager.tracks[audioManager.tracks.length - 1].name).toBe(
      "file3"
    );
  });

  it("should restore track mixer settings after refresh", async () => {
    // Import a track with specific mixer settings
    const imp = makeImport("MixerTrack", 5);
    const track = audioManager.addTrackFromBuffer(imp);

    // Set mixer values
    track.volume = -6;
    track.pan = 0.3;
    track.mute = true;
    track.solo = false;

    await dbManager.addTrack(track);

    // Refresh: clear and reload from DB
    audioManager.tracks.length = 0;
    const saved = await dbManager.getAllTracks();
    saved.forEach((s) => audioManager.addTrackFromBuffer(s));

    expect(audioManager.tracks).toHaveLength(1);
    const restored = audioManager.tracks[0];
    expect(restored.name).toBe("MixerTrack");
    expect(restored.volume).toBe(-6);
    expect(restored.pan).toBe(0.3);
    expect(restored.mute).toBe(true);
    expect(restored.solo).toBe(false);
  });

  it("should handle multiple segments per track across refresh", async () => {
    // Create a track manually with multiple segments
    const imp = makeImport("MultiSegment", 10);
    const track = audioManager.addTrackFromBuffer(imp);

    // Add a second segment manually
    const mockNative2 = {
      duration: 2,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 88200,
      getChannelData: (i) => new Float32Array([0.5, 0.6, 0.7]),
    };
    const toneBuf2 = new Tone.ToneAudioBuffer(mockNative2);

    // Import AudioSegment to create second segment
    const {AudioSegment} = await import("../models/AudioSegment");
    const seg2 = new AudioSegment({buffer: toneBuf2, offset: 1.0});
    track.segments.push(seg2);

    await dbManager.addTrack(track);

    // Refresh
    audioManager.tracks.length = 0;
    const saved = await dbManager.getAllTracks();
    saved.forEach((s) => audioManager.addTrackFromBuffer(s));

    expect(audioManager.tracks).toHaveLength(1);
    const restored = audioManager.tracks[0];
    expect(restored.segments).toHaveLength(2);
    expect(restored.segments[0].buffer).toBeDefined();
    expect(restored.segments[1].buffer).toBeDefined();
  });

  it("should clear all tracks and start fresh", async () => {
    // Import multiple tracks
    const imp1 = makeImport("Clear1", 1);
    const imp2 = makeImport("Clear2", 2);
    const imp3 = makeImport("Clear3", 3);

    audioManager.addTrackFromBuffer(imp1);
    audioManager.addTrackFromBuffer(imp2);
    audioManager.addTrackFromBuffer(imp3);

    // Save all to DB
    for (const track of audioManager.tracks) {
      await dbManager.addTrack(track);
    }

    expect(audioManager.tracks).toHaveLength(3);

    // Clear everything
    await dbManager.clearAllTracks();
    audioManager.tracks.length = 0;

    // Refresh should show no tracks
    const saved = await dbManager.getAllTracks();
    saved.forEach((s) => audioManager.addTrackFromBuffer(s));

    expect(audioManager.tracks).toHaveLength(0);
  });
});
