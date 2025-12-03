const DB_NAME = "WebAmpDB";
const DB_VERSION = 3;
const TRACKS_STORE_NAME = "tracks";
const SESSIONS_STORE_NAME = "sessions";
const ASSETS_STORE_NAME = "assets";

class DBManager {
  constructor() {
    this.db = null;
  }

  serializeBufferForStorage(buffer) {
    if (!buffer) return null;

    const numberOfChannels = buffer.numberOfChannels || buffer.channels?.length;
    if (typeof numberOfChannels !== "number" || numberOfChannels <= 0) {
      return null;
    }

    const sampleRate = buffer.sampleRate ?? buffer._sampleRate ?? 44100;
    const length = buffer.length ?? buffer._length ?? 0;
    const duration = buffer.duration ?? buffer._duration ?? length / sampleRate;

    const channels = [];
    if (typeof buffer.getChannelData === "function") {
      for (let i = 0; i < numberOfChannels; i++) {
        try {
          const channelData = buffer.getChannelData(i);
          channels.push(
            channelData instanceof Float32Array
              ? channelData
              : new Float32Array(channelData)
          );
        } catch (e) {
          console.warn("Failed to read channel data for storage", e);
          channels.push(new Float32Array());
        }
      }
    } else if (Array.isArray(buffer.channels)) {
      for (let i = 0; i < numberOfChannels; i++) {
        const channel = buffer.channels[i] || [];
        channels.push(
          channel instanceof Float32Array
            ? channel
            : new Float32Array(channel)
        );
      }
    } else {
      return null;
    }

    return {
      numberOfChannels,
      length,
      sampleRate,
      duration,
      channels,
    };
  }

  extractBufferCandidate(candidate) {
    if (!candidate) return null;

    if (
      typeof AudioBuffer !== "undefined" &&
      candidate instanceof AudioBuffer
    ) {
      return candidate;
    }

    if (typeof candidate.get === "function") {
      try {
        const result = candidate.get();
        if (result) return result;
      } catch (e) {
        console.warn("Failed to read Tone buffer via get()", e);
      }
    }

    if (candidate.buffer) {
      if (
        typeof AudioBuffer !== "undefined" &&
        candidate.buffer instanceof AudioBuffer
      ) {
        return candidate.buffer;
      }
      if (typeof candidate.buffer.get === "function") {
        try {
          const result = candidate.buffer.get();
          if (result) return result;
        } catch (e) {
          console.warn("Failed to read nested buffer via get()", e);
        }
      }
      if (
        typeof candidate.buffer.numberOfChannels === "number" &&
        typeof candidate.buffer.length === "number"
      ) {
        return candidate.buffer;
      }
    }

    if (
      typeof candidate.numberOfChannels === "number" &&
      typeof candidate.length === "number"
    ) {
      return candidate;
    }

    return null;
  }

  serializeSegmentForStorage(segment, defaultAssetId = null) {
    if (!segment) return null;

    const segAssetId =
      segment.assetId ?? segment.asset?.id ?? defaultAssetId ?? null;

    const serialized = {
      id: segment.id,
      assetId: segAssetId,
      offset:
        typeof segment.offset === "number"
          ? segment.offset
          : typeof segment.startInFileMs === "number"
            ? segment.startInFileMs / 1000
            : undefined,
      duration:
        typeof segment.duration === "number"
          ? segment.duration
          : typeof segment.durationMs === "number"
            ? segment.durationMs / 1000
            : undefined,
      durationMs: segment.durationMs,
      startOnTimelineMs: segment.startOnTimelineMs,
      startInFileMs: segment.startInFileMs,
    };

    if (!serialized.id) {
      serialized.id = `seg_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;
    }

    if (!segAssetId) {
      const bufferCandidate =
        segment.buffer || segment.bufferData || segment.audioBuffer;
      const nativeBuffer = this.extractBufferCandidate(bufferCandidate);
      const buffer = this.serializeBufferForStorage(nativeBuffer);
      if (buffer) {
        serialized.buffer = buffer;
      }
    }

    return serialized;
  }

  serializeSegmentsForStorage(segments = [], defaultAssetId = null) {
    return segments
      .map((segment) =>
        this.serializeSegmentForStorage(segment, defaultAssetId)
      )
      .filter(Boolean);
  }

  async openDB() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create tracks store if doesn't exist
        if (!db.objectStoreNames.contains(TRACKS_STORE_NAME)) {
          const tracksStore = db.createObjectStore(TRACKS_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          // Add index for sessionId to efficiently query tracks by session
          tracksStore.createIndex("sessionId", "sessionId", {unique: false});
        } else if (event.oldVersion < 2) {
          // Upgrade existing store to add sessionId index
          const transaction = event.target.transaction;
          const tracksStore = transaction.objectStore(TRACKS_STORE_NAME);
          if (!tracksStore.indexNames.contains("sessionId")) {
            tracksStore.createIndex("sessionId", "sessionId", {unique: false});
          }
        }

        // Create sessions store
        if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
          db.createObjectStore(SESSIONS_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }

        // Create assets store (v3)
        if (!db.objectStoreNames.contains(ASSETS_STORE_NAME)) {
          const assetsStore = db.createObjectStore(ASSETS_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          assetsStore.createIndex("name", "name", {unique: false});
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
   * @param {number} sessionId - Optional: only clear tracks for a specific session
   */
  async clearAllTracks(sessionId = null) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([TRACKS_STORE_NAME], "readwrite");
        const store = tx.objectStore(TRACKS_STORE_NAME);

        if (sessionId !== null) {
          // Clear only tracks for this session
          const index = store.index("sessionId");
          const request = index.openCursor(IDBKeyRange.only(sessionId));

          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };

          request.onerror = (event) => {
            console.error("Error clearing session tracks:", event.target.error);
            reject(
              new Error("Could not clear session tracks from the database.")
            );
          };
        } else {
          // Clear all tracks
          const req = store.clear();

          req.onsuccess = () => {
            resolve();
          };
          req.onerror = (event) => {
            console.error("Error clearing tracks:", event.target.error);
            reject(new Error("Could not clear tracks from the database."));
          };
        }

        tx.oncomplete = () => {
          // no-op; resolution handled in req.onsuccess
        };
        tx.onerror = (event) => {
          console.error("Transaction failed during clear:", event.target.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  async addTrack(trackData, sessionId = null) {
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
        sessionId: sessionId, // Add sessionId to track
        assetId: trackData.assetId || null, // Add assetId to track for reference
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
        effects: base.effects || trackData.effects || {},
        activeEffectsList:
          base.activeEffectsList || trackData.activeEffectsList || [],
      };

      // Convert any segment-level buffers into a storable representation.
      const segments = Array.isArray(base.segments)
        ? base.segments
        : Array.isArray(trackData.segments)
          ? trackData.segments
          : [];
      if (segments.length > 0) {
        storableTrack.segments = this.serializeSegmentsForStorage(
          segments,
          storableTrack.assetId
        );
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

  async getAllTracks(sessionId = null) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readonly");
      const store = transaction.objectStore(TRACKS_STORE_NAME);

      let request;
      if (sessionId !== null) {
        // Get tracks for specific session
        const index = store.index("sessionId");
        request = index.getAll(sessionId);
      } else {
        // Get all tracks
        request = store.getAll();
      }

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error("Error getting tracks:", event.target.error);
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

      if (typeof trackData.id === "string" && /^track_/.test(trackData.id)) {
        console.error(
          `Cannot update track with client-generated ID: ${trackData.id}`
        );
        reject(
          new Error("Track must have a numeric DB-assigned ID for updates")
        );
        return;
      }

      const existingRequest = store.get(trackData.id);

      existingRequest.onsuccess = () => {
        const existing = existingRequest.result || {};
        const merged = {
          ...existing,
          ...trackData,
          sessionId:
            trackData.sessionId !== undefined && trackData.sessionId !== null
              ? trackData.sessionId
              : existing.sessionId,
          assetId:
            trackData.assetId !== undefined && trackData.assetId !== null
              ? trackData.assetId
              : existing.assetId,
        };

        const updateRequest = store.put(merged);

        updateRequest.onsuccess = () => {
          console.log(`Track ${track.id} updated in IndexedDB`);
        };

        updateRequest.onerror = (event) => {
          console.error(
            `Failed to update track ${track.id}:`,
            event.target.error
          );
          reject(new Error("Failed to update track"));
        };
      };

      existingRequest.onerror = (event) => {
        console.error(
          `Failed to load existing track ${track.id} before update:`,
          event.target.error
        );
        reject(new Error("Failed to read track before update"));
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
      sessionId: track.sessionId ?? track._sessionId,
      assetId: track.assetId ?? track._assetId,
      effects: track.effects || {},
      activeEffectsList: track.activeEffectsList || [],
    };

    const serializedSegments = this.serializeSegmentsForStorage(
      track.segments || [],
      serialized.assetId
    );
    if (serializedSegments.length > 0) {
      serialized.segments = serializedSegments;
    }

    return serialized;
  }

  // ============= SESSION MANAGEMENT =============

  /**
   * Create a new session
   * @param {string} name - Session name
   * @param {Object} data - Optional session data (effects, etc.)
   * @returns {Promise<number>} - Session ID
   */
  async createSession(name, data = {}) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSIONS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(SESSIONS_STORE_NAME);

      const session = {
        name: name.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        effects: data.effects || {pitch: 0, volume: 100, reverb: 0},
      };

      const request = store.add(session);

      request.onsuccess = (event) => {
        const sessionId = event.target.result;
        console.log(`Session created with ID: ${sessionId}`);
        resolve(sessionId);
      };

      request.onerror = (event) => {
        console.error("Error creating session:", event.target.error);
        reject(new Error("Could not create session"));
      };
    });
  }

  /**
   * Get all sessions
   * @returns {Promise<Array>}
   */
  async getAllSessions() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSIONS_STORE_NAME], "readonly");
      const store = transaction.objectStore(SESSIONS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error("Error getting sessions:", event.target.error);
        reject(new Error("Could not retrieve sessions"));
      };
    });
  }

  /**
   * Get a single session by ID
   * @param {number} sessionId
   * @returns {Promise<Object|null>}
   */
  async getSession(sessionId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSIONS_STORE_NAME], "readonly");
      const store = transaction.objectStore(SESSIONS_STORE_NAME);
      const request = store.get(sessionId);

      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };

      request.onerror = (event) => {
        console.error("Error getting session:", event.target.error);
        reject(new Error("Could not retrieve session"));
      };
    });
  }

  /**
   * Update a session
   * @param {number} sessionId
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateSession(sessionId, updates) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSIONS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(SESSIONS_STORE_NAME);

      const getRequest = store.get(sessionId);

      getRequest.onsuccess = (event) => {
        const session = event.target.result;
        if (!session) {
          reject(new Error("Session not found"));
          return;
        }

        const updatedSession = {
          ...session,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const putRequest = store.put(updatedSession);

        putRequest.onsuccess = () => {
          resolve();
        };

        putRequest.onerror = (event) => {
          console.error("Error updating session:", event.target.error);
          reject(new Error("Could not update session"));
        };
      };

      getRequest.onerror = (event) => {
        console.error("Error getting session for update:", event.target.error);
        reject(new Error("Could not retrieve session for update"));
      };
    });
  }

  /**
   * Delete a session and all its tracks
   * @param {number} sessionId
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId) {
    const db = await this.openDB();
    return new Promise(async (resolve, reject) => {
      try {
        // First delete all tracks for this session
        await this.clearAllTracks(sessionId);

        // Then delete the session itself
        const transaction = db.transaction([SESSIONS_STORE_NAME], "readwrite");
        const store = transaction.objectStore(SESSIONS_STORE_NAME);
        const request = store.delete(sessionId);

        request.onsuccess = () => {
          console.log(`Session ${sessionId} deleted`);
          resolve();
        };

        request.onerror = (event) => {
          console.error("Error deleting session:", event.target.error);
          reject(new Error("Could not delete session"));
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Check if a session with given name exists
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async sessionExists(name) {
    const sessions = await this.getAllSessions();
    return sessions.some((s) => s.name.trim() === name.trim());
  }

  // ============= ASSET MANAGEMENT =============

  /**
   * Add an asset (imported audio file) to the database
   * @param {Object} assetData - Asset metadata and buffer
   * @returns {Promise<number>} - Asset ID
   */
  async addAsset(assetData) {
    const db = await this.openDB();

    // Get all existing assets to check for duplicates
    const existingAssets = await this.getAllAssets();
    let baseName = assetData.name || "Untitled";
    let finalName = baseName;

    // Check if name already exists and add number suffix if needed
    const existingNames = new Set(existingAssets.map((a) => a.name));
    if (existingNames.has(finalName)) {
      // Extract base name and extension
      const lastDotIndex = baseName.lastIndexOf(".");
      const nameWithoutExt =
        lastDotIndex > 0 ? baseName.substring(0, lastDotIndex) : baseName;
      const extension =
        lastDotIndex > 0 ? baseName.substring(lastDotIndex) : "";

      // Find next available number
      let counter = 2;
      do {
        finalName = `${nameWithoutExt} (${counter})${extension}`;
        counter++;
      } while (existingNames.has(finalName));

      console.log(
        `Duplicate name detected. Renaming "${baseName}" to "${finalName}"`
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ASSETS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(ASSETS_STORE_NAME);

      const asset = {
        name: finalName,
        duration: assetData.duration,
        size: assetData.size,
        sampleRate: assetData.sampleRate,
        channels: assetData.channels,
        buffer: assetData.buffer, // Store the serialized buffer
        createdAt: new Date().toISOString(),
      };

      const request = store.add(asset);

      request.onsuccess = (event) => {
        const assetId = event.target.result;
        console.log(`Asset created with ID: ${assetId}, name: ${finalName}`);
        resolve(assetId);
      };

      request.onerror = (event) => {
        const error = event.target.error;
        console.error("Error creating asset:", error);
        reject(error || new Error("Could not create asset"));
      };
    });
  }

  /**
   * Get all assets
   * @returns {Promise<Array>}
   */
  async getAllAssets() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ASSETS_STORE_NAME], "readonly");
      const store = transaction.objectStore(ASSETS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error("Error getting assets:", event.target.error);
        reject(new Error("Could not retrieve assets"));
      };
    });
  }

  /**
   * Get a single asset by ID
   * @param {number} assetId
   * @returns {Promise<Object|null>}
   */
  async getAsset(assetId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ASSETS_STORE_NAME], "readonly");
      const store = transaction.objectStore(ASSETS_STORE_NAME);
      const request = store.get(assetId);

      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };

      request.onerror = (event) => {
        console.error("Error getting asset:", event.target.error);
        reject(new Error("Could not retrieve asset"));
      };
    });
  }

  /**
   * Check if an asset is being used by any tracks
   * @param {number} assetId
   * @returns {Promise<boolean>}
   */
  async isAssetInUse(assetId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRACKS_STORE_NAME], "readonly");
      const store = transaction.objectStore(TRACKS_STORE_NAME);

      // Get all tracks
      const request = store.getAll();

      request.onsuccess = (event) => {
        const tracks = event.target.result;

        // Check if any track references this assetId
        const isInUse = tracks.some((track) => track.assetId === assetId);

        resolve(isInUse);
      };

      request.onerror = (event) => {
        console.error("Error checking if asset is in use:", event.target.error);
        reject(new Error("Could not check if asset is in use"));
      };
    });
  }

  /**
   * Update an asset's metadata (e.g., name)
   * @param {number} assetId
   * @param {Object} updates - Object containing fields to update
   * @returns {Promise<void>}
   */
  async updateAsset(assetId, updates) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ASSETS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(ASSETS_STORE_NAME);

      // First get the existing asset
      const getRequest = store.get(assetId);

      getRequest.onsuccess = (event) => {
        const asset = event.target.result;

        if (!asset) {
          reject(new Error(`Asset ${assetId} not found`));
          return;
        }

        // Merge updates into the asset
        const updatedAsset = {...asset, ...updates, id: assetId};

        // Put the updated asset back
        const putRequest = store.put(updatedAsset);

        putRequest.onsuccess = () => {
          console.log(`Asset ${assetId} updated successfully`);
          resolve();
        };

        putRequest.onerror = (event) => {
          console.error("Error updating asset:", event.target.error);
          reject(new Error("Could not update asset"));
        };
      };

      getRequest.onerror = (event) => {
        console.error("Error getting asset for update:", event.target.error);
        reject(new Error("Could not get asset for update"));
      };
    });
  }

  /**
   * Delete an asset
   * @param {number} assetId
   * @returns {Promise<void>}
   */
  async deleteAsset(assetId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ASSETS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(ASSETS_STORE_NAME);
      const request = store.delete(assetId);

      request.onsuccess = () => {
        console.log(`Asset ${assetId} deleted`);
        resolve();
      };

      request.onerror = (event) => {
        console.error("Error deleting asset:", event.target.error);
        reject(new Error("Could not delete asset"));
      };
    });
  }
}

export const dbManager = new DBManager();
