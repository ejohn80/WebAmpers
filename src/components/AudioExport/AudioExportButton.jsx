import React from "react";
import AudioExportModal from "./AudioExportModal";
import "./AudioExportButton.css";

/**
 * Encapsulates the logic for showing the export modal.
 * This component is used as a drop-in replacement for the
 * previous inline button and modal logic.
 * @param {object} props
 * @param {Tone.ToneAudioBuffer} props.audioBuffer - The audio buffer to export.
 * @param {function} props.onExportComplete - Callback function on export success/failure.
 * @param {function} props.children - The element that triggers the modal (e.g., the dropdown link).
 */
const AudioExportButton = ({audioBuffer, onExportComplete, children}) => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const closeModal = () => setIsModalOpen(false);
  const openModal = () => {
    if (audioBuffer) {
      setIsModalOpen(true);
    } else {
      console.log("Export disabled: No audio buffer loaded.");
    }
  };

  const handleExportComplete = (result) => {
    closeModal();
    if (onExportComplete) {
      onExportComplete(result);
    }
  };

  return (
    <>
      {/* The trigger element from the dropdown */}
      <span onClick={openModal}>{children}</span>

      {/* The actual modal content */}
      <AudioExportModal
        audioBuffer={audioBuffer}
        onExportComplete={handleExportComplete}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
};

export default AudioExportButton;
