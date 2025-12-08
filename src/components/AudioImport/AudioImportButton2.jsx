import React, {useRef} from "react";
import * as Tone from "tone";
import AudioImporter from "./AudioImporter";
import "./AudioImportButton2.css";
import {LuImport} from "react-icons/lu";

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
  const fileInputRef = useRef(null); // Reference to hidden file input element
  const audioImporter = new AudioImporter(); // Audio import utility instance

  // Trigger file input when button is clicked
  const handleButtonClick = () => {
    // Programmatically click the hidden file input element
    fileInputRef.current.click();
  };

  // Handle file selection and import process
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return; // User cancelled the file dialog
    }

    console.log(`Attempting to import: ${file.name}`);

    try {
      // Process audio file through AudioImporter
      const importResult = await audioImporter.importFile(file);
      console.log("File imported successfully:", importResult.metadata);
      if (onImportSuccess) {
        onImportSuccess(importResult); // Notify parent of success
      }
    } catch (error) {
      console.error("Error importing file:", error.message);
      if (onImportError) {
        onImportError(error); // Notify parent of error
      }
    }

    // Reset the file input to allow re-importing the same file
    event.target.value = "";
  };

  return (
    <>
      {/* Hidden file input element */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".wav, .mp3" // Accepted audio formats
        style={{display: "none"}} // Hidden visually
      />
      {/* Visible import button */}
      <button className="import-button" onClick={handleButtonClick}>
        <LuImport size={20} /> Import
      </button>
    </>
  );
};

export default AudioImportButton;
