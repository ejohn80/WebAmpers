/**
 * AudioExporter.jsx
 * This component renders the UI for audio export settings and handles the export logic.
 * It imports ExportManager, which handles the actual file conversion and API calls.
 */
import React, {useState, useMemo} from "react";
import ExportManager from "./ExportManager.js";

const AudioExporter = ({audioBuffer, onExportComplete}) => {
  const exportManager = useMemo(() => new ExportManager(), []);
  // State for form inputs
  const [format, setFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState("320k");
  const [filename, setFilename] = useState("export.mp3");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Supported formats for the dropdown
  const formats = [
    {value: "mp3", label: "MP3"},
    {value: "wav", label: "WAV"},
    {value: "ogg", label: "OGG"},
  ];

  const handleExport = async (e) => {
    e.preventDefault();
    setError(null);

    // Placeholder check: In a real app, you'd check for a valid audioBuffer.
    if (!audioBuffer) {
      setError("Please load or generate an audio track before exporting.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await exportManager.exportAudio(audioBuffer, {
        format,
        filename,
        bitrate: format === "mp3" ? bitrate : undefined,
      });

      if (result.success) {
        console.log(`Exported successfully: ${result.format}`);
        if (onExportComplete) {
          onExportComplete(result);
        }
      }
    } catch (err) {
      console.error("Export Error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-sm mx-auto bg-white rounded-xl shadow-lg space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Export Audio Settings</h2>

      <form onSubmit={handleExport} className="space-y-4">
        {/* Output Format Dropdown */}
        <div>
          <label
            htmlFor="format"
            className="block text-sm font-medium text-gray-700"
            style={{marginRight: "15px"}}
          >
            Output Format
          </label>
          <select
            id="format"
            name="format"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              // Update default filename extension when format changes
              setFilename((fn) =>
                fn.replace(/\.(mp3|wav|ogg)$/i, `.${e.target.value}`)
              );
            }}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            aria-label="Output Format"
            // style={{ marginLeft: '5px' }}
          >
            {formats.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Bitrate Input (MP3 only) */}
        <div style={{marginBottom: "10px"}}></div>
        {format === "mp3" && (
          <div>
            <label
              htmlFor="bitrate"
              className="block text-sm font-medium text-gray-700"
              style={{marginRight: "3px"}}
            >
              MP3 Bitrate
            </label>
            <select
              id="bitrate"
              name="bitrate"
              value={bitrate}
              onChange={(e) => setBitrate(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
              aria-label="MP3 Bitrate"
              style={{marginLeft: "10px"}}
            >
              <option value="320k">320 kbps (High Quality)</option>
              <option value="192k">192 kbps (Standard Quality)</option>
              <option value="128k">128 kbps (Lower Quality)</option>
            </select>
          </div>
        )}

        {/* Filename Input */}
        <div style={{marginBottom: "10px"}}></div>
        <div>
          <label
            htmlFor="filename"
            className="block text-sm font-medium text-gray-700"
            style={{marginRight: "5px"}}
          >
            Filename
          </label>
          <input
            type="text"
            id="filename"
            name="filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
            style={{marginLeft: "5px"}}
          />
        </div>

        {/* Error Display */}
        <div style={{marginBottom: "10px"}}></div>
        {error && (
          <p className="text-sm font-medium text-red-600 p-2 border border-red-200 bg-red-50 rounded-md">
            Error: {error}
          </p>
        )}

        {/* Submit Button */}
        <div style={{marginBottom: "10px"}}></div>
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            isLoading
              ? "bg-indigo-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          }`}
          aria-label="Export Audio"
        >
          {isLoading ? "Processing..." : "Export Audio"}
        </button>
      </form>
    </div>
  );
};

export default AudioExporter;
