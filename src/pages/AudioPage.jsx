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
    const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
    const [tracks, setTracks] = useState(audioManager.tracks);
    // --- STATE FOR AUDIO DATA --- (Kept from main/old approach for backward compatibility)
    const [audioData, setAudioData] = useState(null); 
    // Live recording state for preview (Kept from main/old approach)
    const [recording, setRecording] = useState({ stream: null, startTs: 0 }); 

    // Keep a reference to the playback engine so we can call control methods
    const engineRef = React.useRef(null);

    useEffect(() => {
        const loadTracksFromDB = async () => {
            try {
                const savedTracks = await dbManager.getAllTracks();
                if (savedTracks && savedTracks.length > 0) {
                    console.log('Loading tracks from IndexedDB:', savedTracks);
                    let needsStateUpdate = false;

                    for (const savedTrack of savedTracks) {
                        // Reconstruct the Tone.ToneAudioBuffer from the stored raw data.
                        // Support both older (track.buffer) and newer (track.segments[0].buffer) shapes.
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
    }, []); 

    const toggleSidebar = () => {
        setSidebarWidth(prevWidth => (prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH));
    };

    const handleImportSuccess = async (importedAudioData) => {
        console.log('Audio imported successfully, creating track:', importedAudioData);
        setAudioData(importedAudioData); // Update raw data for immediate player setup
        
        // Use the AudioManager to create a new track and capture the created track object
        const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);
        
        // Update the component's state to re-render with the new track list.
        setTracks([...audioManager.tracks]);

        try {
            // Persist the created AudioTrack (so it includes the generated id)
            if (createdTrack) {
                const savedId = await dbManager.addTrack(createdTrack);
                // Ensure in-memory track uses the same id as stored in DB.
                // If IndexedDB generated a numeric id, sync it back onto the
                // AudioTrack so future updates use the same key.
                if (savedId && createdTrack.id !== savedId) {
                    createdTrack.id = savedId;
                    setTracks([...audioManager.tracks]);
                }
            } else {
                // Fallback for older data shape (from main)
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
    
    // ---- Helpers used to build a minimal "version" object for the player ----
    // const parseDurationMs = (d) => { /* ... (full function code from main) ... */ };
    // const srcFromImport = (ad) => { /* ... (full function code from main) ... */ };
    // const durationMsOf = (ad) => { /* ... (full function code from main) ... */ };

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
                    id: s.id ?? `seg_${Math.random().toString(36).slice(2, 8)}`,
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

    const mainContentStyle = {
        '--sidebar-width': `${sidebarWidth}px`,
    };
    const activeTrack = tracks.length > 0 ? tracks[tracks.length - 1] : null;
    
    const handleEngineReady = (engine) => {
        engineRef.current = engine;
    };

    return (
        <div className="app-container">
            {/* 1. Header Section - Add back import props (from main) */}
            <Header 
                onImportSuccess={handleImportSuccess}
                onImportError={handleImportError}
            />

            {/* 2. Middle Area (Sidebar/Main Content Split) */}
            <div 
                className="main-content-area" 
                style={mainContentStyle} 
            >
                {/* Sidebar - Add back import props (from main) */}
                <Sidebar 
                    width={sidebarWidth} 
                    onImportSuccess={handleImportSuccess} 
                    onImportError={handleImportError} 
                />

                {/* Movable Divider Line */}
                <div 
                    className="divider"
                    onClick={toggleSidebar}
                    title="Toggle sidebar"
                />
                
                {/* */}
                <MainContent
                    track={activeTrack}
                    recording={recording}
                    audioData={audioData}
                    onMute={async (trackId, muted) => {
                        try {
                            engineRef.current?.setTrackMute(trackId, muted);
                        } catch (e) {
                            console.warn('Engine setTrackMute failed', e);
                        }
                        const t = audioManager.tracks.find((x) => x.id === trackId);
                        if (t) {
                            try {
                                t.mute = muted;
                                if (dbManager.updateTrack) await dbManager.updateTrack(t);
                            } catch (e) {
                                console.warn('Failed to persist mute change', e);
                            }
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
            
            {/* 3. Footer Section - MERGED */}
            <Footer
                version={version} // Passed from main, but using TrackLane's 'version' structure
                onRecordComplete={handleImportSuccess}
                onRecordStart={({ stream, startTs }) => setRecording({ stream, startTs })}
                onRecordStop={() => setRecording({ stream: null, startTs: 0 })}
            />
        </div>
    );
}

export default AudioPage;