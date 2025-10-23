import React, {useRef} from "react";
import * as Tone from "tone";
import AudioImporter from "./AudioImporter";
import "./AudioImportButton.css";

/**
 * A UI component that provides a button to import audio files.
 * It uses the AudioImporter class to process the file and provides
 * callbacks for success and error events.
 *
 * @param {object} props
 * @param {function} props.onImportSuccess - Callback function for successful import. Receives import result.
 * @param {function} props.onImportError - Callback function for failed import. Receives error.
 */
const AudioImportButton = ({onImportSuccess, onImportError}) => {
  const fileInputRef = useRef(null);
  const audioImporter = new AudioImporter();

  const handleButtonClick = () => {
    // Programmatically click the hidden file input element
    fileInputRef.current.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return; // User cancelled the file dialog
    }

    console.log(`Attempting to import: ${file.name}`);

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

    // Reset the file input to allow re-importing the same file
    event.target.value = "";
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".wav, .mp3"
        style={{display: "none"}}
      />
      <button className="import-button" onClick={handleButtonClick}>
        Import Audio
      </button>
    </>
  );
};

export default AudioImportButton;
