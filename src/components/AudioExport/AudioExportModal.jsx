import React from "react";
import AudioExporter from "./AudioExporter";
import "../AudioExport/AudioExportButton.css";

/**
 * A modal wrapper for the AudioExporter component.
 */
const AudioExportModal = ({ tracks, totalLengthMs, onExportComplete, isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleExportComplete = (result) => {
    onClose();
    if (onExportComplete) {
      onExportComplete(result);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={handleOverlayClick}
    >
      <div
        style={{
          background: "#333",
          padding: "20px",
          borderRadius: "8px",
          minWidth: "400px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          style={{
            float: "right",
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            color: "#ffffffff",
            lineHeight: "20px",
          }}
          aria-label="Close Export Modal"
        >
          &times;
        </button>
        <AudioExporter
          tracks={tracks}
          totalLengthMs={totalLengthMs}
          onExportComplete={handleExportComplete}
        />
      </div>
    </div>
  );
};

export default AudioExportModal;