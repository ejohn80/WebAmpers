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

/**
 * AudioPage component provides a resizable layout with a sidebar and main content area.
 */
function AudioPage() {
    const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
    const [tracks, setTracks] = useState(audioManager.tracks);
    const [audioData, setAudioData] = useState(null); 
    const [recording, setRecording] = useState({ stream: null, startTs: 0 }); 
    const engineRef = React.useRef(null);

    useEffect(() => {
        const loadTracksFromDB = async () => {
            try {
                const savedTracks = await dbManager.getAllTracks();
                if (savedTracks && savedTracks.length > 0) {
                    console.log('Loading tracks from IndexedDB:', savedTracks);
                    let needsStateUpdate = false;

                    for (const savedTrack of savedTracks) {
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

                            savedTrack.buffer = new Tone.ToneAudioBuffer(audioBuffer);
                            audioManager.addTrackFromBuffer(savedTrack);
                            needsStateUpdate = true;

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
        setAudioData(importedAudioData); 
        
        const createdTrack = audioManager.addTrackFromBuffer(importedAudioData);
        
        setTracks([...audioManager.tracks]);

        try {
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
    };
    
    const handleExportComplete = () => {
        console.log('Export process complete.');
    };

    // Helper functions for version object (Keeping the original/main branch logic)
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
    
    // FIX: Check activeTrack.buffer first, but fall back to activeTrack.segments[0].buffer 
    // to ensure the export button enables immediately after a fresh import or DB load.
    const audioBuffer = activeTrack 
        ? activeTrack.buffer || activeTrack.segments?.[0]?.buffer 
        : null;

    const handleEngineReady = (engine) => {
        engineRef.current = engine;
    };

    return (
        <div className="app-container">
            {/* 1. Header Section */}
            <Header 
                onImportSuccess={handleImportSuccess}
                onImportError={handleImportError}
                audioBuffer={audioBuffer} // Now uses the robust check
                onExportComplete={handleExportComplete}
            />

            {/* 2. Middle Area (Sidebar/Main Content Split) */}
            <div 
                className="main-content-area" 
                style={mainContentStyle} 
            >
                {/* Sidebar */}
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
                
                {/* Main Content */}
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
            
            {/* 3. Footer Section */}
            <Footer
                version={version}
                onRecordComplete={handleImportSuccess}
                onRecordStart={({ stream, startTs }) => setRecording({ stream, startTs })}
                onRecordStop={() => setRecording({ stream: null, startTs: 0 })}
            />
            {/* WebAmpPlayback remains at the bottom */}
            <WebAmpPlayback version={version} onEngineReady={handleEngineReady} />
        </div>
    );
}

export default AudioPage;