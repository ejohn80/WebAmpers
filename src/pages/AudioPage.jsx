import React, { useState } from 'react';
import './AudioPage.css';
import Header from '../components/Layout/Header';
import Sidebar from '../components/Layout/Sidebar';
import MainContent from '../components/Layout/MainContent';
import Footer from '../components/Layout/Footer';
import { audioManager } from '../managers/AudioManager';
// import WebAmpPlayback from '../playback/playback.jsx';

const MIN_WIDTH = 0;
const MAX_WIDTH = 300;

function AudioPage() {
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);
  const [tracks, setTracks] = useState(audioManager.tracks);
  const [activeTrackId, setActiveTrackId] = useState(null);

  const toggleSidebar = () => {
    setSidebarWidth(prevWidth => (prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH));
  };

  const handleImportSuccess = (importedAudioData) => {
    console.log('=== IMPORT SUCCESS ===');
    console.log('Imported data:', importedAudioData);
    
    // Use AudioManager's method
    audioManager.addTrackFromBuffer(importedAudioData);
    
    // Update state
    const updatedTracks = [...audioManager.tracks];
    setTracks(updatedTracks);
    
    if (updatedTracks.length > 0) {
      setActiveTrackId(updatedTracks[0].id);
    }
    
    console.log('First track:', updatedTracks[0]);
    console.log('Track properties:', Object.keys(updatedTracks[0]));
    console.log('===================');
  };

  const handleImportError = (error) => {
    console.error('Import error:', error);
    alert(`Import failed: ${error.message}`);
  };

  const handleExportComplete = (result) => {
    console.log('Export completed:', result);
    alert(`Audio exported successfully as ${result.format.toUpperCase()}!`);
  };

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
    </div>
  );
}

export default AudioPage;