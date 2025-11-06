import React from "react";
import AudioExportModal from "./AudioExportModal";
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
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // The button is disabled if propDisabled is true OR if no audioBuffer exists
  const isDisabled = propDisabled || !audioBuffer;

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
        onExportComplete={handleExportComplete}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
};

export default AudioExportButton;
