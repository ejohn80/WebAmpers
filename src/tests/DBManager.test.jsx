import {dbManager} from "../managers/DBManager";

/**
 * Helper function to create mock track data.
 * Using a function makes it easy to create unique tracks for each test.
 */
// Place the buffer inside a `segments` array to match current DBManager
// serialization expectations (segment-level buffers are serialized).
const createMockTrack = (id, name, assetId = null) => ({
  id,
  name,
  assetId,
  segments: [
    {
      id: `${id}-seg`,
      assetId,
      buffer: {
        get: () => ({
          numberOfChannels: 2,
          sampleRate: 44100,
          length: 88200,
          duration: 2,
          getChannelData: () => new Float32Array([0.1, 0.2, 0.3]),
        }),
      },
      durationMs: 2000,
    },
  ],
});

describe("DBManager Behavioral Tests", () => {
  // Use a fresh in-memory database for each test
  beforeEach(async () => {
    // Ensure the DB is open and the object store is created before each test
    await dbManager.openDB();
  });

  // Clean up after each test by clearing the database
  afterEach(async () => {
    await dbManager.clearAllTracks();
    if (dbManager.db) {
      dbManager.db.close();
      dbManager.db = null;
    }
  });

  it("should start with an empty list of tracks", async () => {
    const tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(0);
  });

  it("should add a single track and retrieve it", async () => {
    const track1 = createMockTrack(1, "My First Track");

    await dbManager.addTrack(track1);

    const tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("My First Track");
    // Check if segment buffer data was serialized correctly
    expect(tracks[0].segments).toBeDefined();
    expect(tracks[0].segments[0].buffer.sampleRate).toBe(44100);
  });

  it("should add multiple tracks and retrieve them all", async () => {
    const track1 = createMockTrack(1, "First");
    const track2 = createMockTrack(2, "Second");

    await dbManager.addTrack(track1);
    await dbManager.addTrack(track2);

    const tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(2);
    // Note: IndexedDB does not guarantee insertion order for getAll()
    const names = tracks.map((t) => t.name).sort();
    expect(names).toEqual(["First", "Second"]);
  });

  it("should delete a specific track", async () => {
    const track1 = createMockTrack(1, "To Delete");
    const track2 = createMockTrack(2, "To Keep");

    await dbManager.addTrack(track1);
    await dbManager.addTrack(track2);

    // Verify both tracks are there initially
    let tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(2);

    // Delete the first track
    await dbManager.deleteTrack(1);

    // Verify only the second track remains
    tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("To Keep");
    expect(tracks[0].id).toBe(2);
  });

  it("should clear all tracks from the database", async () => {
    const track1 = createMockTrack(1, "Track One");
    const track2 = createMockTrack(2, "Track Two");

    await dbManager.addTrack(track1);
    await dbManager.addTrack(track2);

    // Verify tracks are there
    let tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(2);

    // Clear the database
    await dbManager.clearAllTracks();

    // Verify it's empty
    tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(0);
  });

  it("should handle adding a track without a buffer", async () => {
    const trackWithoutBuffer = {id: 1, name: "Metadata Only"};

    await dbManager.addTrack(trackWithoutBuffer);

    const tracks = await dbManager.getAllTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("Metadata Only");
    // No segments or buffer present for metadata-only track
    expect(tracks[0].segments).toBeUndefined();
  });

  it("preserves session linkage when updating track mute/solo", async () => {
    const track = createMockTrack(1, "Session Track");

    await dbManager.addTrack(track, 123);

    // Update mute without sessionId to simulate UI updates
    await dbManager.updateTrack({
      id: 1,
      name: "Session Track",
      mute: true,
      solo: false,
      segments: track.segments,
    });

    const sessionTracks = await dbManager.getAllTracks(123);
    expect(sessionTracks).toHaveLength(1);
    expect(sessionTracks[0].mute).toBe(true);
  });

  it("stores asset-backed tracks without duplicating buffer data", async () => {
    const track = createMockTrack(5, "Asset Track", 9001);

    await dbManager.addTrack(track, 55);

    const tracks = await dbManager.getAllTracks(55);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].assetId).toBe(9001);
    expect(tracks[0].segments[0].assetId).toBe(9001);
    expect(tracks[0].segments[0].buffer).toBeUndefined();
  });
});
