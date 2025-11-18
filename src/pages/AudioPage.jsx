import React, { useState, useEffect, useContext, useRef } from "react";
import "./AudioPage.css";
import * as Tone from "tone";

import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import MainContent from "../components/Layout/MainContent";
import Footer from "../components/Layout/Footer";
import { audioManager } from "../managers/AudioManager";
import WebAmpPlayback from "../playback/playback.jsx";
import { dbManager } from "../managers/DBManager";
import { AppContext } from "../context/AppContext";

const MIN_WIDTH = 0;
const MAX_WIDTH = 300;

function AudioPage() {
  const { setEngineRef, applyEffectsToEngine } = useContext(AppContext);
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [audioData, setAudioData] = useState(null);
  const [recording, setRecording] = useState({ stream: null, startTs: 0 });
  
  const hasLoadedFromDB = useRef(false);
  const engineRef = React.useRef(null);

  // Helper function to build version from tracks
  const buildVersionFromTracks = (tracksArray) => {
    if (!tracksArray || tracksArray.length === 0) return null;
    
    const vs = {
      bpm: 120,
      timeSig: [4, 4],
      lengthMs: 60000,
      tracks: [],
      segments: [],
      loop: { enabled: false },
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
          fades: s.fades ?? { inMs: 5, outMs: 5 },
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
          
          // FIX: Use a Map to track unique tracks by ID to prevent duplicates
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
                buffer: new Tone.ToneAudioBuffer(audioBuffer)
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
    console.log("Audio imported successfully, creating NEW track:", importedAudioData);
    
    const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);
    setTracks([...audioManager.tracks]);

    if (audioManager.tracks.length === 1) {
      setAudioData(importedAudioData);
    }

    try {
      if (createdTrack) {
        // FIX: Capture the DB-assigned ID and update the track object
        const assignedId = await dbManager.addTrack(createdTrack);
        
        // Update the track's ID to match what's in IndexedDB
        if (assignedId !== undefined && assignedId !== createdTrack.id) {
          console.log(`Updating track ID from ${createdTrack.id} to ${assignedId}`);
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
      
      // STOP PLAYBACK FIRST and reset to play button
      if (engineRef.current) {
        try {
          engineRef.current.stop();
        } catch (e) {
          console.warn("Failed to stop playback:", e);
        }
      }
      
      const deleted = audioManager.deleteTrack(trackId);
      
      if (deleted) {
        try {
          await dbManager.deleteTrack(trackId);
          
          // FIX: Also clean up any localStorage track state when deleting
          try {
            localStorage.removeItem(`webamp.track.${trackId}`);
          } catch (e) {
            console.warn("Failed to remove track state from localStorage:", e);
          }
        } catch (e) {
          console.warn("Failed to delete track from DB:", e);
        }

        setTracks([...audioManager.tracks]);
        
        // If no tracks left, dispose engine completely
        if (audioManager.tracks.length === 0) {
          try {
            if (engineRef.current) {
              engineRef.current.dispose();
              // Create a new empty engine to prevent ghost playback
              const emptyVersion = {
                bpm: 120,
                timeSig: [4, 4],
                lengthMs: 0,
                tracks: [],
                segments: [],
                loop: { enabled: false },
                masterChain: [],
              };
              await engineRef.current.load(emptyVersion);
            }
          } catch (e) {
            console.warn("Failed to dispose engine:", e);
          }
        } else {
          // Reload engine with remaining tracks
          const newVersion = buildVersionFromTracks(audioManager.tracks);
          if (newVersion && engineRef.current) {
            try {
              await engineRef.current.load(newVersion);
            } catch (e) {
              console.warn("Failed to reload engine:", e);
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

  const audioBuffer = tracks.length > 0
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
        onRecordStart={({ stream, startTs }) => {
          // STOP PLAYBACK when recording starts
          if (engineRef.current) {
            try {
              engineRef.current.stop();
            } catch (e) {
              console.warn("Failed to stop playback:", e);
            }
          }
          setRecording({ stream, startTs });
        }}
        onRecordStop={() => setRecording({ stream: null, startTs: 0 })}
      />
    </div>
  );
}

export default AudioPage;