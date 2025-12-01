import React, {useState, useEffect, useContext, useRef, useCallback} from "react";
import "./AudioPage.css";
import * as Tone from "tone";

import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import MainContent from "../components/Layout/MainContent";
import Footer from "../components/Layout/Footer";
import {audioManager} from "../managers/AudioManager";
import {dbManager} from "../managers/DBManager";
import {AppContext} from "../context/AppContext";
import {progressStore} from "../playback/progressStore";
<<<<<<< HEAD
=======
import {saveAsset} from "../utils/assetUtils";
>>>>>>> d47ff52022aa90befcc52ac621f0df39233650c3

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
<<<<<<< HEAD
  const [trimBuffer, setTrimBuffer] = useState([]);
  const [selection, setSelection] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [editAction, setEditAction] = useState("trim"); // "trim" or "cut"
  const [selectedTrackId, setSelectedTrackId] = useState(null);
=======
  const [assetsRefreshTrigger, setAssetsRefreshTrigger] = useState(0);
>>>>>>> d47ff52022aa90befcc52ac621f0df39233650c3

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
        activeEffectsList: track.activeEffectsList,
      });

      (track.segments || []).forEach((s) => {
        const fileUrl = s.buffer ?? s.fileUrl ?? null;
        // Prefer explicit millisecond fields from editing (cut/trim) over legacy fields
        const startOnTimelineMs =
          typeof s.startOnTimelineMs === "number"
            ? s.startOnTimelineMs
            : s.startOnTimeline
              ? Math.round(s.startOnTimeline * 1000)
              : 0;

        const startInFileMs =
          typeof s.startInFileMs === "number"
            ? s.startInFileMs
            : s.offset
              ? Math.round(s.offset * 1000)
              : 0;

        const durationMs =
          typeof s.durationMs === "number" && s.durationMs > 0
            ? s.durationMs
            : s.duration
              ? Math.round(s.duration * 1000)
              : 0;

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
              effects: savedTrack.effects, // Ensure effects are loaded into the Track model
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
      assetId: assetId, // Store reference to source asset
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
        name: savedAsset.name, // Use the name from DB which may include (2), (3), etc.
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
        assetId: assetId, // Store reference to source asset
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
        buffer: toneBuffer, // Add buffer at top level for audioManager
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

  // Convenience: current timeline length in ms
  const timelineLengthMs = version?.lengthMs || 0;

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

  // --- TRIM / CUT selection tool (segment-based) ---
  const applySelectionEdit  = async (targetTrackId, mode = "trim") => {
    if (!audioManager || !audioManager.tracks?.length) return false;

    if (!selectedTrackId) {
      alert("Please click a track to select it before editing.");
      return false;
    }

    if (
      !selection ||
      typeof selection.startMs !== "number" ||
      typeof selection.endMs !== "number"
    ) {
      console.warn("Selection edit: no selection defined.");
      return false;
    }

    // Normalize selection window (in timeline ms)
    let selStart = Math.min(selection.startMs, selection.endMs);
    let selEnd = Math.max(selection.startMs, selection.endMs);
    if (selStart < 0) selStart = 0;

    const idx = audioManager.tracks.findIndex((t) => t.id === selectedTrackId);
    if (idx === -1) {
      console.warn("Selection edit: track not found.");
      return false;
    }

    const track = audioManager.tracks[idx];

    // Work from existing segments; if none, synthesize a single full-length segment
    let baseSegments = Array.isArray(track.segments) ? track.segments : [];
    if (baseSegments.length === 0) {
      const buf =
        track.buffer ||
        (Array.isArray(track.segments) && track.segments[0]?.buffer) ||
        null;
      if (buf && typeof buf.duration === "number" && buf.duration > 0) {
        const durMs = buf.duration * 1000;
        baseSegments = [
          {
            id: `${track.id}_seg0`,
            trackId: track.id,
            buffer: buf,
            fileUrl: null,
            startOnTimelineMs: 0,
            startInFileMs: 0,
            durationMs: durMs,
            gainDb: 0,
            fades: { inMs: 5, outMs: 5 },
          },
        ];
      }
    }

    if (!baseSegments.length) {
      console.warn("Selection edit: track has no segments or buffer.");
      return false;
    }

    const newSegments = [];
    const removedPieces = [];

    // Helper: push a cloned sub-segment
    const pushSegmentSlice = (sourceSeg, sliceStartMs, sliceEndMs, newTimelineStart) => {
      const srcStart = sourceSeg.startOnTimelineMs || 0;
      const srcFileStartMs = sourceSeg.startInFileMs || 0;

      const clampedStart = Math.max(srcStart, sliceStartMs);
      const clampedEnd = Math.min(srcStart + (sourceSeg.durationMs || 0), sliceEndMs);
      if (clampedEnd <= clampedStart) return;

      const offsetIntoSeg = clampedStart - srcStart;
      const newStartInFileMs = srcFileStartMs + offsetIntoSeg;
      const newDurationMs = clampedEnd - clampedStart;

      newSegments.push({
        ...sourceSeg,
        // keep buffer/fileUrl/gain/fades etc
        startOnTimelineMs: newTimelineStart,
        startInFileMs: newStartInFileMs,
        durationMs: newDurationMs,
      });
    };

    // Helper for removed pieces buffer (optional)
    const pushRemovedSlice = (sourceSeg, sliceStartMs, sliceEndMs) => {
      const srcStart = sourceSeg.startOnTimelineMs || 0;
      const srcFileStartMs = sourceSeg.startInFileMs || 0;

      const clampedStart = Math.max(srcStart, sliceStartMs);
      const clampedEnd = Math.min(srcStart + (sourceSeg.durationMs || 0), sliceEndMs);
      if (clampedEnd <= clampedStart) return;

      const offsetIntoSeg = clampedStart - srcStart;
      const newStartInFileMs = srcFileStartMs + offsetIntoSeg;
      const newDurationMs = clampedEnd - clampedStart;

      removedPieces.push({
        ...sourceSeg,
        startOnTimelineMs: clampedStart,
        startInFileMs: newStartInFileMs,
        durationMs: newDurationMs,
      });
    };

    if (mode === "trim") {
      // ======== TRIM: keep only [selStart, selEnd], re-based so selStart → 0 ========
      baseSegments.forEach((seg) => {
        const segStart = seg.startOnTimelineMs || 0;
        const segEnd = segStart + (seg.durationMs || 0);

        // Intersection with selection
        const keepStart = Math.max(segStart, selStart);
        const keepEnd = Math.min(segEnd, selEnd);
        if (keepEnd <= keepStart) return;

        // New timeline start is shifted so selection starts at 0
        const newTimelineStart = keepStart - selStart;
        pushSegmentSlice(seg, keepStart, keepEnd, newTimelineStart);

        // Left and right outside pieces go to "removed" buffer
        pushRemovedSlice(seg, segStart, Math.min(segEnd, selStart));
        pushRemovedSlice(seg, Math.max(segStart, selEnd), segEnd);
      });
    } else {
      // ======== CUT: remove [selStart, selEnd] but keep timeline position (gap) ====
      baseSegments.forEach((seg) => {
        const segStart = seg.startOnTimelineMs || 0;
        const segEnd = segStart + (seg.durationMs || 0);

        // Completely before or after selection → keep unchanged
        if (segEnd <= selStart || segStart >= selEnd) {
          newSegments.push({ ...seg });
          return;
        }

        // Segment overlaps selection → split into left/right pieces as needed
        // Left piece (before selection)
        if (segStart < selStart) {
          pushSegmentSlice(seg, segStart, selStart, segStart);
        }

        // Middle (inside selection) → removed
        pushRemovedSlice(seg, selStart, selEnd);

        // Right piece (after selection), starting at selEnd (keep the gap)
        if (segEnd > selEnd) {
          const rightStartOnTimeline = selEnd;
          pushSegmentSlice(seg, selEnd, segEnd, rightStartOnTimeline);
        }
      });
    }

    // If trim produced nothing, bail
    if (!newSegments.length && mode === "trim") {
      console.warn("Trim resulted in no audio to keep.");
      return false;
    }

    // Write back into audioManager & React state
    const newTrack = { ...track, segments: newSegments };
    const newTracks = [...audioManager.tracks];
    newTracks[idx] = newTrack;
    audioManager.tracks = newTracks;
    if (removedPieces.length) {
      setTrimBuffer((prev) => [...prev, ...removedPieces]);
    }
    setTracks(newTracks);

    // Reset playhead & timeline length
    progressStore.setMs(0);

    // Clear selection & mode
    setSelection(null);
    setSelectedTrackId(null);

    return true;
  };

  const handleTrimStart = () => {
      if (!selectMode) {
      // Turn ON trim mode with "trim" as the current operation
      setEditAction("trim");
      setSelectMode(true);
      setSelection(null);
      setSelectedTrackId(null);
    } else {
      if (editAction === "trim") {
        // Trim mode already active -> turn OFF
        setSelectMode(false);
        setSelection(null);
        setSelectedTrackId(null);
      } else {
        // We were in cut mode; switch to trim but keep current selection/track
        setEditAction("trim");
      }
    }
  };

  const handleCutStart = () => {
    if (!selectMode) {
      // Turn ON selection mode as "cut"
      setEditAction("cut");
      setSelectMode(true);
      setSelection(null);
      setSelectedTrackId(null);
    } else {
      if (editAction === "cut") {
        // Cut mode already active -> turn OFF
        setSelectMode(false);
        setSelection(null);
        setSelectedTrackId(null);
      } else {
        // We were in trim mode; switch to cut but keep current selection/track
        setEditAction("cut");
      }
    }
  };

  const handleTrackSelection  = React.useCallback(
    (trackId) => {
      if (!selectMode) return; // only respond in trim mode

      // which track we're trimming
      setSelectedTrackId(trackId);

      // If we don't have a selection, or we've switched tracks,
      // default the selection to this track's own length.
      if (!selection || trackId !== selectedTrackId) {
        const track = tracks.find((t) => t.id === trackId);

        let trackEndMs = 0;
        if (track && Array.isArray(track.segments)) {
          track.segments.forEach((seg) => {
            const segStart = seg.startOnTimelineMs || 0;
            const durMs =
              typeof seg.durationMs === "number" && seg.durationMs > 0
                ? seg.durationMs
                : (seg.duration || 0) * 1000;
            if (durMs <= 0) return;
            const segEnd = segStart + durMs;
            if (segEnd > trackEndMs) trackEndMs = segEnd;
          });
        }

        const fallbackEnd = timelineLengthMs > 0 ? timelineLengthMs : 0;
        const endMs = trackEndMs > 0 ? trackEndMs : fallbackEnd;

        if (endMs > 0) {
          setSelection({ startMs: 0, endMs });
        }
      }
    },
    [selectMode, selection, timelineLengthMs, tracks, selectedTrackId]
  );

  // User cancels trim (red X)
  const cancelEditMode = useCallback(() => {
    setSelectMode(false);
    setSelection(null);
    setSelectedTrackId(null);
  }, []);

  // User confirms trim (green check)
  const confirmEdit = useCallback(async () => {
    if (!selectMode || !selection) return;
    if (!selectedTrackId) {
      console.warn("Trim: no track selected for single-track trim.");
      return;
    }

    await applySelectionEdit(selectedTrackId, editAction);

    setSelectMode(false);
    setSelection(null);
    setSelectedTrackId(null);
  }, [selectMode, selection, selectedTrackId, editAction]);

  return (
    <div className="app-container">
      <Header
        tracks={tracks}
<<<<<<< HEAD
        totalLengthMs={timelineLengthMs}
        onImportSuccess={handleImportSuccess}
=======
        totalLengthMs={version?.lengthMs || 0}
        onImportSuccess={handleFileDropdownImport}
>>>>>>> d47ff52022aa90befcc52ac621f0df39233650c3
        onImportError={handleImportError}
        onExportComplete={handleExportComplete}
        onTrim={handleTrimStart}
        onCut={handleCutStart}
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
<<<<<<< HEAD
          totalLengthMs={timelineLengthMs}
          selection={selection}
          onSelectionChange={setSelection}
          selectMode={selectMode}
          confirmEdit={confirmEdit}
          onTrimCancel={cancelEditMode}
          selectedTrackId={selectedTrackId}
          onTrimTrackSelect={handleTrackSelection}
          onMute={async (trackId, muted) => {
            try {
              engineRef.current?.setTrackMute(trackId, muted);
            } catch (e) {
              console.warn("Engine setTrackMute failed", e);
            }
            const t = audioManager.tracks.find((x) => x.id === trackId);
            if (t) {
              try {
                t.mute = muted;
                if (dbManager.updateTrack) await dbManager.updateTrack(t);
              } catch (e) {
                console.warn("Failed to persist mute change", e);
              }
              setTracks([...audioManager.tracks]);
            }
          }}
          onSolo={async (trackId, soloed) => {
            try {
              engineRef.current?.setTrackSolo(trackId, soloed);
            } catch (e) {
              console.warn("Engine setTrackSolo failed", e);
            }
            const t = audioManager.tracks.find((x) => x.id === trackId);
            if (t) {
              try {
                t.solo = soloed;
                if (dbManager.updateTrack) await dbManager.updateTrack(t);
              } catch (e) {
                console.warn("Failed to persist solo change", e);
              }
              setTracks([...audioManager.tracks]);
            }
          }}
=======
          totalLengthMs={version?.lengthMs || 0}
          onAssetDrop={handleAssetDrop}
          onMute={(trackId, muted) =>
            handleTrackPropertyUpdate(trackId, "mute", muted, "setTrackMute")
          }
          onSolo={(trackId, soloed) =>
            handleTrackPropertyUpdate(trackId, "solo", soloed, "setTrackSolo")
          }
>>>>>>> d47ff52022aa90befcc52ac621f0df39233650c3
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
