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

  async addTrack(trackData) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      // Prefer to use a `toJSON()` serializer if the object provides one
      // (e.g. AudioTrack.toJSON). Otherwise shallow-copy properties.
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

      // If the provided track already has an id, use put() so we upsert
      // instead of failing with add() on duplicate keys. However, when the
      // id looks like a client-generated string (e.g. 'track_xxx') prefer to
      // let IndexedDB assign a numeric key (via add) so stored keys remain
      // monotonic and ordering by key reflects insertion order.
      let request;
      const hasId =
        typeof storableTrack.id !== "undefined" && storableTrack.id !== null;
      const isClientGeneratedString =
        hasId &&
        typeof storableTrack.id === "string" &&
        /^track_/.test(storableTrack.id);
      if (!hasId || isClientGeneratedString) {
        // Remove id if it's a client-generated string so add() assigns a numeric id
        if (isClientGeneratedString) {
          // shallow copy without id
          const {id, ...withoutId} = storableTrack;
          request = store.add(withoutId);
        } else {
          request = store.add(storableTrack);
        }
      } else {
        // has a numeric or externally-managed id: upsert with put()
        request = store.put(storableTrack);
      }

      request.onsuccess = (event) => {
        // Return the key (either provided or generated). Callers may want to
        // update their in-memory object to match the DB-assigned key.
        resolve(event.target.result);
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
    const db = await this.openDB(); // <-- Consistent DB opening

    return new Promise((resolve, reject) => {
      // Use the stored constants
      const transaction = db.transaction([TRACKS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(TRACKS_STORE_NAME);
        
      // Serialize the track before storing
      const trackData = this.serializeTrack(track);
        
      const updateRequest = store.put(trackData);

      updateRequest.onsuccess = () => {
        console.log(`Track ${track.id} updated in IndexedDB`);
        // We let the transaction.oncomplete handle the resolve
      };

      updateRequest.onerror = (event) => {
        console.error(`Failed to update track ${track.id}:`, event.target.error);
        reject(new Error("Failed to update track"));
      };

      // Handle the transaction completion/error without closing the persistent DB
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