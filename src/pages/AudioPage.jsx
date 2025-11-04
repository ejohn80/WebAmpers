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
            // Reconstruct the Tone.ToneAudioBuffer from the stored raw data.
            // Support both the older shape (track.buffer) and the newer
            // shape where buffers are stored per-segment (track.segments[0].buffer).
            const maybeBufferData = savedTrack.buffer?.channels ? savedTrack.buffer : (savedTrack.segments && savedTrack.segments[0] && savedTrack.segments[0].buffer && savedTrack.segments[0].buffer.channels ? savedTrack.segments[0].buffer : null);

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

              // Attach a Tone.ToneAudioBuffer at the track-level so existing
              // restore path (addTrackFromBuffer) can find it.
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
    const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);
    // Update the component's state to re-render with the new track list.
    // We create a new array to ensure React detects the state change.
    setTracks([...audioManager.tracks]);

    try {
      // Persist the created AudioTrack (so it includes the generated id)
      if (createdTrack) {
        await dbManager.addTrack(createdTrack);
      } else {
        await dbManager.addTrack(importedAudioData);
      }
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

  // Build the minimal version object for the playback engine from the
  // currently active track (only play/display the last imported track).
  const active = tracks && tracks.length > 0 ? tracks[tracks.length - 1] : null;
  const version = active
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

        vs.tracks.push({
          id: active.id,
          name: active.name ?? 'Imported',
          gainDb: typeof active.volume === 'number' ? active.volume : 0,
          pan: typeof active.pan === 'number' ? active.pan : 0,
          mute: !!active.mute,
          solo: !!active.solo,
          color: active.color || '#888',
        });

        let maxEndMs = 0;
        (active.segments || []).forEach((s) => {
          const fileUrl = s.buffer ?? s.fileUrl ?? null;
          const startOnTimelineMs = s.startOnTimelineMs ?? (s.startOnTimeline ? Math.round(s.startOnTimeline * 1000) : 0);
          const startInFileMs = (s.offset ? Math.round(s.offset * 1000) : (s.startInFileMs ?? 0));
          const durationMs = s.duration ? Math.round(s.duration * 1000) : (s.durationMs ?? 0);

          vs.segments.push({
            id: s.id ?? `seg_${Math.random().toString(36).slice(2,8)}`,
            trackId: active.id,
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

        vs.lengthMs = maxEndMs || 60000;
        return vs;
      })()
    : null;

  // --- RENDERING ---

  // Inline style to pass the dynamic sidebar width as a CSS variable.
  const mainContentStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  };
  const activeTrack = tracks.length > 0 ? tracks[tracks.length - 1] : null;

  // Keep a reference to the playback engine so we can call control methods
  // (setTrackMute, setTrackSolo) from this component when UI toggles occur.
  const engineRef = React.useRef(null);

  const handleEngineReady = (engine) => {
    engineRef.current = engine;
  };

  return (
    <div className="app-container">
      {/* 1. Header Section */}
      <Header onImportSuccess={handleImportSuccess} onImportError={handleImportError} />
      {/* 2. Middle Area (Sidebar/Main Content Split) */}
      <div 
        className="main-content-area" 
        style={mainContentStyle} 
      >
        <Sidebar width={sidebarWidth} />

        {/* Movable Divider Line */}
        <div 
          className="divider"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        />
        
        <MainContent
          track={activeTrack}
          onMute={async (trackId, muted) => {
            try {
              engineRef.current?.setTrackMute(trackId, muted);
            } catch (e) {
              console.warn('Engine setTrackMute failed', e);
            }

            // Update model and persist
            const t = audioManager.tracks.find((x) => x.id === trackId);
            if (t) {
              try {
                t.mute = muted;
                // Persist the updated track; prefer updateTrack if available
                if (dbManager.updateTrack) await dbManager.updateTrack(t);
              } catch (e) {
                console.warn('Failed to persist mute change', e);
              }
              // Refresh local state
              setTracks([...audioManager.tracks]);
            }
          }}
          onSolo={async (trackId, soloed) => {
            try {
              engineRef.current?.setTrackSolo(trackId, soloed);
            } catch (e) {
              console.warn('Engine setTrackSolo failed', e);
            }

            const t = audioManager.tracks.find((x) => x.id === trackId);
            if (t) {
              try {
                t.solo = soloed;
                if (dbManager.updateTrack) await dbManager.updateTrack(t);
              } catch (e) {
                console.warn('Failed to persist solo change', e);
              }
              setTracks([...audioManager.tracks]);
            }
          }}
        />
      </div>
      
      {/* 3. Footer Section */}
      <Footer />
  <WebAmpPlayback version={version} onEngineReady={handleEngineReady} />
    </div>
  );
}

export default AudioPage;