const DB_NAME = "WebAmpDB";
const DB_VERSION = 1;
const TRACKS_STORE_NAME = "tracks";

class DBManager {
  constructor() {
    this.db = null;
  }

  async openDB() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(TRACKS_STORE_NAME)) {
          db.createObjectStore(TRACKS_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("Database error:", event.target.error);
        reject(new Error("Error opening database."));
      };
    });
  }

  /**
   * Remove all tracks from the database (used by tests and reset flows)
   */
  async clearAllTracks() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([TRACKS_STORE_NAME], "readwrite");
        const store = tx.objectStore(TRACKS_STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => {
          resolve();
        };
        req.onerror = (event) => {
          console.error("Error clearing tracks:", event.target.error);
          reject(new Error("Could not clear tracks from the database."));
        };

        tx.oncomplete = () => {
          // no-op; resolution handled in req.onsuccess
        };
        tx.onerror = (event) => {
          console.error("Transaction failed during clear:", event.target.error);
          // If store.clear() already errored, req.onerror has handled reject
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  async addTrack(trackData) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      
      // Prefer to use a `toJSON()` serializer if the object provides one
      const base =
        typeof trackData?.toJSON === "function"
          ? trackData.toJSON()
          : {...trackData};

      // Ensure primitive mixer fields are stored using stable keys.
      const storableTrack = {
        ...base,
        id: base.id ?? trackData.id,
        volume: base.volume ?? trackData.volume ?? base._volumeDb ?? undefined,
        pan: base.pan ?? trackData.pan ?? base._pan ?? undefined,
        mute:
          typeof base.mute !== "undefined"
            ? base.mute
            : typeof trackData.mute !== "undefined"
              ? trackData.mute
              : base._mute,
        solo:
          typeof base.solo !== "undefined"
            ? base.solo
            : typeof trackData.solo !== "undefined"
              ? trackData.solo
              : base._solo,
      };

      // Convert any segment-level buffers into a storable representation.
      const segments = Array.isArray(base.segments)
        ? base.segments
        : Array.isArray(trackData.segments)
          ? trackData.segments
          : [];
      if (segments.length > 0) {
        storableTrack.segments = segments.map((s) => {
          const seg = {...s};
          // Try to get a native AudioBuffer from possible shapes
          let audioBuffer = null;
          try {
            const candidate =
              s.buffer ||
              (trackData.segments &&
                trackData.segments.find((ss) => ss.id === s.id)?.buffer);
            if (candidate) {
              if (typeof candidate.get === "function")
                audioBuffer = candidate.get();
              else if (candidate instanceof AudioBuffer)
                audioBuffer = candidate;
              else if (
                candidate._buffer &&
                candidate._buffer instanceof AudioBuffer
              )
                audioBuffer = candidate._buffer;
            }
          } catch (e) {
            console.warn(
              "Failed to extract segment AudioBuffer for DB storage:",
              e
            );
          }

          if (audioBuffer) {
            const channels = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++)
              channels.push(audioBuffer.getChannelData(i));
            seg.buffer = {
              channels,
              sampleRate: audioBuffer.sampleRate,
              length: audioBuffer.length,
              duration: audioBuffer.duration,
              numberOfChannels: audioBuffer.numberOfChannels,
            };
          } else {
            // If no buffer available, leave buffer as-is (may be a URL) or remove to avoid errors
            if (
              seg.buffer &&
              typeof seg.buffer === "object" &&
              !seg.buffer.channels
            )
              delete seg.buffer;
          }

          return seg;
        });
      }

      // FIX: Always let IndexedDB assign the ID for new tracks
      // Remove any client-generated string ID so IndexedDB assigns a numeric one
      const hasId =
        typeof storableTrack.id !== "undefined" && storableTrack.id !== null;
      const isClientGeneratedString =
        hasId &&
        typeof storableTrack.id === "string" &&
        /^track_/.test(storableTrack.id);
      
      let request;
      if (isClientGeneratedString || !hasId) {
        // Remove the client-generated ID so IndexedDB assigns a numeric one
        const {id, ...withoutId} = storableTrack;
        request = store.add(withoutId);
      } else if (typeof storableTrack.id === "number") {
        // Numeric ID: try to update existing record, or add if it doesn't exist
        request = store.put(storableTrack);
      } else {
        // String ID that's not client-generated: use put
        request = store.put(storableTrack);
      }

      request.onsuccess = (event) => {
        // Return the key (either provided or generated)
        const assignedId = event.target.result;
        console.log(`Track saved to IndexedDB with ID: ${assignedId}`);
        resolve(assignedId);
      };

      request.onerror = (event) => {
        console.error("Error adding track:", event.target.error);
        reject(new Error("Could not add track to the database."));
      };
    });
  }

  async getAllTracks() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readonly");
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error("Error getting all tracks:", event.target.error);
        reject(new Error("Could not retrieve tracks from the database."));
      };
    });
  }

  /**
   * Delete a track from IndexedDB
   */
  async deleteTrack(trackId) {
    const db = await this.openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      
      const deleteRequest = store.delete(trackId);

      deleteRequest.onsuccess = () => {
        console.log(`Track ${trackId} deleted from IndexedDB`);
        resolve(true);
      };

      deleteRequest.onerror = () => {
        console.error(`Failed to delete track ${trackId}`);
        reject(new Error("Failed to delete track"));
      };

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        reject(new Error("Transaction failed"));
      };
    });
  }


  /**
   * Update an existing track in IndexedDB
   * @param {AudioTrack} track - The track to update
   * @returns {Promise<void>}
   */
  async updateTrack(track) {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(TRACKS_STORE_NAME);
        
      // Serialize the track before storing
      const trackData = this.serializeTrack(track);
      
      // FIX: Ensure we're using a numeric ID for updates
      // If the track has a client-generated string ID, we have a problem
      if (typeof trackData.id === "string" && /^track_/.test(trackData.id)) {
        console.error(`Cannot update track with client-generated ID: ${trackData.id}`);
        reject(new Error("Track must have a numeric DB-assigned ID for updates"));
        return;
      }
        
      const updateRequest = store.put(trackData);

      updateRequest.onsuccess = () => {
        console.log(`Track ${track.id} updated in IndexedDB`);
      };

      updateRequest.onerror = (event) => {
        console.error(`Failed to update track ${track.id}:`, event.target.error);
        reject(new Error("Failed to update track"));
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => {
        console.error("Transaction failed during update:", event.target.error);
        reject(new Error("Transaction failed"));
      };
    });
  }

  /**
   * Helper to serialize a track for storage
   * @param {AudioTrack} track
   * @returns {Object} Serializable track data
   */
  serializeTrack(track) {
    const serialized = {
      id: track.id,
      name: track.name,
      color: track.color,
      volume: track.volume,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
      order: track.order ?? 0,
      segments: [],
    };

    // Serialize segments with buffer data
    (track.segments || []).forEach((seg) => {
      const segData = {
        id: seg.id,
        offset: seg.offset,
        duration: seg.duration,
        durationMs: seg.durationMs,
        startOnTimelineMs: seg.startOnTimelineMs,
        startInFileMs: seg.startInFileMs,
      };

      // Serialize the audio buffer
      if (seg.buffer) {
        const buffer = seg.buffer.get ? seg.buffer.get() : seg.buffer;
        if (buffer) {
          const channels = [];
          for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
          }

          segData.buffer = {
            numberOfChannels: buffer.numberOfChannels,
            length: buffer.length,
            sampleRate: buffer.sampleRate,
            channels: channels,
          };
        }
      }

      serialized.segments.push(segData);
    });

    return serialized;
  }
}

export const dbManager = new DBManager();