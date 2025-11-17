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
  
  // Track if we've already loaded from DB to prevent duplication
  const hasLoadedFromDB = useRef(false);

  const engineRef = React.useRef(null);

  // Load tracks from IndexedDB on mount - ONLY ONCE
  useEffect(() => {
    if (hasLoadedFromDB.current) return;
    
    const loadTracksFromDB = async () => {
      try {
        const savedTracks = await dbManager.getAllTracks();
        if (savedTracks && savedTracks.length > 0) {
          console.log("Loading tracks from IndexedDB:", savedTracks);
          
          // Clear existing tracks to prevent duplication
          audioManager.clearAllTracks();
          
          for (const savedTrack of savedTracks) {
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

              savedTrack.buffer = new Tone.ToneAudioBuffer(audioBuffer);
              audioManager.addTrackFromBuffer(savedTrack);
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
  }, []); // Empty dependency array - run only once

  const toggleSidebar = () => {
    setSidebarWidth((prevWidth) =>
      prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH
    );
  };

  // Handle audio import - creates a NEW track
  const handleImportSuccess = async (importedAudioData) => {
    console.log("Audio imported successfully, creating NEW track:", importedAudioData);
    
    // Create a NEW track (not replacing existing ones)
    const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);

    // Update state to include all tracks
    setTracks([...audioManager.tracks]);

    // Set audioData if this is the first track
    if (audioManager.tracks.length === 1) {
      setAudioData(importedAudioData);
    }

    try {
      if (createdTrack) {
        await dbManager.addTrack(createdTrack);
        console.log("Track saved to IndexedDB");
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

  // Handle track deletion - NO CONFIRMATION POPUP
  const handleDeleteTrack = async (trackId) => {
    try {
      console.log(`Deleting track ${trackId}...`);
      
      // Delete from AudioManager
      const deleted = audioManager.deleteTrack(trackId);
      
      if (deleted) {
        // Delete from IndexedDB
        try {
          await dbManager.deleteTrack(trackId);
          console.log(`Track ${trackId} deleted from database`);
        } catch (e) {
          console.warn("Failed to delete track from DB:", e);
        }

        // Update state
        setTracks([...audioManager.tracks]);
        
        console.log(`Track ${trackId} deleted successfully`);
      } else {
        console.warn(`Failed to delete track ${trackId} from manager`);
      }
    } catch (error) {
      console.error("Failed to delete track:", error);
    }
  };

  // Build version object for playback engine - includes ALL tracks
  const version = tracks && tracks.length > 0
    ? (() => {
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

        // Process ALL tracks
        tracks.forEach((track) => {
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
      })()
    : null;

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
        onImportSuccess={handleImportSuccess}
        onImportError={handleImportError}
        audioBuffer={audioBuffer}
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
        onRecordStart={({ stream, startTs }) => setRecording({ stream, startTs })}
        onRecordStop={() => setRecording({ stream: null, startTs: 0 })}
      />
    </div>
  );
}

export default AudioPage;