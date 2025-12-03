import React, {useState, useEffect, useContext, useRef} from "react";
import "./AudioPage.css";
import * as Tone from "tone";

import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import MainContent from "../components/Layout/MainContent";
import Footer from "../components/Layout/Footer";
import {audioManager} from "../managers/AudioManager";
import WebAmpPlayback from "../playback/playback.jsx";
import {dbManager} from "../managers/DBManager";
import {AppContext} from "../context/AppContext";
import {progressStore} from "../playback/progressStore";
import {saveAsset} from "../utils/assetUtils";

const MIN_WIDTH = 0;
const MAX_WIDTH = 300;

// Buffer cache to share audio buffers across tracks from the same asset
const assetBufferCache = new Map(); // assetId -> Tone.ToneAudioBuffer

// Empty version constant for reuse
const EMPTY_VERSION = {
  bpm: 120,
  timeSig: [4, 4],
  lengthMs: 0,
  tracks: [],
  segments: [],
  loop: {enabled: false},
  masterChain: [],
};

function AudioPage() {
  const {setEngineRef, applyEffectsToEngine, activeSession} =
    useContext(AppContext);
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [audioData, setAudioData] = useState(null);
  const [recording, setRecording] = useState({stream: null, startTs: 0});
  const [assetsRefreshTrigger, setAssetsRefreshTrigger] = useState(0);

  const engineRef = React.useRef(null);
  const lastSessionRef = useRef(null);

  // Helper function to deserialize audio buffer from DB format
  const deserializeAudioBuffer = (serializedBuffer) => {
    const audioBuffer = Tone.context.createBuffer(
      serializedBuffer.numberOfChannels,
      serializedBuffer.length,
      serializedBuffer.sampleRate
    );

    for (let i = 0; i < serializedBuffer.numberOfChannels; i++) {
      const channelData = serializedBuffer.channels[i];
      const float32Array =
        channelData instanceof Float32Array
          ? channelData
          : new Float32Array(channelData);
      audioBuffer.copyToChannel(float32Array, i);
    }

    return audioBuffer;
  };

  // Helper function to build version from tracks
  const buildVersionFromTracks = (tracksArray) => {
    if (!tracksArray || tracksArray.length === 0) return null;

    const vs = {
      bpm: 120,
      timeSig: [4, 4],
      lengthMs: 60000,
      tracks: [],
      segments: [],
      loop: {enabled: false},
      masterChain: [],
    };

    let maxEndMs = 0;

    tracksArray.forEach((track) => {
      vs.tracks.push({
        id: track.id,
        name: track.name ?? "Untitled",
        gainDb: typeof track.volume === "number" ? track.volume : 0,
        pan: typeof track.pan === "number" ? track.pan : 0,
        mute: !!track.mute,
        solo: !!track.solo,
        color: track.color || "#888",
        effects: track.effects,
        enabledEffects: track.enabledEffects || {},
        activeEffectsList: track.activeEffectsList,
      });

      (track.segments || []).forEach((s) => {
        const fileUrl = s.buffer ?? s.fileUrl ?? null;
        const startOnTimelineMs =
          s.startOnTimelineMs ??
          (s.startOnTimeline ? Math.round(s.startOnTimeline * 1000) : 0);
        const startInFileMs = s.offset
          ? Math.round(s.offset * 1000)
          : (s.startInFileMs ?? 0);
        const durationMs = s.duration
          ? Math.round(s.duration * 1000)
          : (s.durationMs ?? 0);

        vs.segments.push({
          id: s.id ?? `seg_${Math.random().toString(36).slice(2, 8)}`,
          trackId: track.id,
          fileUrl,
          startOnTimelineMs,
          startInFileMs,
          durationMs,
          gainDb: s.gainDb ?? 0,
          fades: s.fades ?? {inMs: 5, outMs: 5},
        });

        const endMs = startOnTimelineMs + (durationMs || 0);
        if (endMs > maxEndMs) maxEndMs = endMs;
      });
    });

    vs.lengthMs = maxEndMs || 60000;
    return vs;
  };

  // Load tracks for active session
  // Load tracks for active session
  useEffect(() => {
    if (!activeSession) return;

    // Skip if session hasn't changed
    if (lastSessionRef.current === activeSession) return;

    console.log(`[AudioPage] Loading session ${activeSession}`);
    lastSessionRef.current = activeSession;

    const loadSessionTracks = async () => {
      try {
        const savedTracks = await dbManager.getAllTracks(activeSession);
        console.log(
          `[AudioPage] Found ${savedTracks.length} tracks for session ${activeSession}`
        );

        // Clear current tracks
        audioManager.clearAllTracks();

        // Reconstruct tracks from DB
        for (const savedTrack of savedTracks) {
          const maybeBufferData = savedTrack.segments?.[0]?.buffer;

          if (maybeBufferData && maybeBufferData.channels) {
            const audioBuffer = deserializeAudioBuffer(maybeBufferData);

            const trackData = {
              ...savedTrack,
              buffer: new Tone.ToneAudioBuffer(audioBuffer),
              effects: savedTrack.effects,
              enabledEffects: savedTrack.enabledEffects || {},
            };

            audioManager.addTrackFromBuffer(trackData);
          }
        }

        setTracks([...audioManager.tracks]);

        // Reload engine
        const newVersion = buildVersionFromTracks(audioManager.tracks);
        if (engineRef.current) {
          try {
            if (newVersion) {
              await engineRef.current.load(newVersion);
            } else {
              await engineRef.current.load(EMPTY_VERSION);
            }
            console.log("[AudioPage] Engine reloaded");
          } catch (e) {
            console.error("Failed to reload engine:", e);
          }
        }
      } catch (error) {
        console.error("Failed to load session tracks:", error);
      }
    };

    loadSessionTracks();
  }, [activeSession]);

  const toggleSidebar = () => {
    setSidebarWidth((prevWidth) =>
      prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH
    );
  };

  const handleImportSuccess = async (importedAudioData, assetId) => {
    if (!activeSession) {
      console.error("No active session!");
      return;
    }

    console.log(
      `[AudioPage] Creating track from asset ${assetId} in session ${activeSession}`
    );

    // Get the cached buffer if available (should be cached by AssetsTab)
    let toneBuffer = assetId ? assetBufferCache.get(assetId) : null;

    if (!toneBuffer && importedAudioData.buffer) {
      // Fallback: create ToneBuffer from imported buffer if not cached
      console.log("[AudioPage] Buffer not cached, creating new ToneBuffer");
      toneBuffer = new Tone.ToneAudioBuffer(importedAudioData.buffer);
    }

    // Create track data with the buffer and assetId
    const trackData = {
      ...importedAudioData,
      buffer: toneBuffer || importedAudioData.buffer,
      assetId: assetId,
      enabledEffects: importedAudioData.enabledEffects || {}, // Ensure enabledEffects is set
    };

    const createdTrack = audioManager.addTrackFromBuffer(trackData);
    setTracks([...audioManager.tracks]);

    if (audioManager.tracks.length === 1) {
      setAudioData(importedAudioData);
    }

    // Save track to DB with sessionId and assetId
    try {
      if (createdTrack) {
        // Add assetId to the track before saving
        createdTrack.assetId = assetId;

        const assignedId = await dbManager.addTrack(
          createdTrack,
          activeSession
        );
        console.log(
          `Track saved to session ${activeSession} with ID: ${assignedId}, assetId: ${assetId}`
        );

        // Update track ID
        if (assignedId !== undefined && assignedId !== createdTrack.id) {
          createdTrack.id = assignedId;
          setTracks([...audioManager.tracks]);
        }
      }
    } catch (error) {
      console.error("Failed to save track:", error);
    }
  };

  // Handler for File dropdown imports (needs to save to assets first)
  const handleFileDropdownImport = async (importResult) => {
    try {
      console.log("[AudioPage] File dropdown import - saving to assets first");

      const {buffer} = importResult;

      // Save asset to DB (this will handle duplicate names)
      const assetId = await saveAsset(importResult, dbManager);

      // Get the saved asset to retrieve the potentially renamed name
      const savedAsset = await dbManager.getAsset(assetId);
      if (!savedAsset) {
        console.error("Failed to retrieve saved asset");
        return;
      }

      // Update importResult with the actual saved name (may have been renamed for duplicates)
      const updatedImportResult = {
        ...importResult,
        name: savedAsset.name,
        enabledEffects: {}, // Initialize empty enabledEffects
      };

      // Cache the buffer
      if (buffer) {
        const toneBuffer = new Tone.ToneAudioBuffer(buffer);
        assetBufferCache.set(assetId, toneBuffer);
        console.log(`[AudioPage] Cached buffer for asset ${assetId}`);
      }

      // Trigger assets refresh in sidebar
      setAssetsRefreshTrigger((prev) => prev + 1);

      // Now create the track with the assetId and updated name
      await handleImportSuccess(updatedImportResult, assetId);
    } catch (error) {
      console.error("Failed to handle file dropdown import:", error);
      handleImportError(error);
    }
  };

  const handleImportError = (error) => {
    alert(`Import failed: ${error.message}`);
  };

  const handleExportComplete = () => {
    console.log("Export process complete.");
  };

  // Handle dropping an asset from the assets tab to create a new track
  const handleAssetDrop = async (assetId) => {
    try {
      console.log(`Dropping asset ${assetId} to create track`);

      // Get the asset from the database first
      const asset = await dbManager.getAsset(assetId);
      if (!asset) {
        console.error("Asset not found:", assetId);
        alert("Asset not found in database");
        return;
      }

      // Check if we have a cached buffer for this asset
      let toneBuffer = assetBufferCache.get(assetId);

      if (toneBuffer) {
        console.log(`Using cached buffer for asset ${assetId}`);
      } else {
        console.log(`Creating new buffer for asset ${assetId}`);

        const {buffer: serializedBuffer} = asset;

        if (!serializedBuffer || !serializedBuffer.channels) {
          console.error("Asset has no valid buffer data");
          alert("Asset has no valid audio buffer data");
          return;
        }

        console.log("Deserializing buffer:", {
          channels: serializedBuffer.numberOfChannels,
          length: serializedBuffer.length,
          sampleRate: serializedBuffer.sampleRate,
        });

        // Reconstruct AudioBuffer from serialized data using helper
        const audioBuffer = deserializeAudioBuffer(serializedBuffer);
        console.log("AudioBuffer reconstructed successfully");

        // Create a Tone.js buffer from the AudioBuffer and cache it
        toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        assetBufferCache.set(assetId, toneBuffer);
        console.log(
          `Cached buffer for asset ${assetId}, cache size: ${assetBufferCache.size}`
        );
      }

      // Get the serialized buffer for DB storage
      const {buffer: serializedBuffer} = asset;

      // Get the native AudioBuffer from toneBuffer for metadata
      const audioBuffer = toneBuffer.get();

      // Save to database first with current session to get the DB-assigned ID
      const trackData = {
        name: asset.name,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        assetId: assetId,
        enabledEffects: {}, // Initialize empty enabledEffects
        segments: [
          {
            id: `seg_${Date.now()}`,
            buffer: {
              numberOfChannels: audioBuffer.numberOfChannels,
              length: audioBuffer.length,
              sampleRate: audioBuffer.sampleRate,
              duration: audioBuffer.duration,
              channels: serializedBuffer.channels,
            },
            offset: 0,
            duration: audioBuffer.duration,
            durationMs: Math.round(audioBuffer.duration * 1000),
            startOnTimelineMs: 0,
            startInFileMs: 0,
          },
        ],
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
      };

      console.log("Track data for DB:", trackData);

      // Save to database with current session
      const dbId = await dbManager.addTrack(trackData, activeSession);
      console.log("Track saved to DB with ID:", dbId);

      // Now create the track for audioManager with the DB ID and Tone buffer
      const newTrack = {
        id: dbId,
        name: asset.name,
        color: trackData.color,
        buffer: toneBuffer,
        enabledEffects: {}, // Initialize empty enabledEffects
        segments: [
          {
            id: `seg_${Date.now()}`,
            buffer: toneBuffer,
            offset: 0,
            duration: audioBuffer.duration,
            durationMs: Math.round(audioBuffer.duration * 1000),
            startOnTimelineMs: 0,
            startInFileMs: 0,
          },
        ],
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
      };

      console.log("Track object for audioManager:", newTrack);

      // Add to audioManager using addTrackFromBuffer
      const createdTrack = audioManager.addTrackFromBuffer(newTrack);
      console.log("Track added to audioManager:", createdTrack);

      // Update React state
      setTracks([...audioManager.tracks]);

      // Rebuild and reload engine
      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        console.log("Engine reloaded after asset drop");
      }

      console.log("Track created from asset successfully");
    } catch (error) {
      console.error("Failed to create track from asset:", error);
      console.error("Error stack:", error.stack);
      alert(`Failed to create track from asset: ${error.message}`);
    }
  };

  // Handle track deletion with proper cleanup
  const handleDeleteTrack = async (trackId) => {
    try {
      console.log(`Deleting track ${trackId}...`);

      try {
        Tone.Transport.stop();
        Tone.Transport.cancel(0);
        Tone.Transport.seconds = 0;
        console.log("Tone.Transport stopped and reset");
      } catch (e) {
        console.error("Failed to stop Tone.Transport:", e);
      }

      // Dispose engine resources
      if (engineRef.current) {
        try {
          // Unsync and dispose all players
          if (engineRef.current.playersBySegment) {
            engineRef.current.playersBySegment.forEach((playerObj) => {
              try {
                // Unsync from transport
                if (
                  playerObj.player &&
                  typeof playerObj.player.unsync === "function"
                ) {
                  playerObj.player.unsync();
                }
                // Stop the player immediately
                if (
                  playerObj.player &&
                  typeof playerObj.player.stop === "function"
                ) {
                  playerObj.player.stop();
                }
              } catch (e) {
                console.warn("Failed to unsync/stop player:", e);
              }
            });
          }

          // Now dispose all resources
          engineRef.current._disposeAll();
          console.log("All engine resources disposed");
        } catch (e) {
          console.warn("Failed to dispose engine:", e);
        }
      }

      // Delete from audioManager
      const deleted = audioManager.deleteTrack(trackId);

      if (deleted) {
        // Delete from database
        try {
          await dbManager.deleteTrack(trackId);
          console.log(`Track ${trackId} deleted from database`);
        } catch (e) {
          console.warn("Failed to delete track from DB:", e);
        }

        // Update React state to trigger re-render
        setTracks([...audioManager.tracks]);

        // Reset progress store immediately
        try {
          progressStore.setMs(0);
          progressStore.setLengthMs(0);
        } catch (e) {
          console.warn("Failed to reset progress store:", e);
        }

        // Now reload the engine with remaining tracks (or empty state)
        if (audioManager.tracks.length === 0) {
          console.log("No tracks remaining - loading empty version");

          // Force reload with empty version
          if (engineRef.current) {
            try {
              await engineRef.current.load(EMPTY_VERSION);
              console.log("Engine loaded with empty version");
            } catch (e) {
              console.error("Failed to load empty version:", e);
            }
          }
        } else {
          console.log(
            `Reloading engine with ${audioManager.tracks.length} remaining track(s)`
          );

          // Build new version from remaining tracks
          const newVersion = buildVersionFromTracks(audioManager.tracks);

          if (newVersion && engineRef.current) {
            try {
              // Force complete reload
              await engineRef.current.load(newVersion);
              console.log("Engine reloaded successfully");
            } catch (e) {
              console.error("Failed to reload engine after track deletion:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to delete track:", error);
    }
  };

  // Build version object for playback engine
  const version = buildVersionFromTracks(tracks);

  const audioBuffer =
    tracks.length > 0
      ? tracks[0].buffer || tracks[0].segments?.[0]?.buffer
      : null;

  const handleEngineReady = (engine) => {
    engineRef.current = engine;
    setEngineRef(engineRef);

    setTimeout(() => {
      applyEffectsToEngine();
    }, 100);
  };

  // Handle asset deletion - clear from buffer cache
  const handleAssetDelete = (assetId) => {
    if (assetBufferCache.has(assetId)) {
      console.log(`Clearing cached buffer for deleted asset ${assetId}`);
      assetBufferCache.delete(assetId);
    }
  };

  // Generic handler for track property updates (mute, solo, volume, etc.)
  const handleTrackPropertyUpdate = async (
    trackId,
    property,
    value,
    engineMethod
  ) => {
    try {
      // Update engine if method provided
      if (engineMethod && engineRef.current) {
        try {
          engineRef.current[engineMethod](trackId, value);
        } catch (e) {
          console.warn(`Engine ${engineMethod} failed`, e);
        }
      }

      // Find and update track
      const track = audioManager.tracks.find((x) => x.id === trackId);
      if (track) {
        track[property] = value;
        setTracks([...audioManager.tracks]);

        // Persist to database
        try {
          await dbManager.updateTrack(track);
        } catch (e) {
          console.warn(`Failed to persist ${property} change`, e);
        }
      }
    } catch (error) {
      console.error(`Failed to update track ${property}:`, error);
    }
  };

  const mainContentStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  };

  return (
    <div className="app-container">
      <Header
        tracks={tracks}
        totalLengthMs={version?.lengthMs || 0}
        onImportSuccess={handleFileDropdownImport}
        onImportError={handleImportError}
        onExportComplete={handleExportComplete}
      />

      <div className="main-content-area" style={mainContentStyle}>
        <Sidebar
          width={sidebarWidth}
          onImportSuccess={handleImportSuccess}
          onImportError={handleImportError}
          onAssetDelete={handleAssetDelete}
          assetsRefreshTrigger={assetsRefreshTrigger}
          assetBufferCache={assetBufferCache}
        />

        <div
          className="divider"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        />

        <MainContent
          tracks={tracks}
          recording={recording}
          totalLengthMs={version?.lengthMs || 0}
          onAssetDrop={handleAssetDrop}
          onMute={(trackId, muted) =>
            handleTrackPropertyUpdate(trackId, "mute", muted, "setTrackMute")
          }
          onSolo={(trackId, soloed) =>
            handleTrackPropertyUpdate(trackId, "solo", soloed, "setTrackSolo")
          }
          onDelete={handleDeleteTrack}
        />
      </div>

      <Footer
        version={version}
        onRecordComplete={handleImportSuccess}
        onRecordStart={({stream, startTs}) => {
          // STOP PLAYBACK when recording starts
          if (engineRef.current) {
            try {
              engineRef.current.stop();
            } catch (e) {
              console.warn("Failed to stop playback:", e);
            }
          }
          setRecording({stream, startTs});
        }}
        onRecordStop={() => setRecording({stream: null, startTs: 0})}
      />
    </div>
  );
}

export default AudioPage;
