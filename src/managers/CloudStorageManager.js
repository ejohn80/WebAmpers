/**
 * CloudStorageManager.js - Firebase cloud storage integration for DAW projects
 *
 * Handles saving/loading complete DAW sessions to Firebase Cloud Storage with MP3 compression.
 * Manages: session metadata, audio tracks, and assets with efficient storage and duplicate prevention.
 */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
  getMetadata,
} from "firebase/storage";
import {storage} from "../firebase/firebase";
import {dbManager} from "./DBManager";
import ExportManager from "../components/AudioExport/ExportManager";
import * as Tone from "tone";

/**
 * CloudStorageManager - Manages Firebase Cloud Storage operations for DAW sessions
 * Handles saving/loading sessions with MP3-compressed audio assets
 */
class CloudStorageManager {
  constructor() {
    this.STORAGE_PATH = "users"; // Base storage path in Firebase
    this.exportManager = new ExportManager(); // For MP3 encoding/decoding
  }

  /**
   * Decode MP3 blob back to AudioBuffer for playback
   */
  async _decodeMp3(mp3Blob) {
    const arrayBuffer = await mp3Blob.arrayBuffer();
    const audioContext = Tone.context.rawContext;
    return audioContext.decodeAudioData(arrayBuffer);
  }

  // -----------------------------------------------
  // SAVE: session + tracks + assets (with MP3 compression)
  // -----------------------------------------------
  /**
   * Save complete session to Firebase with MP3-compressed assets
   * @param {string} userId - Firebase auth user ID
   * @param {string} projectName - Name for the saved project
   * @returns {string} Download URL of metadata file
   */
  async saveToFirebase(userId, projectName) {
    // Get current session from localStorage
    const sessionId = Number(localStorage.getItem("webamp.activeSession"));
    if (!sessionId) throw new Error("No active session");

    // Load session and tracks from IndexedDB
    const session = await dbManager.getSession(sessionId);
    const tracks = await dbManager.getAllTracks(sessionId);

    // Collect all unique asset IDs from tracks and segments
    const assetIds = new Set();
    tracks.forEach((track) => {
      if (track.assetId) assetIds.add(track.assetId);
      if (track.segments) {
        track.segments.forEach((seg) => {
          if (seg.assetId) assetIds.add(seg.assetId);
        });
      }
    });

    console.log(`Saving ${tracks.length} tracks and ${assetIds.size} assets`);

    // Create timestamped folder path: users/{userId}/saves/{projectName}_{timestamp}
    const folder = `${this.STORAGE_PATH}/${userId}/saves/${projectName}_${Date.now()}`;

    // Save each asset as compressed MP3
    const assetMetadata = [];
    for (const assetId of assetIds) {
      try {
        const asset = await dbManager.getAsset(assetId);
        if (!asset || !asset.buffer) continue;

        // Reconstruct AudioBuffer from IndexedDB serialized format
        const Tone = await import("tone");
        const {numberOfChannels, length, sampleRate, channels} = asset.buffer;

        const nativeBuffer = Tone.context.createBuffer(
          numberOfChannels,
          length,
          sampleRate
        );

        // Copy channel data back to AudioBuffer
        for (let i = 0; i < numberOfChannels; i++) {
          if (channels[i]) {
            const channelData = new Float32Array(channels[i]);
            nativeBuffer.copyToChannel(channelData, i);
          }
        }

        // Compress to MP3 using ExportManager (192kbps for size/quality balance)
        const mp3Blob = this.exportManager.encodeMp3(nativeBuffer, 192);

        // Upload MP3 to Firebase Storage
        const assetRef = ref(storage, `${folder}/assets/${assetId}.mp3`);
        await uploadBytes(assetRef, mp3Blob, {contentType: "audio/mp3"});

        const mp3Url = await getDownloadURL(assetRef);

        // Store metadata for later reconstruction
        assetMetadata.push({
          id: asset.id,
          name: asset.name,
          duration: asset.duration,
          size: asset.size,
          sampleRate: asset.sampleRate,
          channels: asset.channels,
          mp3Url: mp3Url,
          mp3Size: mp3Blob.size,
        });
      } catch (e) {
        console.warn(`Failed to save asset ${assetId}:`, e);
      }
    }

    // Save session metadata as JSON file
    const metadata = new Blob(
      [
        JSON.stringify(
          {
            session,
            tracks,
            assets: assetMetadata,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      ],
      {type: "application/json"}
    );

    const metaRef = ref(storage, `${folder}/metadata.json`);
    await uploadBytes(metaRef, metadata, {contentType: "application/json"});

    return getDownloadURL(metaRef);
  }

  // -----------------------------------------------
  // LOAD: session + tracks + assets (decompress MP3)
  // -----------------------------------------------
  /**
   * Load session from Firebase, decompress MP3 assets
   * @param {string} userId - Firebase auth user ID
   * @param {string} folderName - Name of saved folder
   * @returns {Object} Load stats and new session ID
   */
  async loadFromFirebase(userId, folderName) {
    const folder = `${this.STORAGE_PATH}/${userId}/saves/${folderName}`;
    const metaRef = ref(storage, `${folder}/metadata.json`);

    // Download and parse metadata
    const url = await getDownloadURL(metaRef);
    const data = await fetch(url).then((r) => r.json());

    const {session, tracks, assets = []} = data;

    console.log(`Loading: ${tracks.length} tracks, ${assets.length} assets`);

    // Extract project name from timestamped folder name (remove timestamp)
    const projectName = folderName.replace(/_\d+$/, "");

    // Download and decode MP3 assets, map old IDs to new IDs
    const assetIdMap = new Map(); // oldId → newId
    for (const assetMeta of assets) {
      try {
        const oldId = assetMeta.id;

        // Remove duplicate suffix (e.g., " (2)", " (3)")
        const getBaseName = (name) => {
          return name.replace(/\s*\(\d+\)$/, "").trim();
        };

        const baseNameToFind = getBaseName(assetMeta.name);

        // Check if asset already exists in IndexedDB (avoid duplicates)
        const existingAssets = await dbManager.getAllAssets();
        const existingAsset = existingAssets.find((a) => {
          const existingBaseName = getBaseName(a.name);
          const nameMatch = existingBaseName === baseNameToFind;

          return nameMatch;
        });

        // Use existing asset if found (prevents duplicates)
        if (existingAsset) {
          assetIdMap.set(oldId, existingAsset.id);
          continue;
        }

        // Download MP3 file from Firebase
        const mp3Response = await fetch(assetMeta.mp3Url);
        const mp3Blob = await mp3Response.blob();

        // Decode MP3 back to AudioBuffer
        const audioBuffer = await this._decodeMp3(mp3Blob);

        // Serialize AudioBuffer for IndexedDB storage
        const serializedBuffer = {
          numberOfChannels: audioBuffer.numberOfChannels,
          length: audioBuffer.length,
          sampleRate: audioBuffer.sampleRate,
          duration: audioBuffer.duration,
          channels: [],
        };

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          const channelData = audioBuffer.getChannelData(i);
          serializedBuffer.channels.push(Array.from(channelData));
        }

        // Store in IndexedDB with base name (no duplicate suffix)
        const assetToStore = {
          name: baseNameToFind,
          duration: assetMeta.duration,
          size: assetMeta.size,
          sampleRate: assetMeta.sampleRate,
          channels: assetMeta.channels,
          buffer: serializedBuffer,
          createdAt: assetMeta.createdAt || new Date().toISOString(),
        };

        const newAssetId = await dbManager.addAsset(assetToStore);
        assetIdMap.set(oldId, newAssetId);
        console.log(`✓ Asset created: ${oldId} → ${newAssetId}`);
      } catch (e) {
        console.error("Failed to recreate asset:", e);
      }
    }

    // Create new session with loaded project name
    const newSessionId = await dbManager.createSession(projectName, {
      effects: session.effects || {pitch: 0, volume: 100, reverb: 0},
    });

    // Recreate tracks with new session ID and updated asset IDs
    for (const track of tracks) {
      const clean = {...track};
      delete clean.id; // Remove old ID for new creation
      clean.sessionId = newSessionId;

      // Update asset references using the ID mapping
      if (clean.assetId && assetIdMap.has(clean.assetId)) {
        clean.assetId = assetIdMap.get(clean.assetId);
      }

      // Update segment asset references
      if (clean.segments) {
        clean.segments = clean.segments.map((seg) => ({
          ...seg,
          assetId:
            seg.assetId && assetIdMap.has(seg.assetId)
              ? assetIdMap.get(seg.assetId)
              : seg.assetId,
        }));
      }

      await dbManager.addTrack(clean, newSessionId);
    }

    // Set as active session in localStorage
    localStorage.setItem("webamp.activeSession", String(newSessionId));

    return {
      sessionId: newSessionId,
      sessionName: projectName,
      tracks: tracks.length,
      assets: assets.length,
    };
  }

  /**
   * Quick load from standard "quicksave" folder
   */
  async quickLoad(userId) {
    return this.loadFromFirebase(userId, "quicksave");
  }

  // -----------------------------------------------
  // LIST SAVES
  // -----------------------------------------------
  /**
   * List all saved sessions for a user
   * @param {string} userId - Firebase auth user ID
   * @returns {Array} List of saved sessions sorted by date
   */
  async listSaves(userId) {
    const base = ref(storage, `${this.STORAGE_PATH}/${userId}/saves`);
    const res = await listAll(base);
    const out = [];

    for (const folder of res.prefixes) {
      try {
        const metaRef = ref(storage, `${folder.fullPath}/metadata.json`);
        const meta = await getMetadata(metaRef);

        // Extract clean project name from timestamped folder
        const folderName = folder.name;
        const projectName = folderName.replace(/_\d+$/, "");

        out.push({
          name: folderName,
          projectName: projectName,
          savedAt: meta.timeCreated,
          size: meta.size,
          // url: url // Optionally include direct URL
        });
      } catch (e) {
        console.log(e);
      }
    }

    // Sort by most recent first
    return out.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  // -----------------------------------------------
  // DELETE SAVE
  // -----------------------------------------------
  /**
   * Delete a saved session folder and all contents
   */
  async deleteSave(userId, folderName) {
    const folderRef = ref(
      storage,
      `${this.STORAGE_PATH}/${userId}/saves/${folderName}`
    );

    try {
      const res = await listAll(folderRef);

      // Delete all files in the main folder
      await Promise.all(res.items.map((item) => deleteObject(item)));

      // Delete all files in subfolders (e.g., assets/)
      for (const subFolder of res.prefixes) {
        const subRes = await listAll(subFolder);
        await Promise.all(subRes.items.map((item) => deleteObject(item)));
      }

      console.log(`Deleted all files in ${folderName}`);
      return true;
    } catch (e) {
      console.error(`Failed to delete save ${folderName}:`, e);
      throw e;
    }
  }
}

// Export singleton instance
export const cloudStorageManager = new CloudStorageManager();
