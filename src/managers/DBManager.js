const DB_NAME = 'WebAmpDB';
const DB_VERSION = 1;
const TRACKS_STORE_NAME = 'tracks';

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
          db.createObjectStore(TRACKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        reject(new Error('Error opening database.'));
      };
    });
  }

  async addTrack(trackData) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      // Prefer to use a `toJSON()` serializer if the object provides one
      // (e.g. AudioTrack.toJSON). Otherwise shallow-copy properties.
      const base = typeof trackData?.toJSON === 'function' ? trackData.toJSON() : { ...trackData };

      // Ensure primitive mixer fields are stored using stable keys.
      const storableTrack = {
        ...base,
        id: base.id ?? trackData.id,
        volume: base.volume ?? trackData.volume ?? base._volumeDb ?? undefined,
        pan: base.pan ?? trackData.pan ?? base._pan ?? undefined,
        mute: typeof base.mute !== 'undefined' ? base.mute : (typeof trackData.mute !== 'undefined' ? trackData.mute : base._mute),
        solo: typeof base.solo !== 'undefined' ? base.solo : (typeof trackData.solo !== 'undefined' ? trackData.solo : base._solo),
      };

      // Convert any segment-level buffers into a storable representation.
      const segments = Array.isArray(base.segments) ? base.segments : (Array.isArray(trackData.segments) ? trackData.segments : []);
      if (segments.length > 0) {
        storableTrack.segments = segments.map((s) => {
          const seg = { ...s };
          // Try to get a native AudioBuffer from possible shapes
          let audioBuffer = null;
          try {
            const candidate = s.buffer || (trackData.segments && trackData.segments.find(ss => ss.id === s.id)?.buffer);
            if (candidate) {
              if (typeof candidate.get === 'function') audioBuffer = candidate.get();
              else if (candidate instanceof AudioBuffer) audioBuffer = candidate;
              else if (candidate._buffer && candidate._buffer instanceof AudioBuffer) audioBuffer = candidate._buffer;
            }
          } catch (e) {
            console.warn('Failed to extract segment AudioBuffer for DB storage:', e);
          }

          if (audioBuffer) {
            const channels = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) channels.push(audioBuffer.getChannelData(i));
            seg.buffer = {
              channels,
              sampleRate: audioBuffer.sampleRate,
              length: audioBuffer.length,
              duration: audioBuffer.duration,
              numberOfChannels: audioBuffer.numberOfChannels,
            };
          } else {
            // If no buffer available, leave buffer as-is (may be a URL) or remove to avoid errors
            if (seg.buffer && typeof seg.buffer === 'object' && !seg.buffer.channels) delete seg.buffer;
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
      const hasId = typeof storableTrack.id !== 'undefined' && storableTrack.id !== null;
      const isClientGeneratedString = hasId && (typeof storableTrack.id === 'string') && /^track_/.test(storableTrack.id);
      if (!hasId || isClientGeneratedString) {
        // Remove id if it's a client-generated string so add() assigns a numeric id
        if (isClientGeneratedString) {
          // shallow copy without id
          const { id, ...withoutId } = storableTrack;
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
        console.error('Error adding track:', event.target.error);
        reject(new Error('Could not add track to the database.'));
      };
    });
  }

  async getAllTracks() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], 'readonly');
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('Error getting all tracks:', event.target.error);
        reject(new Error('Could not retrieve tracks from the database.'));
      };
    });
  }

  async deleteTrack(trackId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      const request = store.delete(trackId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        console.error('Error deleting track:', event.target.error);
        reject(new Error('Could not delete track from the database.'));
      };
    });
  }

  async clearAllTracks() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TRACKS_STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        reject(new Error('Could not clear tracks from the database.'));
      };
    });
  }

  /**
   * Update an existing track record in the database. If the track does not
   * have an `id` it will be added as a new record.
   * @param {object} trackData
   */
  async updateTrack(trackData) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TRACKS_STORE_NAME);

      // Normalize object using toJSON() if available, and convert buffers
      // similarly to addTrack so the stored shape is consistent.
      const base = typeof trackData?.toJSON === 'function' ? trackData.toJSON() : { ...trackData };

      const storable = {
        ...base,
        id: base.id ?? trackData.id,
        volume: base.volume ?? trackData.volume ?? base._volumeDb ?? undefined,
        pan: base.pan ?? trackData.pan ?? base._pan ?? undefined,
        mute: typeof base.mute !== 'undefined' ? base.mute : (typeof trackData.mute !== 'undefined' ? trackData.mute : base._mute),
        solo: typeof base.solo !== 'undefined' ? base.solo : (typeof trackData.solo !== 'undefined' ? trackData.solo : base._solo),
      };

      // Serialize segments similarly to addTrack
      const segments = Array.isArray(base.segments) ? base.segments : (Array.isArray(trackData.segments) ? trackData.segments : []);
      if (segments.length > 0) {
        storable.segments = segments.map((s) => {
          const seg = { ...s };
          let audioBuffer = null;
          try {
            const candidate = s.buffer || (trackData.segments && trackData.segments.find(ss => ss.id === s.id)?.buffer);
            if (candidate) {
              if (typeof candidate.get === 'function') audioBuffer = candidate.get();
              else if (candidate instanceof AudioBuffer) audioBuffer = candidate;
              else if (candidate._buffer && candidate._buffer instanceof AudioBuffer) audioBuffer = candidate._buffer;
            }
          } catch (e) {
            console.warn('Failed to extract segment AudioBuffer for updateTrack:', e);
          }

          if (audioBuffer) {
            const channels = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) channels.push(audioBuffer.getChannelData(i));
            seg.buffer = {
              channels,
              sampleRate: audioBuffer.sampleRate,
              length: audioBuffer.length,
              duration: audioBuffer.duration,
              numberOfChannels: audioBuffer.numberOfChannels,
            };
          } else {
            if (seg.buffer && typeof seg.buffer === 'object' && !seg.buffer.channels) delete seg.buffer;
          }

          return seg;
        });
      }

      const request = store.put(storable);

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => {
        console.error('Error updating track:', event.target.error);
        reject(new Error('Could not update track in the database.'));
      };
    });
  }
}

export const dbManager = new DBManager();
