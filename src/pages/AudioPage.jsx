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

const MIN_WIDTH = 0;
const MAX_WIDTH = 300;

function AudioPage() {
  const {
    setEngineRef,
    applyEffectsToEngine,
    activeSession,
  } = useContext(AppContext);
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [audioData, setAudioData] = useState(null);
  const [recording, setRecording] = useState({stream: null, startTs: 0});

  const engineRef = React.useRef(null);
  const lastSessionRef = useRef(null);

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
  useEffect(() => {
    if (!activeSession) return;
    
    // Skip if session hasn't changed
    if (lastSessionRef.current === activeSession) return;
    
    console.log(`[AudioPage] Loading session ${activeSession}`);
    lastSessionRef.current = activeSession;

    const loadSessionTracks = async () => {
      try {
        const savedTracks = await dbManager.getAllTracks(activeSession);
        console.log(`[AudioPage] Found ${savedTracks.length} tracks for session ${activeSession}`);

        // Clear current tracks
        audioManager.clearAllTracks();

        // Reconstruct tracks from DB
        for (const savedTrack of savedTracks) {
          const maybeBufferData = savedTrack.segments?.[0]?.buffer;

          if (maybeBufferData && maybeBufferData.channels) {
            const bufferData = maybeBufferData;
            const audioBuffer = Tone.context.createBuffer(
              bufferData.numberOfChannels,
              bufferData.length,
              bufferData.sampleRate
            );

            for (let i = 0; i < bufferData.numberOfChannels; i++) {
              audioBuffer.copyToChannel(bufferData.channels[i], i);
            }

            const trackData = {
              ...savedTrack,
              buffer: new Tone.ToneAudioBuffer(audioBuffer),
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
              await engineRef.current.load({
                bpm: 120,
                timeSig: [4, 4],
                lengthMs: 0,
                tracks: [],
                segments: [],
                loop: {enabled: false},
                masterChain: [],
              });
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

  const handleImportSuccess = async (importedAudioData) => {
    if (!activeSession) {
      console.error("No active session!");
      return;
    }

    console.log(`[AudioPage] Importing track into session ${activeSession}`);

    const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);
    setTracks([...audioManager.tracks]);

    if (audioManager.tracks.length === 1) {
      setAudioData(importedAudioData);
    }

    // Save to DB with sessionId
    try {
      if (createdTrack) {
        const assignedId = await dbManager.addTrack(createdTrack, activeSession);
        console.log(`Track saved to session ${activeSession} with ID: ${assignedId}`);
        
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

  return (
    <div className="app-container">
      <Header
        tracks={tracks}
        totalLengthMs={version?.lengthMs || 0}
        onImportSuccess={handleImportSuccess}
        onImportError={handleImportError}
        onExportComplete={handleExportComplete}
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
          totalLengthMs={version?.lengthMs || 0}
          onMute={async (trackId, muted) => {
            try {
              engineRef.current?.setTrackMute(trackId, muted);
            } catch (e) {
              console.warn("Engine setTrackMute failed", e);
            }
            const t = audioManager.tracks.find((x) => x.id === trackId);
            if (t) {
              t.mute = muted;
              setTracks([...audioManager.tracks]);
              // Save to DB
              try {
                await dbManager.updateTrack(t);
              } catch (e) {
                console.warn("Failed to persist mute change", e);
              }
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
              t.solo = soloed;
              setTracks([...audioManager.tracks]);
              // Save to DB
              try {
                await dbManager.updateTrack(t);
              } catch (e) {
                console.warn("Failed to persist solo change", e);
              }
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
