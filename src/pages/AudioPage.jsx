import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
} from "react";
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
  const {setEngineRef, applyEffectsToEngine} = useContext(AppContext);
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [audioData, setAudioData] = useState(null);
  const [recording, setRecording] = useState({stream: null, startTs: 0});
  const [trimBuffer, setTrimBuffer] = useState([]);
  const [selection, setSelection] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [editAction, setEditAction] = useState("trim"); // "trim" or "cut"
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [assetsRefreshTrigger, setAssetsRefreshTrigger] = useState(0);
  const hasLoadedFromDB = useRef(false);
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

  // Load tracks from IndexedDB on mount - ONLY ONCE
  useEffect(() => {
    if (hasLoadedFromDB.current) return;

    const loadTracksFromDB = async () => {
      try {
        const savedTracks = await dbManager.getAllTracks();
        if (savedTracks && savedTracks.length > 0) {
          console.log("Loading tracks from IndexedDB:", savedTracks);

          audioManager.clearAllTracks();
          const uniqueTracks = new Map();

          for (const savedTrack of savedTracks) {
            // Skip if we've already processed this track ID
            if (uniqueTracks.has(savedTrack.id)) {
              console.warn(`Skipping duplicate track ${savedTrack.id}`);
              continue;
            }

            uniqueTracks.set(savedTrack.id, savedTrack);
          }

          // Now process the unique tracks
          for (const savedTrack of uniqueTracks.values()) {
            const maybeBufferData = savedTrack.buffer?.channels
              ? savedTrack.buffer
              : savedTrack.segments?.[0]?.buffer?.channels
                ? savedTrack.segments[0].buffer
                : null;

            if (maybeBufferData) {
              const bufferData = maybeBufferData;
              const audioBuffer = Tone.context.createBuffer(
                bufferData.numberOfChannels,
                bufferData.length,
                bufferData.sampleRate
              );

              for (let i = 0; i < bufferData.numberOfChannels; i++) {
                audioBuffer.copyToChannel(bufferData.channels[i], i);
              }

              // Pass ALL properties to preserve state
              const trackData = {
                ...savedTrack,
                buffer: new Tone.ToneAudioBuffer(audioBuffer),
              };

              audioManager.addTrackFromBuffer(trackData);
            }
          }

          setTracks([...audioManager.tracks]);

          if (audioManager.tracks.length > 0 && !audioData) {
            setAudioData(audioManager.tracks[0]);
          }
        }

        hasLoadedFromDB.current = true;
      } catch (error) {
        console.error("Failed to load tracks from IndexedDB:", error);
        hasLoadedFromDB.current = true;
      }
    };

    loadTracksFromDB();
  }, []);

  const toggleSidebar = () => {
    setSidebarWidth((prevWidth) =>
      prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH
    );
  };

  const handleImportSuccess = async (importedAudioData) => {
    console.log(
      "Audio imported successfully, creating NEW track:",
      importedAudioData
    );

    const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);
    setTracks([...audioManager.tracks]);

    if (audioManager.tracks.length === 1) {
      setAudioData(importedAudioData);
    }

    try {
      if (createdTrack) {
        const assignedId = await dbManager.addTrack(createdTrack);

        // Update the track's ID to match what's in IndexedDB
        if (assignedId !== undefined && assignedId !== createdTrack.id) {
          console.log(
            `Updating track ID from ${createdTrack.id} to ${assignedId}`
          );
          createdTrack.id = assignedId;
          // Force a re-render with the updated ID
          setTracks([...audioManager.tracks]);
        }

        console.log("Track saved to IndexedDB with ID:", assignedId);
      }
    } catch (error) {
      console.error("Failed to save track to IndexedDB:", error);
    }
  };

  const handleImportError = (error) => {
    alert(`Import failed: ${error.message}`);
  };

  const handleExportComplete = () => {
    console.log("Export process complete.");
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
        // Clean up database
        try {
          await dbManager.deleteTrack(trackId);
        } catch (e) {
          console.warn("Failed to delete track from DB:", e);
        }

        // Clean up localStorage track state
        try {
          localStorage.removeItem(`webamp.track.${trackId}`);
        } catch (e) {
          console.warn("Failed to remove track state from localStorage:", e);
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

          // Create empty version
          const emptyVersion = {
            bpm: 120,
            timeSig: [4, 4],
            lengthMs: 0,
            tracks: [],
            segments: [],
            loop: {enabled: false},
            masterChain: [],
          };

          // Force reload with empty version
          if (engineRef.current) {
            try {
              await engineRef.current.load(emptyVersion);
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

  const mainContentStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  };

  // --- TRIM / CUT selection tool (segment-based) ---
  const applySelectionEdit = async (targetTrackId, mode = "trim") => {
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
            fades: {inMs: 5, outMs: 5},
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
    const pushSegmentSlice = (
      sourceSeg,
      sliceStartMs,
      sliceEndMs,
      newTimelineStart
    ) => {
      const srcStart = sourceSeg.startOnTimelineMs || 0;
      const srcFileStartMs = sourceSeg.startInFileMs || 0;

      const clampedStart = Math.max(srcStart, sliceStartMs);
      const clampedEnd = Math.min(
        srcStart + (sourceSeg.durationMs || 0),
        sliceEndMs
      );
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
      const clampedEnd = Math.min(
        srcStart + (sourceSeg.durationMs || 0),
        sliceEndMs
      );
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
          newSegments.push({...seg});
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
    const newTrack = {...track, segments: newSegments};
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

  const handleTrackSelection = React.useCallback(
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
          setSelection({startMs: 0, endMs});
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
        totalLengthMs={timelineLengthMs}
        onImportSuccess={handleImportSuccess}
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
        />

        <div
          className="divider"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        />

        <MainContent
          tracks={tracks}
          recording={recording}
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
