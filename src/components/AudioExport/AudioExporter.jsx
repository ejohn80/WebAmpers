import React, {useState, useMemo, useContext} from "react";
import ExportManager from "./ExportManager.js";
import {AppContext} from "../../context/AppContext";

const AudioExporter = ({
  tracks,
  totalLengthMs,
  onExportComplete,
  audioBuffer,
}) => {
  // Make context optional so tests that don't mount AppContextProvider don't crash
  const appCtx = useContext(AppContext) || {};
  const effects = appCtx.effects || [];
  const exportManager = useMemo(() => new ExportManager(), []);
  const [format, setFormat] = useState("mp3");
  const [qualitySetting, setQualitySetting] = useState("320k");
  const [filename, setFilename] = useState("export.mp3");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const formats = [
    {value: "mp3", label: "MP3"},
    {value: "wav", label: "WAV"},
    {value: "ogg", label: "OGG"},
  ];

  const getQualityOptions = (currentFormat) => {
    const isCompressed = currentFormat !== "wav";
    if (!isCompressed) return [];

    return [
      {
        value: "320k",
        label:
          currentFormat === "mp3"
            ? "320 kbps (High Quality)"
            : "High Quality (Vorbis)",
      },
      {
        value: "192k",
        label:
          currentFormat === "mp3"
            ? "192 kbps (Standard Quality)"
            : "Standard Quality (Vorbis)",
      },
      {
        value: "128k",
        label:
          currentFormat === "mp3"
            ? "128 kbps (Lower Quality)"
            : "Lower Quality (Vorbis)",
      },
    ];
  };

  const handleFormatChange = (newFormat) => {
    setFormat(newFormat);
    setFilename((fn) => fn.replace(/\.(mp3|wav|ogg)$/i, `.${newFormat}`));
    setQualitySetting("320k");
  };

  const handleExport = async (e) => {
    e.preventDefault();
    setError(null);
    const exportBitrate =
      format === "mp3" || format === "ogg" ? qualitySetting : undefined;

    // Compatibility: support legacy prop `audioBuffer` used in tests
    if (typeof audioBuffer !== "undefined") {
      if (!audioBuffer) {
        setError("Please load or generate an audio track before exporting");
        return;
      }
      setIsLoading(true);
      try {
        const result = await exportManager.exportAudio(audioBuffer, {
          format,
          filename,
          bitrate: exportBitrate,
        });
        if (result && onExportComplete) onExportComplete(result);
      } catch (err) {
        console.error("Export Error:", err);
        setError(
          (err?.message || "Export failed")
            .split("Command:")[0]
            .replace(/^Error:\s*/, "")
            .trim()
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // New API expects tracks + totalLengthMs
    if (!tracks || tracks.length === 0) {
      setError("No tracks available to export.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await exportManager.exportAudio(
        tracks,
        totalLengthMs,
        effects,
        {
          format,
          filename,
          bitrate: exportBitrate,
        }
      );
      if (result && result.success && onExportComplete)
        onExportComplete(result);
    } catch (err) {
      console.error("Export Error:", err);
      setError(
        (err?.message || "Export failed")
          .split("Command:")[0]
          .replace(/^Error:\s*/, "")
          .trim()
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showQualitySetting = format === "mp3" || format === "ogg";

  return (
    <div className="p-4 max-w-sm mx-auto bg-white rounded-xl shadow-lg space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Export Audio Settings</h2>

      <form
        onSubmit={handleExport}
        style={{display: "flex", flexDirection: "column", gap: "15px"}}
      >
        <div style={{display: "flex", alignItems: "center"}}>
          <label
            htmlFor="format"
            className="block text-sm font-medium text-gray-700"
            style={{width: "120px", minWidth: "120px", marginRight: "15px"}}
          >
            Output Format
          </label>
          <select
            id="format"
            name="format"
            value={format}
            onChange={(e) => handleFormatChange(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            aria-label="Output Format"
            style={{flexGrow: 1}}
          >
            {formats.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {showQualitySetting && (
          <div style={{display: "flex", alignItems: "center"}}>
            <label
              htmlFor="qualitySetting"
              className="block text-sm font-medium text-gray-700"
              style={{width: "120px", minWidth: "120px", marginRight: "15px"}}
            >
              {format === "mp3" ? "MP3 Bitrate" : "OGG Quality"}
            </label>
            <select
              id="qualitySetting"
              name="qualitySetting"
              value={qualitySetting}
              onChange={(e) => setQualitySetting(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
              aria-label={format === "mp3" ? "MP3 Bitrate" : "OGG Quality"}
              style={{flexGrow: 1}}
            >
              {getQualityOptions(format).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{display: "flex", alignItems: "center"}}>
          <label
            htmlFor="filename"
            className="block text-sm font-medium text-gray-700"
            style={{width: "120px", minWidth: "120px", marginRight: "15px"}}
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
            style={{flexGrow: 1}}
          />
        </div>

        {error && (
          <p className="text-sm font-medium text-red-600 p-2 border border-red-200 bg-red-50 rounded-md">
            Error: {error}
          </p>
        )}

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
