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
      
      // AudioBuffers are not directly storable. We need to extract their raw data.
      const storableTrack = { ...trackData };
      if (trackData.buffer) {
        const audioBuffer = trackData.buffer.get(); // Get AudioBuffer from Tone.ToneAudioBuffer
        const channels = [];
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          channels.push(audioBuffer.getChannelData(i));
        }
        storableTrack.buffer = {
          channels,
          sampleRate: audioBuffer.sampleRate,
          length: audioBuffer.length,
          duration: audioBuffer.duration,
          numberOfChannels: audioBuffer.numberOfChannels,
        };
      }

      const request = store.add(storableTrack);

      request.onsuccess = (event) => {
        resolve(event.target.result); // Returns the new key
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
}

export const dbManager = new DBManager();
