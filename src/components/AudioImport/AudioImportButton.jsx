import React, {useRef} from "react";
import AudioImporter from "./AudioImporter";

import * as Tone from "tone";

/**
 * A UI component that provides a button to import audio files.
 * Supports both standalone usage (renders a button) and wrapper usage (clones children).
 */
const AudioImportButton = ({onImportSuccess, onImportError, children}) => {
  const fileInputRef = useRef(null);
  const audioImporter = new AudioImporter();

  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    try {
      const importResult = await audioImporter.importFile(file);
      console.log("File imported successfully:", importResult.metadata);
      if (onImportSuccess) {
        onImportSuccess(importResult);
      }
    } catch (error) {
      console.error("Error importing file:", error.message);
      if (onImportError) {
        onImportError(error);
      }
    }

    event.target.value = "";
  };

  let triggerElement;

  if (children) {
    // Dropdown Case (children is defined): Clone the child element to inject the click handler
    triggerElement = React.cloneElement(children, {
      onClick: (e) => {
        // Preserve original click handler (for dropdown menu closing)
        if (children.props.onClick) {
          children.props.onClick(e);
        }
        // Trigger the file input
        handleButtonClick();
      },
    });
  } else {
    // Standalone Case (children is undefined): Render the default button
    triggerElement = (
      <button className="import-button" onClick={handleButtonClick}>
        <span style={{display: "flex", alignItems: "center", gap: "10px"}}>
          <ImportIcon />
          Import Audio
        </span>
      </button>
    );
  }

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".wav, .mp3"
        style={{display: "none"}}
      />

      {triggerElement}
    </>
  );
};

export default AudioImportButton;
