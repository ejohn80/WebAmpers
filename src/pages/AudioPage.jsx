import React, { useState, useEffect } from 'react';
import './AudioPage.css';
import * as Tone from 'tone';
import Header from '../components/Layout/Header';
import Sidebar from '../components/Layout/Sidebar';
import MainContent from '../components/Layout/MainContent';
import Footer from '../components/Layout/Footer';
import { audioManager } from '../managers/AudioManager';
import WebAmpPlayback from '../playback/playback.jsx';
import { dbManager } from '../managers/DBManager';

const MIN_WIDTH = 0;
const MAX_WIDTH = 300;

const bufferToWave = (buffer, len) => {
    const numOfChan = buffer.numberOfChannels;
    const channels = [];
    let l = len * numOfChan * 2 + 44;
    let offset = 0;
    let bufferArray = new ArrayBuffer(l);
    let view = new DataView(bufferArray);
    let sampleRate = buffer.sampleRate;
    
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    for (let i = 0; i < numOfChan; i++) {
        channels.push(buffer.getChannelData(i));
    }

    // Write WAV file headers
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, l - 8, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Sub-chunk size
    view.setUint16(offset, 1, true); offset += 2; // Audio Format (1 = PCM)
    view.setUint16(offset, numOfChan, true); offset += 2; // Number of Channels
    view.setUint32(offset, sampleRate, true); offset += 4; // Sample Rate
    view.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4; // Byte Rate
    view.setUint16(offset, numOfChan * 2, true); offset += 2; // Block Align
    view.setUint16(offset, 16, true); offset += 2; // Bits Per Sample (16-bit)
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, l - offset - 4, true); offset += 4; // Data size

    // Write audio data (interleaved 16-bit PCM)
    let index = 0;
    const maxVal = 32767; // Max value for 16-bit
    while (index < len) {
        for (let i = 0; i < numOfChan; i++) {
            // Convert Float32 data (-1.0 to 1.0) to 16-bit integer
            let s = Math.max(-1, Math.min(1, channels[i][index]));
            view.setInt16(offset, s * maxVal, true); 
            offset += 2;
        }
        index++;
    }

    return new Blob([bufferArray], { type: 'audio/wav' });
};


function AudioPage() {
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [activeTrackId, setActiveTrackId] = useState(null);

  const [audioData, setAudioData] = useState(null);

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
    console.error('Import error:', error);
    alert(`Import failed: ${error.message}`);
  };

  const handleExportComplete = () => {
    console.log('Export process complete.');
  };

  /**
   * parseDurationMs:
   * Accepts either:
   * - number (seconds) 	-> converts to ms
   * - string "mm:ss(.ms)" -> parses and converts to ms
   * - otherwise returns 0
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
   * Chooses the best audio source field from the importer’s result.
   * Tone.Player accepts a URL/blob URL or an AudioBuffer.
   */
  const srcFromImport = (ad) =>
    ad?.fileUrl ?? ad?.objectUrl ?? ad?.url ?? ad?.blobUrl ?? ad?.buffer ?? "";

  /**
   * durationMsOf:
   * Returns the best-known duration in ms from the importer result, trying
   * buffer.duration (seconds) → durationSec → "mm:ss" string → durationMs.
   */
  const durationMsOf = (ad) =>
    (ad?.buffer?.duration ? Math.round(ad.buffer.duration * 1000) : 0) ||
    (typeof ad?.durationSec === "number" ? Math.round(ad.durationSec * 1000) : 0) ||
    parseDurationMs(ad?.duration) ||
    (typeof ad?.durationMs === "number" ? Math.round(ad.durationMs) : 0);
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


  const mainContentStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  };

  const activeTrack = tracks.length > 0 ? tracks[0] : null;

  const audioBuffer = activeTrack && activeTrack.segments.length > 0
    ? activeTrack.segments[0].buffer
    : null;

  console.log('Active track:', activeTrack);
  console.log('Audio buffer for export:', audioBuffer);

  return (
    <div className="app-container">
      <Header
        onImportSuccess={handleImportSuccess}
        onImportError={handleImportError}
        audioBuffer={audioBuffer}
        onExportComplete={handleExportComplete}
        bufferToWave={bufferToWave} 
      />

      <div className="main-content-area" style={mainContentStyle}>
        <Sidebar width={sidebarWidth} />

        <div
          className="divider"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        />

        <MainContent
          key={activeTrackId}
          track={activeTrack}
        />
      </div>

      <Footer />
      <WebAmpPlayback version={version} />
    </div>
  );
}

export default AudioPage;