import React, { useState, useRef, useEffect } from 'react';
import DraggableDiv from '../components/Generic/DraggableDiv';
import AudioImportButton from '../components/AudioImport/AudioImportButton';
import Waveform from '../components/Waveform/Waveform';
import './AudioPage.css';

const MIN_WIDTH = 0; // Minimum allowed width for the sidebar in pixels
const MAX_WIDTH = 300; // Maximum allowed width for the sidebar in pixels

/**
 * AudioPage component provides a resizable layout with a sidebar and main content area.
 * It features a draggable divider to adjust the sidebar's width and displays the
 * waveform of an imported audio file.
 */
function AudioPage() {
  // State to manage the current width of the sidebar in pixels.
  const [sidebarWidth, setSidebarWidth] = useState(250);
  // Ref to the main content area (the grid container) for mouse position calculations.
  const mainContentRef = useRef(null);
  // State to track if the user is currently dragging the divider
  const [isDragging, setIsDragging] = useState(false);

  // --- MOUSE EVENT HANDLERS ---

  // Start dragging: set isDragging to true when the mouse is pressed down on the divider
  /**
   * Initiates the dragging process when the mouse button is pressed down on the divider.
   * @param {MouseEvent} e - The mouse event object.
   */
  const handleMouseDown = (e) => {
    e.preventDefault(); // Prevent default browser drag behavior (e.g., selecting text)
    setIsDragging(true);
  };

  // Stop dragging: set isDragging to false when the mouse is released anywhere
  /**
   * Terminates the dragging process when the mouse button is released.
   */
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle mouse movement: update the sidebar width if dragging is true
  /**
   * Updates the sidebar's width based on the mouse's horizontal position during dragging.
   * @param {MouseEvent} e - The mouse event object.
   */
  const handleMouseMove = (e) => {
    if (!isDragging || !mainContentRef.current) return;

    // Get the current mouse position relative to the main content area's left edge
    const newWidth = e.clientX - mainContentRef.current.getBoundingClientRect().left;

    // Constrain the width within min/max bounds
    const constrainedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

    setSidebarWidth(constrainedWidth);
  };

  // --- EFFECT HOOK FOR GLOBAL LISTENERS ---

  /**
   * Attaches and detaches global mouse event listeners for resizing.
   */
  useEffect(() => {
    // Attach event listeners to the window to ensure dragging stops even if the cursor moves off the container
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Cleanup function to remove the listeners when the component unmounts
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]); // Re-run effect if isDragging changes

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
      {/* 1. Header Section (Red) */}
      <DraggableDiv color="red">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>**Header** (Red Section)</span>
          <AudioImportButton 
            onImportSuccess={(result) => {
              console.log("Audio imported, setting state:", result);
              setAudioData(result); // Store the entire result object in state
            }}
            onImportError={(error) => {
              alert(`Import failed: ${error.message}`);
              setAudioData(null); // Clear any previous audio data on error
              // TODO: Show a more user-friendly error message in the UI
            }}
          />
        </div>
      </DraggableDiv>

      {/* 2. MIDDLE AREA (Blue/Purple Split) */}
      <div 
        className="main-content-area" 
        style={mainContentStyle} 
        ref={mainContentRef} // Attach ref for mouse position calculations
      >
        {/* Blue Section (Sidebar) */}
        <DraggableDiv color="blue" className="sidebar-container">
          **Sidebar** (Blue Section, Current Width: {Math.round(sidebarWidth)}px)
        </DraggableDiv>

        {/* Movable Divider Line */}
        <div 
          className="divider"
          onMouseDown={handleMouseDown}
          title="Drag to resize sidebar"
        />

        {/* Purple Section (Main Content) */}
        <DraggableDiv color="purple">
          {audioData ? (
            <Waveform audioBuffer={audioData.buffer} />
          ) : (
            <div style={{ textAlign: 'center', alignSelf: 'center' }}>
              <h2>Main Content</h2>
              <p>Import an audio file to see its waveform here.</p>
            </div>
          )}
        </DraggableDiv>
      </div>
      
      {/* 3. Footer Section (Lime Green) */}
      <DraggableDiv color="lime">
        **Footer** (Lime Green Section)
      </DraggableDiv>
    </div>
  );
}

export default AudioPage;