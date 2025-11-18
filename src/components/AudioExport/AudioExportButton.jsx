import React, {useState, useContext} from "react";
import AudioExportModal from "./AudioExportModal";
import {AppContext} from "../../context/AppContext";
import "./AudioExportButton.css";

/**
 * Encapsulates the logic for showing the export modal.
 * ...
 * @param {React.Element} [props.children] - The element that triggers the modal (e.g., the dropdown link).
 * @param {boolean} [props.disabled] - Whether the button should be explicitly disabled.
 */
const AudioExportButton = ({
  audioBuffer,
  onExportComplete,
  children,
  disabled: propDisabled,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const {effects, engineRef} = useContext(AppContext);

  // The button is disabled if propDisabled is true OR if no audioBuffer exists
  const isDisabled = propDisabled || !audioBuffer || isProcessing;

  const closeModal = () => setIsModalOpen(false);

  const openModal = (e) => {
    // If disabled, prevent the default link action (navigation)
    if (isDisabled) {
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (audioBuffer) {
      setIsModalOpen(true);
    } else {
      console.log("Export disabled: No audio buffer loaded.");
    }
  };

  /**
   * Get processed audio buffer with effects applied
   * @returns {Promise<Tone.ToneAudioBuffer>} Processed buffer
   */
  const getProcessedBuffer = async () => {
    if (!audioBuffer) {
      throw new Error("No audio buffer available");
    }

    // Check if engine is available
    if (!engineRef?.current) {
      console.warn("Engine not available, using original buffer");
      return audioBuffer;
    }

    try {
      setIsProcessing(true);

      // Render with effects applied
      const renderedBuffer = await engineRef.current.renderAudioWithEffects(
        audioBuffer,
        effects
      );

      return renderedBuffer;
    } catch (error) {
      console.error("Failed to process audio with effects:", error);
      // Go back to og buffer
      return audioBuffer;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportComplete = (result) => {
    closeModal();
    if (onExportComplete) {
      onExportComplete(result);
    }
  };

  let triggerElement;

  if (children) {
    // Clone the child element (the dropdown link) and inject the logic
    triggerElement = React.cloneElement(children, {
      // Preserve original click handler if it exists
      onClick: (e) => {
        if (children.props.onClick) {
          children.props.onClick(e);
        }
        openModal(e);
      },
      // Apply the disabled class for visual effect and ARIA attribute
      className:
        (children.props.className || "") +
        (isDisabled ? " dropdown-item-disabled" : ""),
      "aria-disabled": isDisabled,
    });
  } else {
    // Render a default button (used in Header.jsx) which uses the native 'disabled' prop
    triggerElement = (
      <button
        className="export-button"
        onClick={openModal}
        disabled={isDisabled}
      >
        Export Audio
      </button>
    );
  }

  return (
    <>
      {/* The trigger element (default button or cloned child) */}
      {triggerElement}

      {/* The actual modal content */}
      <AudioExportModal
        audioBuffer={audioBuffer}
        getProcessedBuffer={getProcessedBuffer}
        onExportComplete={handleExportComplete}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
};

export default AudioExportButton;