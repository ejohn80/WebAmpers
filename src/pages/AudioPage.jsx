/**
 * AudioPage.jsx - Main audio editing interface
 *
 * Core component for the Digital Audio Workstation (DAW) interface. Manages:
 * - Audio track creation, editing, and organization
 * - Timeline-based audio segment manipulation
 * - Playback engine integration (Tone.js)
 * - Persistent storage via IndexedDB
 * - Import/export functionality
 * - Real-time recording
 * - Clipboard operations for cut/copy/paste
 *
 * Key Responsibilities:
 * 1. Session management - Loading/saving tracks per project
 * 2. Buffer caching - Optimizes audio loading via assetBufferCache
 * 3. Engine coordination - Bridges UI with Tone.js playback engine
 * 4. State synchronization - Keeps UI, audioManager, and DB in sync
 * 5. User interactions - Handles drag-drop, keyboard shortcuts, editing tools
 *
 * Architecture:
 * - Uses Context API for global state (AppContext)
 * - Manages side effects with useEffect hooks
 * - Implements optimistic updates for responsive UI
 * - Coordinates multiple managers (audioManager, dbManager, clipboardManager)
 */
import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
} from "react";
import "./AudioPage.css";
import * as Tone from "tone";

// Component imports
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import MainContent from "../components/Layout/MainContent";
import Footer from "../components/Layout/Footer";

// Manager imports
import {audioManager} from "../managers/AudioManager";
import {dbManager} from "../managers/DBManager";
import {AppContext} from "../context/AppContext";
import {progressStore} from "../playback/progressStore";
import {saveAsset} from "../utils/assetUtils";
import {clipboardManager} from "../managers/ClipboardManager";
import {insertSegmentWithSpacing} from "../utils/segmentPlacement";

// Constants for UI and track layout
const MIN_WIDTH = 0; // Minimum sidebar width (collapsed)
const MAX_WIDTH = 300; // Maximum sidebar width (expanded)
const TRACK_END_PADDING_MS = 2000; // Padding at end of timeline

// Global buffer cache for audio assets (shared across component instances)
const assetBufferCache = new Map(); // assetId -> Tone.ToneAudioBuffer

// Empty version object for initializing playback engine
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
  // Context state for global application data
  const {
    setEngineRef,
    applyEffectsToEngine,
    activeSession,
    selectedTrackId,
    setSelectedTrackId,
  } = useContext(AppContext);

  // UI state
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [_audioData, setAudioData] = useState(null);
  const [recording, setRecording] = useState({stream: null, startTs: 0});
  const [assetsRefreshTrigger, setAssetsRefreshTrigger] = useState(0);
  const [hasClipboardFlag, setHasClipboardFlag] = useState(() =>
    clipboardManager.hasClipboard()
  );

  // Refs for engine and caching
  const engineRef = React.useRef(null);
  const lastSessionRef = useRef(null); // Track last session to prevent reload loops
  const assetPreviewCacheRef = useRef(new Map()); // Cache for asset preview durations

  // Callback to refresh clipboard UI indicator
  const refreshClipboardFlag = useCallback(() => {
    setHasClipboardFlag(clipboardManager.hasClipboard());
  }, []);

  /**
   * Handle saving a sampler recording as a new track
   * Processes MIDI keyboard recordings into audio tracks
   */
  const handleSamplerRecording = async (recordingData) => {
    if (!activeSession) {
      console.error("No active session for sampler recording");
      alert("Please create or select a session first");
      return;
    }

    const {audioBlob, _duration, instrument, name} = recordingData;

    if (!audioBlob || audioBlob.size === 0) {
      console.warn("No audio recorded");
      alert("No audio was recorded. Play some notes while recording!");
      return;
    }

    try {
      // Format duration for display (MM:SS)
      const formatDuration = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      };
      console.log(`[AudioPage] Processing sampler recording: ${name}`);

      // Decode WebM blob to audio buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer =
        await Tone.context.rawContext.decodeAudioData(arrayBuffer);

      // Create ToneAudioBuffer for playback
      const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);

      // Serialize buffer for IndexedDB storage
      const serializedBuffer = {
        numberOfChannels: audioBuffer.numberOfChannels,
        length: audioBuffer.length,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        channels: [],
      };

      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        serializedBuffer.channels.push(audioBuffer.getChannelData(i));
      }

      // Generate unique IDs
      const trackName = name;
      const segmentId = `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const durationMs = Math.round(audioBuffer.duration * 1000);

      // Save as asset in database first
      const assetData = {
        name: trackName,
        duration: formatDuration(audioBuffer.duration * 1000),
        size: audioBlob.size,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        buffer: serializedBuffer,
      };

      const assetId = await dbManager.addAsset(assetData);
      console.log(`[AudioPage] Sampler recording saved as asset ${assetId}`);

      // Cache buffer for performance
      assetBufferCache.set(assetId, toneBuffer);

      // Create track data for database
      const trackData = {
        name: trackName,
        color: instrument === "piano" ? "#45B7D1" : "#FFA07A", // Blue for piano, coral for drums
        assetId: assetId,
        enabledEffects: {},
        segments: [
          {
            id: segmentId,
            assetId,
            offset: 0,
            duration: audioBuffer.duration,
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

      // Save track to database with session association
      const dbId = await dbManager.addTrack(trackData, activeSession);
      console.log(`[AudioPage] Sampler track saved with ID: ${dbId}`);

      // Create track object for audioManager
      const newTrack = {
        id: dbId,
        name: trackName,
        color: trackData.color,
        buffer: toneBuffer,
        assetId: assetId,
        enabledEffects: {},
        segments: [
          {
            id: segmentId,
            assetId,
            buffer: toneBuffer,
            offset: 0,
            duration: audioBuffer.duration,
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

      // Add to audioManager and update UI state
      audioManager.addTrackFromBuffer(newTrack);
      console.log(`[AudioPage] Track added to audioManager`);

      setTracks([...audioManager.tracks]);

      // Trigger assets sidebar refresh
      setAssetsRefreshTrigger((prev) => prev + 1);

      // Reload playback engine with new track
      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        console.log("[AudioPage] Engine reloaded after sampler recording");
      }

      console.log(
        `[AudioPage] Sampler recording saved successfully as "${trackName}"`
      );
    } catch (error) {
      console.error("Failed to save sampler recording:", error);
      alert(`Failed to save recording: ${error.message}`);
    }
  };

  // Deserialize audio buffer from IndexedDB format to native AudioBuffer
  const deserializeAudioBuffer = useCallback((serializedBuffer) => {
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
  }, []);

  // Create Tone.js buffer from serialized data
  const createToneBufferFromSerialized = useCallback(
    (serializedBuffer) => {
      const audioBuffer = deserializeAudioBuffer(serializedBuffer);
      return new Tone.ToneAudioBuffer(audioBuffer);
    },
    [deserializeAudioBuffer]
  );

  // Build Tone buffer from asset record (handles both serialized and blob formats)
  const buildToneBufferFromAssetRecord = useCallback(
    async (asset) => {
      if (!asset) return null;

      // Try deserializing stored buffer first
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

      // Fallback to decoding file blob
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
    },
    [createToneBufferFromSerialized]
  );

  // Get preview info (duration) for assets, with caching
  const getAssetPreviewInfo = useCallback(
    async (assetId) => {
      if (!assetId) return null;

      // Check cache first
      if (assetPreviewCacheRef.current.has(assetId)) {
        return assetPreviewCacheRef.current.get(assetId);
      }

      try {
        // Get or build Tone buffer
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

        // Extract duration from buffer
        const durationSeconds =
          typeof toneBuffer.duration === "number"
            ? toneBuffer.duration
            : (toneBuffer._buffer?.duration ??
              toneBuffer.get?.()?.duration ??
              0);

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

  // Generate unique name for copied tracks (e.g., "Song Copy", "Song Copy 2")
  const generateCopyName = useCallback(
    (baseName) => {
      const cleanName = baseName.replace(/\s+Copy(\s+\d+)?$/, "");

      const existingNames = new Set(tracks.map((t) => t.name));

      // Try "BaseName Copy" first
      const firstCopyName = `${cleanName} Copy`;
      if (!existingNames.has(firstCopyName)) {
        return firstCopyName;
      }

      // Find next available number
      let counter = 2;
      let newName;
      do {
        newName = `${cleanName} Copy ${counter}`;
        counter++;
      } while (existingNames.has(newName));

      return newName;
    },
    [tracks]
  );

  // Build version object for playback engine from track data
  const buildVersionFromTracks = useCallback((tracksArray) => {
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

    // Convert tracks to engine format
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

      // Convert segments to engine format
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

        // Track max timeline position for total length calculation
        const endMs = startOnTimelineMs + (durationMs || 0);
        if (endMs > maxEndMs) maxEndMs = endMs;
      });
    });

    // Add padding at end of timeline
    const paddedLengthMs = maxEndMs > 0 ? maxEndMs + TRACK_END_PADDING_MS : 0;
    vs.lengthMs = paddedLengthMs || 60000;
    return vs;
  }, []);

  // Load tracks when session changes
  useEffect(() => {
    if (!activeSession) return;
    if (lastSessionRef.current === activeSession) return;

    console.log(`[AudioPage] Loading session ${activeSession}`);
    lastSessionRef.current = activeSession;

    const loadSessionTracks = async () => {
      try {
        const savedTracks = await dbManager.getAllTracks(activeSession);
        console.log(
          `[AudioPage] Found ${savedTracks.length} tracks for session ${activeSession}`
        );

        // Clear current tracks in audioManager
        audioManager.clearAllTracks();

        // Local cache for this load session to avoid duplicate fetches
        const localAssetBufferCache = new Map();

        // Helper to get buffers for assets
        const getToneBufferForAsset = async (assetId) => {
          if (!assetId) return null;

          // Check global cache first
          if (assetBufferCache.has(assetId)) {
            return assetBufferCache.get(assetId);
          }

          // Check local session cache
          if (localAssetBufferCache.has(assetId)) {
            return localAssetBufferCache.get(assetId);
          }

          try {
            const asset = await dbManager.getAsset(assetId);
            const toneBuffer = await buildToneBufferFromAssetRecord(asset);
            if (toneBuffer) {
              // Cache in both caches
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

        // Reconstruct tracks from database
        for (const savedTrack of savedTracks) {
          const hydratedSegments = [];
          if (Array.isArray(savedTrack.segments)) {
            for (const segment of savedTrack.segments) {
              const segAssetId = segment.assetId ?? savedTrack.assetId ?? null;

              // Get buffer for segment
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

              // Preserve segment metadata
              hydratedSegments.push({
                ...segment,
                assetId: segAssetId,
                buffer: segmentToneBuffer,
                name: segment.name || segment.fileName || null,
                fileName: segment.fileName || segment.name || null,
              });
            }
          }

          // Get primary buffer for track
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

          // Create track object for audioManager
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

        // Update React state with loaded tracks
        setTracks([...audioManager.tracks]);

        // Reload engine with loaded tracks
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
  }, [
    activeSession,
    buildToneBufferFromAssetRecord,
    buildVersionFromTracks,
    deserializeAudioBuffer,
  ]);

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarWidth((prevWidth) =>
      prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH
    );
  };

  // Handle successful audio import
  const handleImportSuccess = async (importedAudioData, assetId) => {
    if (!activeSession) {
      console.error("No active session!");
      return;
    }

    console.log(
      `[AudioPage] Creating track from asset ${assetId} in session ${activeSession}`
    );

    // Get cached buffer or create new one
    let toneBuffer = assetId ? assetBufferCache.get(assetId) : null;
    if (!toneBuffer && importedAudioData.buffer) {
      toneBuffer = new Tone.ToneAudioBuffer(importedAudioData.buffer);
    }

    // Create track data
    const trackData = {
      ...importedAudioData,
      buffer: toneBuffer || importedAudioData.buffer,
      assetId: assetId,
      enabledEffects: importedAudioData.enabledEffects || {},
    };

    // Add to audioManager
    const createdTrack = audioManager.addTrackFromBuffer(trackData);
    setTracks([...audioManager.tracks]);

    // Legacy: store audio data if this is the first track
    if (audioManager.tracks.length === 1) {
      setAudioData(importedAudioData);
    }

    // Save track to database
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

        // Update track ID if database assigned a different one
        if (assignedId !== undefined && assignedId !== createdTrack.id) {
          createdTrack.id = assignedId;
          setTracks([...audioManager.tracks]);
        }
      }
    } catch (error) {
      console.error("Failed to save track:", error);
    }
  };

  // Handle file dropdown imports (saves to assets first)
  const handleFileDropdownImport = async (importResult) => {
    try {
      console.log("[AudioPage] File dropdown import - saving to assets first");

      const {buffer} = importResult;

      // Save asset to database (handles duplicate names)
      const assetId = await saveAsset(importResult, dbManager);

      // Get saved asset for potentially renamed name
      const savedAsset = await dbManager.getAsset(assetId);
      if (!savedAsset) {
        console.error("Failed to retrieve saved asset");
        return;
      }

      // Update with saved name
      const updatedImportResult = {
        ...importResult,
        name: savedAsset.name,
        enabledEffects: {},
      };

      // Cache buffer
      if (buffer) {
        const toneBuffer = new Tone.ToneAudioBuffer(buffer);
        assetBufferCache.set(assetId, toneBuffer);
        console.log(`[AudioPage] Cached buffer for asset ${assetId}`);
      }

      // Refresh assets sidebar
      setAssetsRefreshTrigger((prev) => prev + 1);

      // Create track with asset
      await handleImportSuccess(updatedImportResult, assetId);
    } catch (error) {
      console.error("Failed to handle file dropdown import:", error);
      handleImportError(error);
    }
  };

  // Handle import errors
  const handleImportError = (error) => {
    alert(`Import failed: ${error.message}`);
  };

  // Handle export completion
  const handleExportComplete = () => {
    console.log("Export process complete.");
  };

  // Handle dropping asset from sidebar to timeline
  const handleAssetDrop = async (
    assetId,
    targetTrackId = null,
    timelinePositionMs = 0,
    assetName = null
  ) => {
    try {
      console.log(`Dropping asset ${assetId}`, {
        targetTrackId,
        timelinePositionMs,
        assetName,
      });

      // Get asset from database
      const asset = await dbManager.getAsset(assetId);
      if (!asset) {
        console.error("Asset not found:", assetId);
        alert("Asset not found in database");
        return;
      }

      // Use provided name or database name
      const segmentName = assetName || asset.name;
      console.log(
        `[handleAssetDrop] Using segment name: "${segmentName}" (from ${assetName ? "parameter" : "database"})`
      );

      // Get or create buffer for asset
      let toneBuffer = assetBufferCache.get(assetId);
      if (!toneBuffer) {
        console.log(`Decoding buffer for asset ${assetId}`);
        toneBuffer = await buildToneBufferFromAssetRecord(asset);

        if (!toneBuffer) {
          console.error("Asset has no valid buffer data");
          alert("Asset has no valid audio buffer data");
          return;
        }

        // Cache for future use
        assetBufferCache.set(assetId, toneBuffer);
        console.log(
          `Cached buffer for asset ${assetId}, cache size: ${assetBufferCache.size}`
        );
      }

      // Get AudioBuffer for metadata
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

      // Append to existing track if targetTrackId provided
      if (targetTrackId) {
        const track = audioManager.getTrack(targetTrackId);
        if (!track) {
          console.error("Target track not found:", targetTrackId);
          alert("Target track not found");
          return;
        }

        console.log(
          `Appending segment to track ${targetTrackId} at ${timelinePositionMs}ms`
        );

        // Create new segment
        const newSegment = {
          id: segmentId,
          assetId,
          name: segmentName,
          fileName: segmentName,
          buffer: toneBuffer,
          offset: 0,
          duration: durationSeconds,
          durationMs,
          startOnTimelineMs: Math.round(timelinePositionMs),
          startInFileMs: 0,
        };

        // Add segment with automatic spacing
        const positionedSegments = insertSegmentWithSpacing(
          track.segments,
          newSegment
        );
        track.segments = positionedSegments;

        // Update database
        await dbManager.updateTrack(track);
        console.log("Track updated with new segment");

        // Update state
        setTracks([...audioManager.tracks]);

        // Reload engine
        const newVersion = buildVersionFromTracks(audioManager.tracks);
        if (newVersion && engineRef.current) {
          await engineRef.current.load(newVersion);
          console.log("Engine reloaded after segment append");
        }

        console.log("Segment appended to track successfully");
        return;
      }

      // Otherwise create new track
      console.log(`Creating new track from asset ${assetId}`);

      // Prepare track data for database
      const trackData = {
        name: segmentName,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        assetId: assetId,
        enabledEffects: {},
        segments: [
          {
            id: segmentId,
            assetId,
            name: segmentName,
            fileName: segmentName,
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
      console.log("Segment data being saved to DB:", trackData.segments);

      // Save to database
      const dbId = await dbManager.addTrack(trackData, activeSession);
      console.log("Track saved to DB with ID:", dbId);

      // Create track for audioManager
      const newTrack = {
        id: dbId,
        name: segmentName,
        color: trackData.color,
        buffer: toneBuffer,
        enabledEffects: {},
        segments: [
          {
            id: segmentId,
            assetId,
            name: segmentName,
            fileName: segmentName,
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

      // Update state
      setTracks([...audioManager.tracks]);

      // Reload engine
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

  // Cut segment into three parts (left, cut, right)
  function cutSegmentByRange(segment, cutStartMs, cutEndMs) {
    if (!segment)
      return {leftSegment: null, cutSegment: null, rightSegment: null};

    // Normalize order
    const startMs = Math.min(cutStartMs, cutEndMs);
    const endMs = Math.max(cutStartMs, cutEndMs);

    const segStartTimelineMs = segment.startOnTimelineMs || 0;
    const segDurationMs =
      segment.durationMs ??
      (typeof segment.duration === "number"
        ? Math.round(segment.duration * 1000)
        : 0);
    const segEndTimelineMs = segStartTimelineMs + segDurationMs;

    // Clamp cut range to segment bounds
    const clampedStart = Math.max(segStartTimelineMs, Math.min(startMs, endMs));
    const clampedEnd = Math.min(segEndTimelineMs, Math.max(startMs, endMs));

    if (clampedEnd <= clampedStart) {
      // No overlap
      return {leftSegment: null, cutSegment: null, rightSegment: null};
    }

    const totalDurMs = segDurationMs;
    const fileStartMs = segment.startInFileMs ?? 0;

    // Calculate positions
    const offsetStartInsideSegMs = clampedStart - segStartTimelineMs;
    const offsetEndInsideSegMs = clampedEnd - segStartTimelineMs;

    const cutStartInFileMs = fileStartMs + offsetStartInsideSegMs;
    const cutEndInFileMs = fileStartMs + offsetEndInsideSegMs;

    const leftDurMs = offsetStartInsideSegMs;
    const rightDurMs = totalDurMs - offsetEndInsideSegMs;
    const cutDurMs = cutEndInFileMs - cutStartInFileMs;

    const base = segment;
    const makeId = (suffix) => `${segment.id}_${suffix}_${Date.now()}`;

    // Create left segment
    const leftSegment =
      leftDurMs > 0
        ? {
            ...base,
            id: makeId("L"),
            startOnTimelineMs: segStartTimelineMs,
            startOnTimeline: segStartTimelineMs / 1000,
            startInFileMs: fileStartMs,
            offset: fileStartMs / 1000,
            durationMs: leftDurMs,
            duration: leftDurMs / 1000,
          }
        : null;

    // Create cut segment (goes to clipboard)
    const cutSegment =
      cutDurMs > 0
        ? {
            ...base,
            id: makeId("CUT"),
            startOnTimelineMs: clampedStart,
            startOnTimeline: clampedStart / 1000,
            startInFileMs: cutStartInFileMs,
            offset: cutStartInFileMs / 1000,
            durationMs: cutDurMs,
            duration: cutDurMs / 1000,
          }
        : null;

    // Create right segment
    const rightSegment =
      rightDurMs > 0
        ? {
            ...base,
            id: makeId("R"),
            startOnTimelineMs: clampedEnd,
            startOnTimeline: clampedEnd / 1000,
            startInFileMs: cutEndInFileMs,
            offset: cutEndInFileMs / 1000,
            durationMs: rightDurMs,
            duration: rightDurMs / 1000,
          }
        : null;

    return {leftSegment, cutSegment, rightSegment};
  }

  // Handle cutting a range from a segment
  const handleCutSegmentRange = async (
    trackId,
    segmentIndex,
    cutStartMs,
    cutEndMs
  ) => {
    const {ms: preservedMs} = progressStore.getState();

    try {
      const track = audioManager.getTrack(trackId);
      if (!track || !track.segments || !track.segments[segmentIndex]) {
        console.warn("[cut] Track or segment not found");
        return;
      }

      const originalSegment = track.segments[segmentIndex];

      // Cut segment into three parts
      const {leftSegment, cutSegment, rightSegment} = cutSegmentByRange(
        originalSegment,
        cutStartMs,
        cutEndMs
      );

      if (!cutSegment) {
        console.warn("[cut] No overlapping region to cut");
        return;
      }

      // Build new segments list (remove middle)
      const newSegments = [
        ...track.segments.slice(0, segmentIndex),
        ...(leftSegment ? [leftSegment] : []),
        ...(rightSegment ? [rightSegment] : []),
        ...track.segments.slice(segmentIndex + 1),
      ];

      track.segments = newSegments;

      // Get assetId from database for clipboard
      try {
        const allTracks = await dbManager.getAllTracks(activeSession);
        const dbTrack = allTracks.find((t) => t.id === trackId);
        if (dbTrack && dbTrack.assetId) {
          track.assetId = dbTrack.assetId;
          cutSegment.assetId = cutSegment.assetId ?? dbTrack.assetId;
        }
      } catch (e) {
        console.warn("[cut] Failed to enrich track with assetId", e);
      }

      // Create clipboard object with cut segment
      const clipTrack = {
        id: `clip_${track.id}_${Date.now()}`,
        name: `${track.name} (cut)`,
        color: track.color,
        assetId: cutSegment.assetId ?? track.assetId,
        volume: track.volume ?? 0,
        pan: track.pan ?? 0,
        mute: false,
        solo: false,
        effects: track.effects || {},
        activeEffectsList: track.activeEffectsList || [],
        // Only include the cut segment
        segments: [
          {
            ...cutSegment,
            startOnTimelineMs: 0,
            startOnTimeline: 0,
          },
        ],
        // Metadata for pasting
        clipStartInFileMs: cutSegment.startInFileMs ?? 0,
        clipDurationMs: cutSegment.durationMs ?? 0,
      };

      // Set clipboard and update UI
      clipboardManager.setClipboard(clipTrack, "cut");
      refreshClipboardFlag();

      // Persist changes to database
      await dbManager.updateTrack(track);

      // Update state
      setTracks([...audioManager.tracks]);

      // Reload engine and restore playhead
      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        try {
          engineRef.current.setPositionMs(preservedMs);
        } catch (e) {
          console.warn("[cut] Failed to restore playhead after cut", e);
        }
      }

      console.log(
        `[cut] Segment ${segmentIndex} of track ${trackId} cut into left/right, ` +
          `clipboard now has middle region`
      );
    } catch (error) {
      console.error("Failed to cut segment:", error);
      alert(`Failed to cut segment: ${error.message}`);
    }
  };

  // Handle moving a segment within a track
  const handleSegmentMove = async (trackId, segmentIndex, newPositionMs) => {
    const {ms: preservedMs} = progressStore.getState();
    try {
      console.log(
        `Moving segment ${segmentIndex} in track ${trackId} to ${newPositionMs}ms`
      );

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

      // Remove segment then reinsert with spacing
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
        appliedStart: normalizedSegments.find(
          (seg) => seg.id === updatedSegment.id
        )?.startOnTimelineMs,
      });

      // Update database
      await dbManager.updateTrack(track);
      console.log("Segment position updated in database");

      setTracks([...audioManager.tracks]);

      // Reload engine and restore playhead
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
        console.log(
          `[handleSegmentMove] About to reload engine, preserved playhead: ${preservedMs}ms`
        );

        try {
          await engineRef.current.load(newVersion);
          console.log(`[handleSegmentMove] Engine load completed`);
        } catch (loadError) {
          console.error("Engine load failed:", loadError);
          throw loadError;
        }

        const targetMs = Number.isFinite(preservedMs) ? preservedMs : 0;
        const clampedMs = Math.max(
          0,
          Math.min(targetMs, newVersion.lengthMs ?? targetMs)
        );

        console.log(
          `[handleSegmentMove] Restoring playhead to ${clampedMs}ms (preserved: ${preservedMs}ms)`
        );

        // Seek engine to preserved position
        try {
          engineRef.current.seekMs(clampedMs);
          progressStore.setMs(clampedMs);
          console.log(
            `[handleSegmentMove] Engine seeked and progressStore updated to ${clampedMs}ms`
          );
        } catch (seekError) {
          console.warn(
            "Failed to restore playhead after segment move:",
            seekError
          );
        }
        console.log("Engine reloaded after segment move");
      } else {
        console.warn(
          `[handleSegmentMove] Skipped engine reload - newVersion: ${!!newVersion}, engineRef.current: ${!!engineRef.current}`
        );
      }
    } catch (error) {
      console.error("Failed to move segment:", error);
      alert(`Failed to move segment: ${error.message}`);
    }
  };

  // Handle deleting a segment
  const handleSegmentDelete = async (trackId, segmentId, segmentIndex) => {
    const {ms: preservedMs} = progressStore.getState();
    try {
      const track = audioManager.getTrack(trackId);
      if (!track || !Array.isArray(track.segments)) {
        console.warn("Track not found or has no segments");
        return;
      }

      const segmentsBefore = track.segments.length;
      // Filter out the segment to delete
      track.segments = track.segments.filter((seg, idx) => {
        if (Number.isFinite(segmentIndex)) {
          return idx !== segmentIndex;
        }
        return seg.id !== segmentId;
      });

      if (track.segments.length === segmentsBefore) {
        console.warn("No segment removed; aborting delete");
        return;
      }

      // Update database and state
      await dbManager.updateTrack(track);
      setTracks([...audioManager.tracks]);

      // Reload engine and restore playhead
      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        const targetMs = Number.isFinite(preservedMs) ? preservedMs : 0;
        const clampedMs = Math.max(
          0,
          Math.min(targetMs, newVersion.lengthMs ?? targetMs)
        );
        try {
          engineRef.current.seekMs(clampedMs);
          progressStore.setMs(clampedMs);
        } catch (seekError) {
          console.warn(
            "Failed to restore playhead after segment delete",
            seekError
          );
        }
      }
    } catch (error) {
      console.error("Failed to delete segment:", error);
      alert(`Failed to delete segment: ${error.message}`);
    }
  };

  // Handle deleting a track with cleanup
  const handleDeleteTrack = useCallback(
    async (trackId) => {
      try {
        console.log(`Deleting track ${trackId}...`);

        // Stop Tone.js transport
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

          // Deselect if this was selected
          if (selectedTrackId === trackId) {
            setSelectedTrackId(null);
          }

          // Update state
          setTracks([...audioManager.tracks]);

          // Reset progress store
          try {
            progressStore.setMs(0);
            progressStore.setLengthMs(0);
          } catch (e) {
            console.warn("Failed to reset progress store:", e);
          }

          // Reload engine (empty or with remaining tracks)
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
                console.error(
                  "Failed to reload engine after track deletion:",
                  e
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to delete track:", error);
      }
    },
    [
      buildVersionFromTracks,
      engineRef,
      selectedTrackId,
      setSelectedTrackId,
      setTracks,
    ]
  );

  // Cut selected track to clipboard
  const handleCutTrack = useCallback(async () => {
    if (!selectedTrackId) {
      console.warn("No track selected for cut");
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      console.warn("Selected track not found");
      return;
    }

    // Get assetId from database
    try {
      const allTracks = await dbManager.getAllTracks(activeSession);
      const dbTrack = allTracks.find((t) => t.id === selectedTrackId);

      if (dbTrack && dbTrack.assetId) {
        track.assetId = dbTrack.assetId;
      }

      console.log(`Track being cut - assetId: ${track.assetId}`);
    } catch (error) {
      console.warn("Failed to retrieve assetId from DB:", error);
    }

    // Copy to clipboard
    clipboardManager.setClipboard(track, "cut");
    refreshClipboardFlag();

    // Delete the track
    await handleDeleteTrack(selectedTrackId);

    console.log(`Track cut to clipboard: ${track.name}`);
  }, [activeSession, handleDeleteTrack, refreshClipboardFlag, selectedTrackId]);

  // Copy selected track to clipboard
  const handleCopyTrack = useCallback(async () => {
    if (!selectedTrackId) {
      console.warn("No track selected for copy");
      return;
    }

    const track = audioManager.getTrack(selectedTrackId);
    if (!track) {
      console.warn("Selected track not found");
      return;
    }

    console.log(
      "Track segments being copied:",
      track.segments.map((s) => ({
        id: s.id,
        name: s.name,
        fileName: s.fileName,
        assetId: s.assetId,
        startInFileMs: s.startInFileMs,
        durationMs: s.durationMs,
        startOnTimelineMs: s.startOnTimelineMs,
      }))
    );

    // Get assetId from database
    try {
      const allTracks = await dbManager.getAllTracks(activeSession);
      const dbTrack = allTracks.find((t) => t.id === selectedTrackId);

      if (dbTrack && dbTrack.assetId) {
        track.assetId = dbTrack.assetId;
      }

      console.log(`Track being copied - assetId: ${track.assetId}`);
    } catch (error) {
      console.warn("Failed to retrieve assetId from DB:", error);
    }

    // Copy to clipboard
    clipboardManager.setClipboard(track, "copy");
    refreshClipboardFlag();

    console.log(`Track copied to clipboard: ${track.name}`);
  }, [activeSession, refreshClipboardFlag, selectedTrackId]);

  // Paste track from clipboard
  const handlePasteTrack = useCallback(async () => {
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
      alert("Cannot paste track: missing assetId");
      return;
    }

    if (!activeSession) {
      console.error("No active session for paste");
      alert("Please create or select a session first");
      return;
    }

    try {
      // Helper to get buffer for asset
      const getBufferForAsset = async (assetId) => {
        // Check cache first
        let buffer = assetBufferCache.get(assetId);
        if (buffer) {
          return buffer;
        }

        // Load from database
        const asset = await dbManager.getAsset(assetId);
        if (!asset) {
          console.error(`Asset ${assetId} not found`);
          return null;
        }

        const {buffer: serializedBuffer} = asset;
        if (!serializedBuffer || !serializedBuffer.channels) {
          console.error(`Asset ${assetId} has no valid buffer data`);
          return null;
        }

        const audioBuffer = deserializeAudioBuffer(serializedBuffer);
        const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        assetBufferCache.set(assetId, toneBuffer);
        return toneBuffer;
      };

      // Get primary asset buffer
      const primaryBuffer = await getBufferForAsset(trackData.assetId);
      if (!primaryBuffer) {
        alert("Cannot paste track: primary asset not found");
        return;
      }

      const audioBuffer = primaryBuffer.get();
      const fullDurationMs = audioBuffer.duration * 1000;

      const clipboardSegments = Array.isArray(trackData.segments)
        ? trackData.segments
        : [];

      // Check for single-segment cut operation
      const hasTopLevelRegion =
        typeof trackData.clipStartInFileMs === "number" &&
        typeof trackData.clipDurationMs === "number" &&
        trackData.clipDurationMs > 0;

      const baseSegments = (() => {
        // Handle single-segment cut
        if (hasTopLevelRegion && clipboardSegments.length <= 1) {
          return [
            {
              id:
                clipboardSegments[0]?.id ??
                `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              startOnTimelineMs: clipboardSegments[0]?.startOnTimelineMs ?? 0,
              startInFileMs: Math.max(0, trackData.clipStartInFileMs),
              durationMs: Math.max(
                1,
                Math.min(trackData.clipDurationMs, fullDurationMs)
              ),
              // Preserve name from clipboard
              name:
                clipboardSegments[0]?.name ||
                clipboardSegments[0]?.fileName ||
                trackData.name ||
                asset.name || // eslint-disable-line no-undef
                null,
              fileName:
                clipboardSegments[0]?.fileName ||
                clipboardSegments[0]?.name ||
                trackData.name ||
                asset.name || // eslint-disable-line no-undef
                null,
              assetId: trackData.assetId,
            },
          ];
        }

        // Handle multiple segments
        if (clipboardSegments.length > 0) {
          return clipboardSegments.map((seg) => ({
            ...seg,
            id:
              seg.id ??
              `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            startOnTimelineMs:
              seg.startOnTimelineMs ??
              (seg.startOnTimeline
                ? Math.round(seg.startOnTimeline * 1000)
                : 0),
            startInFileMs:
              seg.startInFileMs ??
              (seg.offset ? Math.round(seg.offset * 1000) : 0),
            durationMs:
              seg.durationMs ??
              (seg.duration ? Math.round(seg.duration * 1000) : 0),
            name: seg.name || seg.fileName || null,
            fileName: seg.fileName || seg.name || null,
            assetId: seg.assetId || trackData.assetId,
          }));
        }

        // Fallback: full asset
        return [
          {
            id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            startOnTimelineMs: 0,
            startInFileMs: 0,
            durationMs: Math.round(fullDurationMs),
            name: trackData.name || asset.name || null, // eslint-disable-line no-undef
            fileName: trackData.name || asset.name || null, // eslint-disable-line no-undef
            assetId: trackData.assetId,
          },
        ];
      })();

      // Normalize segment data
      const normalizedSegments = baseSegments.map((seg, idx) => {
        const startOnTimelineMs = Math.max(
          0,
          Math.round(seg.startOnTimelineMs ?? 0)
        );
        const startInFileMs = Math.max(
          0,
          Math.round(
            typeof seg.startInFileMs === "number"
              ? seg.startInFileMs
              : seg.offset
                ? seg.offset * 1000
                : 0
          )
        );
        const durationMs = Math.max(
          1,
          Math.round(
            typeof seg.durationMs === "number"
              ? seg.durationMs
              : typeof seg.duration === "number"
                ? seg.duration * 1000
                : fullDurationMs
          )
        );

        // Generate copy name for segment
        const originalSegmentName =
          seg.name || seg.fileName || trackData.name || asset.name || null; // eslint-disable-line no-undef
        const segmentCopyName = originalSegmentName
          ? generateCopyName(originalSegmentName)
          : null;

        return {
          id:
            seg.id ??
            `seg_${Date.now()}_${idx}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
          startOnTimelineMs,
          startOnTimeline: startOnTimelineMs / 1000,
          startInFileMs,
          offset: startInFileMs / 1000,
          durationMs,
          duration: durationMs / 1000,
          assetId: seg.assetId || trackData.assetId,
          name: segmentCopyName,
          fileName: segmentCopyName,
        };
      });

      // Generate unique name for track
      const copyName = generateCopyName(trackData.name);

      // Create track data for database
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
        enabledEffects: trackData.enabledEffects || {},
        segments: normalizedSegments.map((seg) => ({
          id: seg.id,
          offset: seg.offset,
          duration: seg.duration,
          durationMs: seg.durationMs,
          startOnTimelineMs: seg.startOnTimelineMs,
          startInFileMs: seg.startInFileMs,
          name: seg.name,
          fileName: seg.fileName,
          assetId: seg.assetId,
        })),
      };

      // Save to database
      const dbId = await dbManager.addTrack(newTrackData, activeSession);
      console.log("Pasted track saved to DB with ID:", dbId, {
        effects: newTrackData.effects,
        activeEffectsList: newTrackData.activeEffectsList,
        enabledEffects: newTrackData.enabledEffects,
      });

      // Load buffers for all segments
      const segmentsWithBuffers = await Promise.all(
        normalizedSegments.map(async (seg) => {
          const segmentBuffer = await getBufferForAsset(seg.assetId);
          if (!segmentBuffer) {
            console.warn(
              `Failed to load buffer for segment ${seg.id} with assetId ${seg.assetId}`
            );
            return null;
          }
          return {
            ...seg,
            buffer: segmentBuffer,
          };
        })
      );

      // Filter valid segments
      const validSegments = segmentsWithBuffers.filter(Boolean);

      if (validSegments.length === 0) {
        alert("Failed to paste track: could not load segment buffers");
        return;
      }

      // Create track object for audioManager
      const pastedTrack = {
        id: dbId,
        name: copyName,
        color: newTrackData.color,
        buffer: primaryBuffer,
        assetId: trackData.assetId,
        volume: newTrackData.volume,
        pan: newTrackData.pan,
        mute: newTrackData.mute,
        solo: newTrackData.solo,
        effects: newTrackData.effects,
        activeEffectsList: newTrackData.activeEffectsList,
        enabledEffects: newTrackData.enabledEffects,
        segments: validSegments,
      };

      // Add to audioManager and update state
      audioManager.addTrackFromBuffer(pastedTrack);
      setTracks([...audioManager.tracks]);

      // Reload engine
      const newVersion = buildVersionFromTracks(audioManager.tracks);
      if (newVersion && engineRef.current) {
        await engineRef.current.load(newVersion);
        console.log("Engine reloaded after paste");
      }

      console.log(
        `Track pasted: ${copyName} with ${validSegments.length} segment(s)`
      );
    } catch (error) {
      console.error("Error while pasting track:", error);
      alert("Failed to paste track. See console for details.");
    }
  }, [
    activeSession,
    buildVersionFromTracks,
    deserializeAudioBuffer,
    engineRef,
    generateCopyName,
    setTracks,
  ]);

  // Keyboard shortcuts for cut/copy/paste/delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      const isTextEntry =
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.isContentEditable ||
        (activeElement?.tagName === "INPUT" &&
          !["range", "checkbox", "radio", "button", "submit", "file"].includes(
            activeElement.type
          ));

      // Skip shortcuts during text entry
      if (isTextEntry) return;

      // Ctrl/Cmd + X - Cut track
      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        e.preventDefault();
        if (selectedTrackId) {
          handleCutTrack();
        }
      }

      // Ctrl/Cmd + C - Copy track
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        if (selectedTrackId) {
          handleCopyTrack();
        }
      }

      // Ctrl/Cmd + V - Paste track
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        if (clipboardManager.hasClipboard()) {
          handlePasteTrack();
          refreshClipboardFlag();
        }
      }

      // Backspace/Delete - Delete track
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (selectedTrackId) {
          handleDeleteTrack(selectedTrackId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleCopyTrack,
    handleCutTrack,
    handleDeleteTrack,
    handlePasteTrack,
    refreshClipboardFlag,
    selectedTrackId,
  ]);

  // Handle asset deletion with cache cleanup
  const handleAssetDelete = (assetId) => {
    if (assetBufferCache.has(assetId)) {
      console.log(`Clearing cached buffer for deleted asset ${assetId}`);
      assetBufferCache.delete(assetId);
    }

    // Clear clipboard if it references this asset
    if (clipboardManager.isAssetInClipboard(assetId)) {
      console.log(`Clearing clipboard - referenced deleted asset ${assetId}`);
      clipboardManager.clearClipboard();
      refreshClipboardFlag();
    }
  };

  // Generic handler for track property updates (mute, solo, etc.)
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

  // Determine if sidebar is collapsed
  const isSidebarCollapsed = sidebarWidth <= MIN_WIDTH;

  // CSS variable for sidebar width
  const mainContentStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  };

  // Build version object for playback engine
  const version = buildVersionFromTracks(tracks);

  // Legacy audio buffer reference (for compatibility)
  const _audioBuffer =
    tracks.length > 0
      ? tracks[0].buffer || tracks[0].segments?.[0]?.buffer
      : null;

  // Handle engine ready callback
  const _handleEngineReady = (engine) => {
    engineRef.current = engine;
    setEngineRef(engineRef);

    // Apply effects after engine is ready
    setTimeout(() => {
      applyEffectsToEngine();
    }, 100);
  };

  // Main render
  return (
    <div className="app-container">
      {/* Top header with controls and menus */}
      <Header
        tracks={tracks}
        totalLengthMs={version?.lengthMs || 0}
        onImportSuccess={handleFileDropdownImport}
        onImportError={handleImportError}
        onExportComplete={handleExportComplete}
        onCutTrack={handleCutTrack}
        onCopyTrack={handleCopyTrack}
        onPasteTrack={handlePasteTrack}
        onDeleteTrack={handleDeleteTrack}
        selectedTrackId={selectedTrackId}
        hasClipboard={hasClipboardFlag}
        onSamplerRecording={handleSamplerRecording}
      />

      {/* Main workspace area with sidebar and timeline */}
      <div className="main-content-area" style={mainContentStyle}>
        {/* Left sidebar for assets and imports */}
        <Sidebar
          width={sidebarWidth}
          onImportSuccess={handleImportSuccess}
          onImportError={handleImportError}
          onAssetDelete={handleAssetDelete}
          assetsRefreshTrigger={assetsRefreshTrigger}
          assetBufferCache={assetBufferCache}
        />

        {/* Collapsible sidebar divider */}
        <button
          type="button"
          className="divider"
          onClick={toggleSidebar}
          data-collapsed={isSidebarCollapsed ? "true" : undefined}
          title={isSidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
          aria-label={isSidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
          aria-expanded={!isSidebarCollapsed}
          aria-pressed={!isSidebarCollapsed}
        >
          <span aria-hidden="true">{isSidebarCollapsed ? "›" : "‹"}</span>
        </button>

        {/* Main timeline and track area */}
        <MainContent
          tracks={tracks}
          recording={recording}
          totalLengthMs={version?.lengthMs || 0}
          requestAssetPreview={getAssetPreviewInfo}
          onAssetDrop={handleAssetDrop}
          onSegmentMove={handleSegmentMove}
          onSegmentDelete={handleSegmentDelete}
          onCutTrack={handleCutTrack}
          onCopyTrack={handleCopyTrack}
          onPasteTrack={handlePasteTrack}
          hasClipboard={hasClipboardFlag}
          onMute={(trackId, muted) =>
            handleTrackPropertyUpdate(trackId, "mute", muted, "setTrackMute")
          }
          onSolo={(trackId, soloed) =>
            handleTrackPropertyUpdate(trackId, "solo", soloed, "setTrackSolo")
          }
          onDelete={handleDeleteTrack}
          onCutSegmentRange={handleCutSegmentRange}
        />
      </div>

      {/* Bottom footer with transport controls and recording */}
      <Footer
        version={version}
        onRecordComplete={handleImportSuccess}
        onRecordStart={({stream, startTs}) => {
          // Stop playback when recording starts
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
