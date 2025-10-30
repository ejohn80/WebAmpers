import React, { useState, useRef, useEffect } from 'react';
import './AudioPage.css';

// Import the newly created layout components
import Header from '../components/Layout/Header';
import Sidebar from '../components/Layout/Sidebar';
import MainContent from '../components/Layout/MainContent';
import Footer from '../components/Layout/Footer';

const MIN_WIDTH = 0; // Minimum allowed width for the sidebar in pixels
const MAX_WIDTH = 300; // Maximum allowed width for the sidebar in pixels

/**
 * AudioPage component provides a resizable layout with a sidebar and main content area.
 * It features a draggable divider to adjust the sidebar's width and displays the
 * waveform of an imported audio file.
 */
function AudioPage() {
  // State to manage the current width of the sidebar in pixels.
  const [sidebarWidth, setSidebarWidth] = useState(MAX_WIDTH);

  /**
   * Toggles the sidebar width between its minimum and maximum allowed values.
   */
  const toggleSidebar = () => {
    setSidebarWidth(prevWidth => (prevWidth > MIN_WIDTH ? MIN_WIDTH : MAX_WIDTH));
  };

  // --- STATE FOR AUDIO DATA ---
  // State to hold the result from the audio import, including buffer and metadata.
  const [audioData, setAudioData] = useState(null);

  // --- RENDERING ---

  // Inline style to pass the dynamic sidebar width as a CSS variable.
  const mainContentStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  };

  return (
    <div className="app-container">
      {/* 1. Header Section */}
      <Header />

      {/* 2. Middle Area (Sidebar/Main Content Split) */}
      <div 
        className="main-content-area" 
        style={mainContentStyle} 
      >
        <Sidebar width={sidebarWidth} onImportSuccess={(result) => {
          console.log("Audio imported, setting state:", result);
          setAudioData(result); // Store the entire result object in state
        }}
        onImportError={(error) => {
          alert(`Import failed: ${error.message}`);
          setAudioData(null); // Clear any previous audio data on error
          // TODO: Show a more user-friendly error message in the UI
        }} />

        {/* Movable Divider Line */}
        <div 
          className="divider"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        />
        
        <MainContent audioData={audioData} />
      </div>
      
      {/* 3. Footer Section */}
      <Footer />
    </div>
  );
}

export default AudioPage;