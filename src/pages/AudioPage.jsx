import React, {useState, useEffect, useContext, useRef, useCallback} from "react";
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
import {clipboardManager} from "../managers/ClipboardManager.js";
import {insertSegmentWithSpacing} from "../utils/segmentPlacement";

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
  const {
    setEngineRef,
    applyEffectsToEngine,
    activeSession,
    selectedTrackId,
    setSelectedTrackId,
  } = useContext(AppContext);
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [audioData, setAudioData] = useState(null);
  const [recording, setRecording] = useState({stream: null, startTs: 0});
  const [assetsRefreshTrigger, setAssetsRefreshTrigger] = useState(0);

  const engineRef = React.useRef(null);
  const lastSessionRef = useRef(null);
  const assetPreviewCacheRef = useRef(new Map());

  // Keyboard shortcuts for cut/copy/paste
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if we're in an input or textarea
      const activeElement = document.activeElement;
      const isInputField =
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable;

      // Don't trigger shortcuts if typing in an input field
      if (isInputField) return;

      // Check for Ctrl/Cmd + X (Cut)
      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        e.preventDefault();
        if (selectedTrackId) {
          handleCutTrack();
        }
      }

      // Check for Ctrl/Cmd + C (Copy)
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        if (selectedTrackId) {
          handleCopyTrack();
        }
      }

      // Check for Ctrl/Cmd + V (Paste)
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        if (clipboardManager.hasClipboard()) {
          handlePasteTrack();
        }
      }

      // Check for Backspace or Delete (Delete track)
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (selectedTrackId) {
          handleDeleteTrack(selectedTrackId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTrackId]); // Re-bind when selected track changes

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

  const createToneBufferFromSerialized = (serializedBuffer) => {
    const audioBuffer = deserializeAudioBuffer(serializedBuffer);
    return new Tone.ToneAudioBuffer(audioBuffer);
  };

  const buildToneBufferFromAssetRecord = async (asset) => {
    if (!asset) return null;

    if (asset.buffer?.channels?.length) {
      try {
        return createToneBufferFromSerialized(asset.buffer);
      } catch (error) {
        console.warn(
          `[AudioPage] Failed to deserialize stored buffer for asset ${asset.id}:`,
          error
        );
      }
    }

    if (asset.fileBlob) {
      try {
        const arrayBuffer = await asset.fileBlob.arrayBuffer();
        const audioBuffer =
          await Tone.context.rawContext.decodeAudioData(arrayBuffer);
        return new Tone.ToneAudioBuffer(audioBuffer);
      } catch (error) {
        console.warn(
          `[AudioPage] Failed to decode blob for asset ${asset.id}:`,
          error
        );
      }
    }

    return null;
  };

  const getAssetPreviewInfo = useCallback(
    async (assetId) => {
      if (!assetId) return null;

      if (assetPreviewCacheRef.current.has(assetId)) {
        return assetPreviewCacheRef.current.get(assetId);
      }

      try {
        let toneBuffer = assetBufferCache.get(assetId);

        if (!toneBuffer) {
          const asset = await dbManager.getAsset(assetId);
          if (!asset) return null;
          toneBuffer = await buildToneBufferFromAssetRecord(asset);
          if (toneBuffer) {
            assetBufferCache.set(assetId, toneBuffer);
          }
        }

        if (!toneBuffer) return null;

        const durationSeconds =
          typeof toneBuffer.duration === "number"
            ? toneBuffer.duration
            : toneBuffer._buffer?.duration ?? toneBuffer.get?.()?.duration ?? 0;

        const preview = {durationMs: Math.round(durationSeconds * 1000)};
        assetPreviewCacheRef.current.set(assetId, preview);
        return preview;
      } catch (error) {
        console.error("Failed to load asset preview info:", error);
        return null;
      }
    },
    [buildToneBufferFromAssetRecord]
  );

  // Helper function to generate a unique copy name
  const generateCopyName = (baseName) => {
    const cleanName = baseName.replace(/\s+Copy(\s+\d+)?$/, "");

    // Get all existing track names
    const existingNames = new Set(audioManager.tracks.map((t) => t.name));

    // Try "BaseName Copy" first
    const firstCopyName = `${cleanName} Copy`;
    if (!existingNames.has(firstCopyName)) {
      return firstCopyName;
    }

    // Otherwise, find the next available "Copy N" number
    let counter = 2;
    let newName;
    do {
      newName = `${cleanName} Copy ${counter}`;
      counter++;
    } while (existingNames.has(newName));

    return newName;
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

        const localAssetBufferCache = new Map();
        const getToneBufferForAsset = async (assetId) => {
          if (!assetId) return null;

          if (assetBufferCache.has(assetId)) {
            return assetBufferCache.get(assetId);
          }

          if (localAssetBufferCache.has(assetId)) {
            return localAssetBufferCache.get(assetId);
          }

          try {
            const asset = await dbManager.getAsset(assetId);
            const toneBuffer = await buildToneBufferFromAssetRecord(asset);
            if (toneBuffer) {
              assetBufferCache.set(assetId, toneBuffer);
              localAssetBufferCache.set(assetId, toneBuffer);
              return toneBuffer;
            }
          } catch (e) {
            console.warn(`Failed to load asset ${assetId} for hydration`, e);
          }

          localAssetBufferCache.set(assetId, null);
          return null;
        };

        // Reconstruct tracks from DB
        for (const savedTrack of savedTracks) {
          const hydratedSegments = [];
          if (Array.isArray(savedTrack.segments)) {
            for (const segment of savedTrack.segments) {
              const segAssetId = segment.assetId ?? savedTrack.assetId ?? null;

              let segmentToneBuffer = await getToneBufferForAsset(segAssetId);
              if (!segmentToneBuffer && segment?.buffer?.channels) {
                const audioBuffer = deserializeAudioBuffer(segment.buffer);
                segmentToneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
              }

              if (!segmentToneBuffer) {
                console.warn(
                  `Skipping segment ${segment.id} on track ${savedTrack.id} - missing buffer`
                );
                continue;
              }

              hydratedSegments.push({
                ...segment,
                assetId: segAssetId,
                buffer: segmentToneBuffer,
              });
            }
          }

          let primaryBuffer = hydratedSegments[0]?.buffer ?? null;
          if (!primaryBuffer && savedTrack.assetId) {
            primaryBuffer = await getToneBufferForAsset(savedTrack.assetId);
          }
          if (!primaryBuffer && savedTrack.segments?.length) {
            const fallbackSerialized = savedTrack.segments.find(
              (seg) => seg?.buffer?.channels
            );
            if (fallbackSerialized?.buffer) {
              const audioBuffer = deserializeAudioBuffer(
                fallbackSerialized.buffer
              );
              primaryBuffer = new Tone.ToneAudioBuffer(audioBuffer);
            }
          }

          if (!primaryBuffer) {
            console.warn(
              `[AudioPage] Skipping track ${savedTrack.id} - could not resolve buffer`
            );
            continue;
          }

          const trackData = {
            ...savedTrack,
            buffer: primaryBuffer,
            segments:
              hydratedSegments.length > 0 ? hydratedSegments : undefined,
            effects: savedTrack.effects,
            enabledEffects: savedTrack.enabledEffects || {},
          };

          audioManager.addTrackFromBuffer(trackData);
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

      // Update importResult with the actual saved name
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

  // Handle dropping an asset from the assets tab to create a new track OR append to existing
  const handleAssetDrop = async (
    assetId,
    targetTrackId = null,
    timelinePositionMs = 0
  ) => {
    try {
      console.log(`Dropping asset ${assetId}`, {targetTrackId, timelinePositionMs});

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
        console.log(`Decoding buffer for asset ${assetId}`);
        toneBuffer = await buildToneBufferFromAssetRecord(asset);

        if (!toneBuffer) {
          console.error("Asset has no valid buffer data");
          alert("Asset has no valid audio buffer data");
          return;
        }

        assetBufferCache.set(assetId, toneBuffer);
        console.log(
          `Cached buffer for asset ${assetId}, cache size: ${assetBufferCache.size}`
        );
      }

      // Get the native AudioBuffer from toneBuffer for metadata
      const audioBuffer =
        typeof toneBuffer.get === "function" ? toneBuffer.get() : null;

      if (!audioBuffer) {
        console.error("Tone buffer did not provide an AudioBuffer");
        alert("Asset could not be decoded for playback");
        return;
      }

      const segmentId = `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const durationSeconds = audioBuffer.duration;
      const durationMs = Math.round(durationSeconds * 1000);

      // If targetTrackId is provided, append to existing track
      if (targetTrackId) {
        const track = audioManager.getTrack(targetTrackId);
        if (!track) {
          console.error("Target track not found:", targetTrackId);
          alert("Target track not found");
          return;
        }

        console.log(`Appending segment to track ${targetTrackId} at ${timelinePositionMs}ms`);

        // Create new segment
        const newSegment = {
          id: segmentId,
          assetId,
          buffer: toneBuffer,
          offset: 0,
          duration: durationSeconds,
          durationMs,
          startOnTimelineMs: Math.round(timelinePositionMs),
          startInFileMs: 0,
        };

        // Add segment to track with automatic spacing
        const positionedSegments = insertSegmentWithSpacing(
          track.segments,
          newSegment
        );
        track.segments = positionedSegments;

        // Update in database
        await dbManager.updateTrack(track);
        console.log("Track updated with new segment");

        // Update React state
        setTracks([...audioManager.tracks]);

        // Rebuild and reload engine
        const newVersion = buildVersionFromTracks(audioManager.tracks);
        if (newVersion && engineRef.current) {
          await engineRef.current.load(newVersion);
          console.log("Engine reloaded after segment append");
        }

        console.log("Segment appended to track successfully");
        return;
      }

      // Otherwise, create a new track
      console.log(`Creating new track from asset ${assetId}`);

      // Save to database first with current session to get the DB-assigned ID
      const trackData = {
        name: asset.name,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        assetId: assetId,
        enabledEffects: {}, // Initialize empty enabledEffects
        segments: [
          {
            id: segmentId,
            assetId,
            offset: 0,
            duration: durationSeconds,
            durationMs,
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

      // Now create the track for audioManager
      const newTrack = {
        id: dbId,
        name: asset.name,
        color: trackData.color,
        buffer: toneBuffer,
        enabledEffects: {}, // Initialize empty enabledEffects
        segments: [
          {
            id: segmentId,
            assetId,
            buffer: toneBuffer,
            offset: 0,
            duration: durationSeconds,
            durationMs,
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

      // Add to audioManager
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

  // Handle segment movement within a track
  const handleSegmentMove = async (trackId, segmentIndex, newPositionMs) => {
    try {
      console.log(`Moving segment ${segmentIndex} in track ${trackId} to ${newPositionMs}ms`);

      const track = audioManager.getTrack(trackId);
      if (!track || !track.segments || !track.segments[segmentIndex]) {
        console.error("Track or segment not found");
        return;
      }

      const segment = track.segments[segmentIndex];
      const bufferRef = segment.buffer;
      const assetId = segment.assetId ?? track.assetId ?? null;

      const safeNewPosition = Math.max(0, Math.round(newPositionMs));

      const updatedSegment = {
        ...segment,
        startOnTimelineMs: safeNewPosition,
        startOnTimeline: safeNewPosition / 1000,
        buffer: bufferRef || segment.buffer,
        assetId: segment.assetId || assetId,
      };

      const remainingSegments = track.segments.filter(
        (_seg, idx) => idx !== segmentIndex
      );

      const normalizedSegments = insertSegmentWithSpacing(
        remainingSegments,
        updatedSegment
      );

      track.segments = normalizedSegments;

      console.log("[handleSegmentMove] After spacing", {
        segmentId: updatedSegment.id,
        requestedStart: safeNewPosition,
        appliedStart:
          normalizedSegments.find((seg) => seg.id === updatedSegment.id)
            ?.startOnTimelineMs,
      });

      await dbManager.updateTrack(track);
      console.log("Segment position updated in database");

      setTracks([...audioManager.tracks]);

      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion) {
        console.log(
          "[handleSegmentMove] Version segments",
          newVersion.segments.map((seg) => ({
            id: seg.id,
            trackId: seg.trackId,
            startOnTimelineMs: seg.startOnTimelineMs,
            hasFileUrl: !!seg.fileUrl,
          }))
        );
      }

      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        console.log("Engine reloaded after segment move");
      }
    } catch (error) {
      console.error("Failed to move segment:", error);
      alert(`Failed to move segment: ${error.message}`);
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
                if (
                  playerObj.player &&
                  typeof playerObj.player.unsync === "function"
                ) {
                  playerObj.player.unsync();
                }
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

        // Deselect if this was the selected track
        if (selectedTrackId === trackId) {
          setSelectedTrackId(null);
        }

        // Update React state
        setTracks([...audioManager.tracks]);

        // Reset progress store
        try {
          progressStore.setMs(0);
          progressStore.setLengthMs(0);
        } catch (e) {
          console.warn("Failed to reset progress store:", e);
        }

        // Reload engine
        if (audioManager.tracks.length === 0) {
          console.log("No tracks remaining - loading empty version");

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

          const newVersion = buildVersionFromTracks(audioManager.tracks);

          if (newVersion && engineRef.current) {
            try {
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

  // Cut selected track to clipboard
  const handleCutTrack = async () => {
    if (!selectedTrackId) {
      console.warn("No track selected for cut");
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      console.warn("Selected track not found");
      return;
    }

    // Get the track from DB to ensure we have the assetId
    try {
      const allTracks = await dbManager.getAllTracks(activeSession);
      const dbTrack = allTracks.find((t) => t.id === selectedTrackId);

      if (dbTrack && dbTrack.assetId) {
        // Merge the assetId into the track object
        track.assetId = dbTrack.assetId;
      }

      console.log(`Track being cut - assetId: ${track.assetId}`);
    } catch (error) {
      console.warn("Failed to retrieve assetId from DB:", error);
    }

    // Copy to clipboard
    clipboardManager.setClipboard(track, "cut");

    // Delete the track
    await handleDeleteTrack(selectedTrackId);

    console.log(`Track cut to clipboard: ${track.name}`);
  };

  // Copy selected track to clipboard
  const handleCopyTrack = async () => {
    if (!selectedTrackId) {
      console.warn("No track selected for copy");
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      console.warn("Selected track not found");
      return;
    }

    // Get the track from DB to ensure we have the assetId
    try {
      const allTracks = await dbManager.getAllTracks(activeSession);
      const dbTrack = allTracks.find((t) => t.id === selectedTrackId);

      if (dbTrack && dbTrack.assetId) {
        // Merge the assetId into the track object
        track.assetId = dbTrack.assetId;
      }

      console.log(`Track being copied - assetId: ${track.assetId}`);
    } catch (error) {
      console.warn("Failed to retrieve assetId from DB:", error);
    }

    // Copy to clipboard
    clipboardManager.setClipboard(track, "copy");

    console.log(`Track copied to clipboard: ${track.name}`);
  };

  // Paste track from clipboard
  const handlePasteTrack = async () => {
    const clipboardData = clipboardManager.getClipboard();

    if (!clipboardData) {
      console.warn("No track in clipboard to paste");
      return;
    }

    const {trackData} = clipboardData;

    console.log("Clipboard data:", clipboardData);
    console.log("Track data assetId:", trackData.assetId);

    if (!trackData.assetId) {
      console.error("Cannot paste track without assetId");
      console.error("Full track data:", trackData);
      alert(
        "Cannot paste track: missing asset reference. This may happen if the track was created before the clipboard system was implemented."
      );
      return;
    }

    try {
      // Get the asset from database
      const asset = await dbManager.getAsset(trackData.assetId);
      if (!asset) {
        console.error("Asset not found for clipboard track");
        alert("Cannot paste track: source asset not found");
        return;
      }

      // Get or create cached buffer
      let toneBuffer = assetBufferCache.get(trackData.assetId);

      if (!toneBuffer) {
        console.log(
          `Creating buffer for pasted track from asset ${trackData.assetId}`
        );
        const {buffer: serializedBuffer} = asset;

        if (!serializedBuffer || !serializedBuffer.channels) {
          console.error("Asset has no valid buffer data");
          alert("Cannot paste track: asset has no audio data");
          return;
        }

        const audioBuffer = deserializeAudioBuffer(serializedBuffer);
        toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        assetBufferCache.set(trackData.assetId, toneBuffer);
      }

      // Get serialized buffer for DB
      const {buffer: serializedBuffer} = asset;
      const audioBuffer = toneBuffer.get();

      // Generate a unique copy name
      const copyName = generateCopyName(trackData.name);

      // Create new track with pasted data
      const newTrackData = {
        name: copyName,
        color: trackData.color || `hsl(${Math.random() * 360}, 70%, 50%)`,
        assetId: trackData.assetId,
        volume: trackData.volume ?? 0,
        pan: trackData.pan ?? 0,
        mute: trackData.mute ?? false,
        solo: trackData.solo ?? false,
        effects: trackData.effects || {},
        activeEffectsList: trackData.activeEffectsList || [],
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
      };

      // Save to database
      const dbId = await dbManager.addTrack(newTrackData, activeSession);
      console.log("Pasted track saved to DB with ID:", dbId);

      // Create track for audioManager
      const pastedTrack = {
        id: dbId,
        name: copyName,
        color: newTrackData.color,
        buffer: toneBuffer,
        assetId: trackData.assetId,
        volume: newTrackData.volume,
        pan: newTrackData.pan,
        mute: newTrackData.mute,
        solo: newTrackData.solo,
        effects: newTrackData.effects,
        activeEffectsList: newTrackData.activeEffectsList,
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
      };

      // Add to audioManager
      audioManager.addTrackFromBuffer(pastedTrack);

      // Update React state
      setTracks([...audioManager.tracks]);

      // Reload engine
      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        console.log("Engine reloaded after paste");
      }

      console.log("Track pasted successfully");
    } catch (error) {
      console.error("Failed to paste track:", error);
      alert(`Failed to paste track: ${error.message}`);
    }
  };

  // Handle asset deletion - clear from buffer cache and clipboard
  const handleAssetDelete = (assetId) => {
    if (assetBufferCache.has(assetId)) {
      console.log(`Clearing cached buffer for deleted asset ${assetId}`);
      assetBufferCache.delete(assetId);
    }

    // Clear clipboard if it references this asset
    if (clipboardManager.isAssetInClipboard(assetId)) {
      console.log(`Clearing clipboard - referenced deleted asset ${assetId}`);
      clipboardManager.clearClipboard();
    }
  };

  // Generic handler for track property updates
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

  return (
    <div className="app-container">
      <Header
        tracks={tracks}
        totalLengthMs={version?.lengthMs || 0}
        onImportSuccess={handleFileDropdownImport}
        onImportError={handleImportError}
        onExportComplete={handleExportComplete}
        onCutTrack={handleCutTrack}
        onCopyTrack={handleCopyTrack}
        onPasteTrack={handlePasteTrack}
        selectedTrackId={selectedTrackId}
        hasClipboard={clipboardManager.hasClipboard()}
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
          requestAssetPreview={getAssetPreviewInfo}
          onAssetDrop={handleAssetDrop}
          onSegmentMove={handleSegmentMove}
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
