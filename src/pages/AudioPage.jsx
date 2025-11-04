import React, { useState, useEffect } from 'react';
import './AudioPage.css';
import * as Tone from 'tone';

// Import the newly created layout components
import Header from '../components/Layout/Header';
import Sidebar from '../components/Layout/Sidebar';
import MainContent from '../components/Layout/MainContent';
import Footer from '../components/Layout/Footer';
import { audioManager } from '../managers/AudioManager';
import WebAmpPlayback from '../playback/playback.jsx';
import { dbManager } from '../managers/DBManager';

const MIN_WIDTH = 0; // Minimum allowed width for the sidebar in pixels
const MAX_WIDTH = 300; // Maximum allowed width for the sidebar in pixels

/**
 * AudioPage component provides a resizable layout with a sidebar and main content area.
 */
function AudioPage() {
  // State to manage the current width of the sidebar in pixels.
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  // State to hold the list of tracks from the AudioManager
  const [tracks, setTracks] = useState(audioManager.tracks);

  // Effect to load tracks from IndexedDB on initial component mount
  useEffect(() => {
    const loadTracksFromDB = async () => {
      try {
        const savedTracks = await dbManager.getAllTracks();
        if (savedTracks && savedTracks.length > 0) {
          console.log('Loading tracks from IndexedDB:', savedTracks);
          let needsStateUpdate = false;

          for (const savedTrack of savedTracks) {
            // Reconstruct the Tone.ToneAudioBuffer from the stored raw data
            if (savedTrack.buffer && savedTrack.buffer.channels) {
              const bufferData = savedTrack.buffer;
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
              needsStateUpdate = true;

              // Set the audioData for the first loaded track to initialize the player
              // This is the missing piece to make playback work on refresh.
              if (!audioData) setAudioData(savedTrack);
            }
          }
          if (needsStateUpdate) {
            setTracks([...audioManager.tracks]);
          }
        }
      } catch (error) {
        console.error('Failed to load tracks from IndexedDB:', error);
      }
    };

    loadTracksFromDB();
  }, []); // The empty dependency array ensures this runs only once on mount

  /**
   * Toggles the sidebar width between its minimum and maximum allowed values.
   */
  const toggleSidebar = () => {
    setSidebarWidth(prevWidth => (prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH));
  };

  const handleImportSuccess = async (importedAudioData) => {
    console.log('Audio imported successfully, creating track:', importedAudioData);
    setAudioData(importedAudioData);
    // Use the AudioManager to create a new track from the imported data
    audioManager.addTrackFromBuffer(importedAudioData);
    // Update the component's state to re-render with the new track list.
    // We create a new array to ensure React detects the state change.
    setTracks([...audioManager.tracks]);

    try {
      await dbManager.addTrack(importedAudioData);
      console.log('Track saved to IndexedDB');
    } catch (error) {
      console.error('Failed to save track to IndexedDB:', error);
    }
  };

  const handleImportError = (error) => {
    alert(`Import failed: ${error.message}`);
    // TODO: Show a more user-friendly error message in the UI
  };
  // --- STATE FOR AUDIO DATA ---
  // Holds the object returned by the Import button (buffer/URL/metadata).
  const [audioData, setAudioData] = useState(null);

  // ---- Helpers used to build a minimal "version" object for the player ----

  /**
   * parseDurationMs:
   *  Accepts either:
   *   - number (seconds)  -> converts to ms
   *   - string "mm:ss(.ms)" -> parses and converts to ms
   *   - otherwise returns 0
   */
  const parseDurationMs = (d) => {
    if (typeof d === "number" && !Number.isNaN(d)) return Math.round(d * 1000); // seconds → ms
    if (typeof d === "string") {
      // support "mm:ss" or "mm:ss.mmm"
      const m = d.match(/^(\d+):(\d{2})(?:\.(\d{1,3}))?$/);
      if (m) {
        const mm = parseInt(m[1], 10);
        const ss = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
        return (mm * 60 + ss) * 1000 + ms;
      }
    }
    return 0;
  };

  /**
   * srcFromImport:
   *  Chooses the best audio source field from the importer’s result.
   *  Tone.Player accepts a URL/blob URL or an AudioBuffer.
   */
  const srcFromImport = (ad) =>
    ad?.fileUrl ?? ad?.objectUrl ?? ad?.url ?? ad?.blobUrl ?? ad?.buffer ?? "";

  /**
   * durationMsOf:
   *  Returns the best-known duration in ms from the importer result, trying
   *  buffer.duration (seconds) → durationSec → "mm:ss" string → durationMs.
   */
  const durationMsOf = (ad) =>
    (ad?.buffer?.duration ? Math.round(ad.buffer.duration * 1000) : 0) ||
    (typeof ad?.durationSec === "number" ? Math.round(ad.durationSec * 1000) : 0) ||
    parseDurationMs(ad?.duration) ||
    (typeof ad?.durationMs === "number" ? Math.round(ad.durationMs) : 0);

  // Build the minimal version object for the playback engine when we have audio
  const version = audioData
    ? {
        bpm: 120,
        timeSig: [4, 4],
        lengthMs: durationMsOf(audioData) || 60000, // fallback 60s so slider works
        tracks: [
          {
            id: "t1",
            name: audioData.name ?? "Imported",
            gainDb: 0,
            pan: 0,
            mute: false,
            solo: false,
            color: "#888",
          },
        ],
        segments: [
          {
            id: "s1",
            trackId: "t1",
            fileUrl: srcFromImport(audioData), // can be URL OR AudioBuffer
            startOnTimelineMs: 0,
            startInFileMs: 0,
            durationMs: durationMsOf(audioData), // non-zero so playback is audible
            gainDb: 0,
            fades: { inMs: 5, outMs: 5 },
          },
        ],
        loop: { enabled: false },
        masterChain: [],
      }
    : null;

  // --- RENDERING ---

  // Inline style to pass the dynamic sidebar width as a CSS variable.
  const mainContentStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  };
  // Show the most recently added/recorded track in the main content
  const activeTrack = tracks.length > 0 ? tracks[tracks.length - 1] : null;
  // Live recording state for preview
  const [recording, setRecording] = useState({ stream: null, startTs: 0 });

  return (
    <div className="app-container">
      {/* 1. Header Section */}
      <Header 
        onImportSuccess={handleImportSuccess}
        onImportError={handleImportError}
    />

      {/* 2. Middle Area (Sidebar/Main Content Split) */}
      <div 
        className="main-content-area" 
        style={mainContentStyle} 
      >
        <Sidebar
          width={sidebarWidth}
          // Use the centralized handlers so imported audio is turned into a track
          onImportSuccess={handleImportSuccess}
          onImportError={handleImportError}
        />

        {/* Movable Divider Line */}
        <div 
          className="divider"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        />
        
        {/* <MainContent track={activeTrack} recording={recording} /> */}
        <MainContent 
            track={activeTrack} 
            recording={recording}
            // Pass the raw import data as well, in case MainContent uses it directly
            audioData={audioData} 
        />
      </div>
      
      {/* 3. Footer Section */}
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
