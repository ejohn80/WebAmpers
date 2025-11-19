import React, {useState} from "react";
import AudioExportModal from "./AudioExportModal";
import "./AudioExportButton.css";

/**
 * Encapsulates the logic for showing the export modal.
 */
const AudioExportButton = ({
  tracks,
  totalLengthMs,
  onExportComplete,
  children,
  disabled: propDisabled,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Button is disabled if propDisabled is true OR if no tracks exist
  const isDisabled = propDisabled || !tracks || tracks.length === 0;

  const closeModal = () => setIsModalOpen(false);

  const openModal = (e) => {
    if (isDisabled) {
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (tracks && tracks.length > 0) {
      setIsModalOpen(true);
    } else {
      console.log("Export disabled: No tracks available.");
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
    triggerElement = React.cloneElement(children, {
      onClick: (e) => {
        if (children.props.onClick) {
          children.props.onClick(e);
        }
        openModal(e);
      },
      className:
        (children.props.className || "") +
        (isDisabled ? " dropdown-item-disabled" : ""),
      "aria-disabled": isDisabled,
    });
  } else {
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
      {triggerElement}
      <AudioExportModal
        tracks={tracks}
        totalLengthMs={totalLengthMs}
        onExportComplete={handleExportComplete}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
};

export default AudioExportButton;
