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
import ExportManager from "../components/AudioExport/ExportManager";

class CloudStorageManager {
  constructor() {
    this.STORAGE_PATH = "users";
    this.exportManager = new ExportManager();
  }

  /**
   * Decode MP3 blob back to AudioBuffer
   */
  async _decodeMp3(mp3Blob) {
    const arrayBuffer = await mp3Blob.arrayBuffer();
    const Tone = await import('tone');
    const audioContext = Tone.context.rawContext;
    return audioContext.decodeAudioData(arrayBuffer);
  }

  // -----------------------------------------------
  // SAVE: session + tracks + assets (with MP3 compression)
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

    console.log(`Saving ${tracks.length} tracks and ${assetIds.size} assets`);

    const folder = `${this.STORAGE_PATH}/${userId}/saves/${projectName}_${Date.now()}`;

    // Save each asset as compressed MP3
    const assetMetadata = [];
    for (const assetId of assetIds) {
      try {
        const asset = await dbManager.getAsset(assetId);
        if (!asset || !asset.buffer) continue;

        // Reconstruct AudioBuffer from serialized format
        const Tone = await import('tone');
        const { numberOfChannels, length, sampleRate, channels } = asset.buffer;
        
        const nativeBuffer = Tone.context.createBuffer(
          numberOfChannels,
          length,
          sampleRate
        );
        
        for (let i = 0; i < numberOfChannels; i++) {
          if (channels[i]) {
            const channelData = new Float32Array(channels[i]);
            nativeBuffer.copyToChannel(channelData, i);
          }
        }

        // Compress to MP3 using ExportManager (use lower bitrate for smaller files)
        const mp3Blob = this.exportManager.encodeMp3(nativeBuffer, 96);
        
        // Upload MP3 to Firebase
        const assetRef = ref(storage, `${folder}/assets/${assetId}.mp3`);
        await uploadBytes(assetRef, mp3Blob, { contentType: "audio/mp3" });
        
        const mp3Url = await getDownloadURL(assetRef);
        
        // Store metadata without the full buffer
        assetMetadata.push({
          id: asset.id,
          name: asset.name,
          duration: asset.duration,
          size: asset.size,
          sampleRate: asset.sampleRate,
          channels: asset.channels,
          mp3Url: mp3Url, // Reference to MP3 file
          mp3Size: mp3Blob.size
        });
        
        console.log(`Compressed asset ${assetId}: ${(asset.size / 1024).toFixed(1)}KB → ${(mp3Blob.size / 1024).toFixed(1)}KB`);
      } catch (e) {
        console.warn(`Failed to save asset ${assetId}:`, e);
      }
    }

    // Save session metadata (much smaller now)
    const metadata = new Blob(
      [
        JSON.stringify(
          {
            session,
            tracks,
            assets: assetMetadata, // Only metadata, not buffers
            exportedAt: new Date().toISOString()
          },
          null,
          2
        )
      ],
      { type: "application/json" }
    );

    const metaRef = ref(storage, `${folder}/metadata.json`);
    await uploadBytes(metaRef, metadata, { contentType: "application/json" });
    
    return getDownloadURL(metaRef);
  }

  // -----------------------------------------------
  // LOAD: session + tracks + assets (decompress MP3)
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

    // Download and decode MP3 assets
    const assetIdMap = new Map();
    for (const assetMeta of assets) {
      try {
        const oldId = assetMeta.id;
        
        // Download MP3 file
        const mp3Response = await fetch(assetMeta.mp3Url);
        const mp3Blob = await mp3Response.blob();
        
        // Decode MP3 to AudioBuffer
        const audioBuffer = await this._decodeMp3(mp3Blob);
        
        // Serialize AudioBuffer for IndexedDB storage
        const serializedBuffer = {
          numberOfChannels: audioBuffer.numberOfChannels,
          length: audioBuffer.length,
          sampleRate: audioBuffer.sampleRate,
          duration: audioBuffer.duration,
          channels: []
        };
        
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          const channelData = audioBuffer.getChannelData(i);
          serializedBuffer.channels.push(Array.from(channelData));
        }
        
        // Store asset in IndexedDB with serialized buffer
        const assetToStore = {
          name: assetMeta.name,
          duration: assetMeta.duration,
          size: assetMeta.size,
          sampleRate: assetMeta.sampleRate,
          channels: assetMeta.channels,
          buffer: serializedBuffer,
          createdAt: assetMeta.createdAt || new Date().toISOString()
        };
        
        const newAssetId = await dbManager.addAsset(assetToStore);
        assetIdMap.set(oldId, newAssetId);
        console.log(`Asset recreated: ${oldId} → ${newAssetId} (from MP3)`);
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
        const projectName = folderName.replace(/_\d+$/, '');
  
        out.push({
          name: folderName,
          projectName: projectName,
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
  async _clearDB() {
    const db = await dbManager.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sessions", "tracks", "assets"], "readwrite");

      tx.objectStore("sessions").clear();
      tx.objectStore("tracks").clear();
      tx.objectStore("assets").clear();

      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e);
    });
  }
}

export const cloudStorageManager = new CloudStorageManager();
