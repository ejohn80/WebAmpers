import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
  getMetadata
} from "firebase/storage";
import { storage } from "../firebase/firebase";
import { dbManager } from "./DBManager";

import * as Tone from "tone";

class CloudStorageManager {
  constructor() {
    this.STORAGE_PATH = "users";
  }

// -----------------------------------------------
// SAVE: session + tracks + assets
// -----------------------------------------------
async saveToFirebase(userId, projectName) {
  const sessionId = Number(localStorage.getItem("webamp.activeSession"));
  if (!sessionId) throw new Error("No active session");

  const session = await dbManager.getSession(sessionId);
  const tracks = await dbManager.getAllTracks(sessionId);
  
  // Get all unique asset IDs from tracks
  const assetIds = new Set();
  tracks.forEach(track => {
    if (track.assetId) assetIds.add(track.assetId);
    if (track.segments) {
      track.segments.forEach(seg => {
        if (seg.assetId) assetIds.add(seg.assetId);
      });
    }
  });

  // Load all assets
  const assets = [];
  for (const assetId of assetIds) {
    try {
      const asset = await dbManager.getAsset(assetId);
      if (asset) {
        // FIX: Convert Float32Arrays to regular arrays for JSON serialization
        if (asset.buffer && asset.buffer.channels) {
          asset.buffer.channels = asset.buffer.channels.map(channel => 
            Array.from(channel) // Convert Float32Array to regular array
          );
        }
        assets.push(asset);
      }
    } catch (e) {
      console.warn(`Failed to load asset ${assetId}:`, e);
    }
  }

  console.log(`Saving ${tracks.length} tracks and ${assets.length} assets`);

  const metadata = new Blob(
    [
      JSON.stringify(
        {
          session,
          tracks,
          assets,
          exportedAt: new Date().toISOString()
        },
        null,
        2
      )
    ],
    { type: "application/json" }
  );

  const folder = `${this.STORAGE_PATH}/${userId}/saves/${projectName}_${Date.now()}`;
  const metaRef = ref(storage, `${folder}/metadata.json`);

  await uploadBytes(metaRef, metadata, { contentType: "application/json" });
  return getDownloadURL(metaRef);
}

// -----------------------------------------------
// LOAD: session + tracks + assets
// -----------------------------------------------
async loadFromFirebase(userId, folderName, clearExisting = true) {
  const folder = `${this.STORAGE_PATH}/${userId}/saves/${folderName}`;
  const metaRef = ref(storage, `${folder}/metadata.json`);

  const url = await getDownloadURL(metaRef);
  const data = await fetch(url).then(r => r.json());

  const { session, tracks, assets = [] } = data;

  console.log(`Loading: ${tracks.length} tracks, ${assets.length} assets`);

  if (clearExisting) {
    await this._clearDB();
  }

  const Tone = await import('tone');

  // First, recreate all assets WITH buffers
  const assetIdMap = new Map();
  for (const asset of assets) {
    try {
      const oldId = asset.id;
      
      // FIX: Convert regular arrays back to Float32Arrays
      if (asset.buffer && asset.buffer.channels) {
        asset.buffer.channels = asset.buffer.channels.map(channel => 
          new Float32Array(channel) // Convert regular array back to Float32Array
        );
      }
      
      // Prepare asset for DB storage (keeps serialized format)
      const assetToStore = {
        name: asset.name,
        duration: asset.duration,
        size: asset.size,
        sampleRate: asset.sampleRate,
        channels: asset.channels,
        buffer: asset.buffer,
        createdAt: asset.createdAt || new Date().toISOString()
      };
      
      delete assetToStore.id;
      
      const newAssetId = await dbManager.addAsset(assetToStore);
      assetIdMap.set(oldId, newAssetId);
      console.log(`Asset recreated: ${oldId} -> ${newAssetId}`);
    } catch (e) {
      console.error("Failed to recreate asset:", e);
    }
  }

  // Recreate session
  const newSessionId = await dbManager.createSession(session.name, {
    effects: session.effects || {pitch: 0, volume: 100, reverb: 0}
  });

  // Recreate tracks with updated asset IDs
  for (const track of tracks) {
    const clean = { ...track };
    delete clean.id;
    clean.sessionId = newSessionId;
    
    if (clean.assetId && assetIdMap.has(clean.assetId)) {
      clean.assetId = assetIdMap.get(clean.assetId);
    }

    if (clean.segments) {
      clean.segments = clean.segments.map(seg => ({
        ...seg,
        assetId: seg.assetId && assetIdMap.has(seg.assetId) 
          ? assetIdMap.get(seg.assetId) 
          : seg.assetId
      }));
    }

    await dbManager.addTrack(clean, newSessionId);
  }

  localStorage.setItem("webamp.activeSession", String(newSessionId));

  return {
    sessionId: newSessionId,
    sessionName: session.name,
    tracks: tracks.length,
    assets: assets.length
  };
}

  async quickLoad(userId) {
    return this.loadFromFirebase(userId, "quicksave");
  }

  // -----------------------------------------------
  // LIST SAVES
  // -----------------------------------------------
  async listSaves(userId) {
    const base = ref(storage, `${this.STORAGE_PATH}/${userId}/saves`);
    const res = await listAll(base);
    const out = [];
  
    for (const folder of res.prefixes) {
      try {
        const metaRef = ref(storage, `${folder.fullPath}/metadata.json`);
        const meta = await getMetadata(metaRef);
        const url = await getDownloadURL(metaRef);
  
        // Extract project name from folder name (remove timestamp)
        const folderName = folder.name;
        const projectName = folderName.replace(/_\d+$/, ''); // Remove timestamp suffix
  
        out.push({
          name: folderName, // Keep full folder name for loading
          projectName: projectName, // Display name without timestamp
          savedAt: meta.timeCreated,
          size: meta.size,
          url
        });
      } catch (_) {}
    }
  
    return out.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  // -----------------------------------------------
  // DELETE SAVE
  // -----------------------------------------------
  async deleteSave(userId, folderName) {
    const folder = ref(storage, `${this.STORAGE_PATH}/${userId}/saves/${folderName}`);
    const res = await listAll(folder);

    await Promise.all(res.items.map(i => deleteObject(i)));
    return true;
  }

  // -----------------------------------------------
  // DB CLEAR (sessions + tracks only)
  // -----------------------------------------------
  // -----------------------------------------------
// DB CLEAR (sessions + tracks + assets)
// -----------------------------------------------
  async _clearDB() {
    const db = await dbManager.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sessions", "tracks", "assets"], "readwrite");

      tx.objectStore("sessions").clear();
      tx.objectStore("tracks").clear();
      tx.objectStore("assets").clear(); // Also clear assets

      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e);
    });
  }
}

export const cloudStorageManager = new CloudStorageManager();
