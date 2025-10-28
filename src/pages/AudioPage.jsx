import React, { useState } from 'react';
import './AudioPage.css';

// Import the newly created layout components
import Header from '../components/Layout/Header';
import Sidebar from '../components/Layout/Sidebar';
import MainContent from '../components/Layout/MainContent';
import Footer from '../components/Layout/Footer';
import { audioManager } from '../managers/AudioManager';

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

  /**
   * Toggles the sidebar width between its minimum and maximum allowed values.
   */
  const toggleSidebar = () => {
    setSidebarWidth(prevWidth => (prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH));
  };

  const handleImportSuccess = (importedAudioData) => {
    console.log('Audio imported successfully, creating track:', importedAudioData);
    // Use the AudioManager to create a new track from the imported data
    audioManager.addTrackFromBuffer(importedAudioData);
    // Update the component's state to re-render with the new track list.
    // We create a new array to ensure React detects the state change.
    setTracks([...audioManager.tracks]);
  };

  const handleImportError = (error) => {
    alert(`Import failed: ${error.message}`);
    // TODO: Show a more user-friendly error message in the UI
  };

  // --- RENDERING ---

  // Inline style to pass the dynamic sidebar width as a CSS variable.
  const mainContentStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  };
  const activeTrack = tracks.length > 0 ? tracks[0] : null;

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
        
        <MainContent track={activeTrack} />
      </div>
      
      {/* 3. Footer Section */}
      <Footer />
    </div>
  );
}

export default AudioPage;