import React, { useState } from 'react';
import AudioExporter from './AudioExporter'; 
import './AudioExportButton.css';

/**
 * A button component that, when clicked, opens a modal 
 * to display the AudioExporter component.
 *
 * @param {object} props
 * @param {Tone.ToneAudioBuffer} props.audioBuffer - The audio buffer to be exported.
 * @param {function} props.onExportComplete - Callback after a successful export.
 */
const AudioExportButton = ({ audioBuffer, onExportComplete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isReady = !!audioBuffer;

  const handleOpen = () => {
    if (isReady) {
      setIsModalOpen(true);
    } else {
      alert("Please import or generate an audio track first.");
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
  };

  const handleExportComplete = (result) => {
    handleClose();
    if (onExportComplete) {
      onExportComplete(result);
    }
    // Simple alert on success
    // alert(`Export complete: ${result.format} file saved.`);
  };

  return (
    <>
      <button
        className="import-button export-button"
        onClick={handleOpen}
        disabled={!isReady}
        title={!isReady ? "Please load audio first" : "Open Export Settings"}
      >
        Export Audio
      </button>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={handleClose}>
          {/* Prevent clicks on the content from closing the modal */}
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close-button" onClick={handleClose}>&times;</button>
            <AudioExporter 
              audioBuffer={audioBuffer} 
              onExportComplete={handleExportComplete}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default AudioExportButton;