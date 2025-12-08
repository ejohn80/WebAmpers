/**
 * Utility functions for handling audio assets
 * - Formatting durations for display
 * - Serializing/deserializing audio buffers for storage
 * - Managing IndexedDB storage with fallback strategies
 */

/**
 * Format duration from "3m 45.23s" to "03:45"
 * @param {string} durationStr - Duration string in format "Xm Y.Zs"
 * @returns {string} Formatted duration "MM:SS"
 */
export const formatDuration = (durationStr) => {
  const match = durationStr.match(/(\d+)m\s+([\d.]+)s/);
  if (match) {
    const minutes = match[1].padStart(2, "0");
    const seconds = Math.floor(parseFloat(match[2]))
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  return "00:00";
};

/**
 * Normalize buffer to native AudioBuffer for consistent processing
 * Handles Tone.js ToneAudioBuffer and other wrapper types
 */
const normalizeToNativeAudioBuffer = (buffer) => {
  if (!buffer) return null;

  const isNativeAudioBuffer =
    typeof AudioBuffer !== "undefined" && buffer instanceof AudioBuffer;

  if (isNativeAudioBuffer) {
    return buffer;
  }

  // Try to extract from Tone.js ToneAudioBuffer
  if (typeof buffer.get === "function") {
    try {
      const result = buffer.get();
      if (result) {
        return result;
      }
    } catch (error) {
      console.warn("Failed to extract native AudioBuffer via get()", error);
    }
  }

  // Check internal reference
  if (buffer._buffer) {
    return buffer._buffer;
  }

  return buffer;
};

/**
 * Serialize an AudioBuffer for IndexedDB storage
 * Converts Float32Array channel data to serializable format
 * @param {AudioBuffer|ToneAudioBuffer} buffer - The buffer to serialize
 * @returns {Object} Serialized buffer data with channel arrays
 */
export const serializeAudioBuffer = (buffer) => {
  const nativeBuffer = normalizeToNativeAudioBuffer(buffer);
  if (
    !nativeBuffer ||
    typeof nativeBuffer.numberOfChannels !== "number" ||
    typeof nativeBuffer.getChannelData !== "function"
  ) {
    throw new Error("Invalid AudioBuffer provided for serialization");
  }

  // Extract each channel's PCM data
  const channels = [];
  for (let i = 0; i < nativeBuffer.numberOfChannels; i++) {
    channels.push(nativeBuffer.getChannelData(i));
  }

  return {
    numberOfChannels: nativeBuffer.numberOfChannels,
    length: nativeBuffer.length,
    sampleRate: nativeBuffer.sampleRate,
    duration: nativeBuffer.duration,
    channels, // Array of Float32Arrays
  };
};

/**
 * Determine if an error indicates IndexedDB quota exceeded
 * Triggers fallback to blob storage strategy
 */
const shouldFallbackToBlobStorage = (error) => {
  if (!error) return false;

  const name = (error.name || "").toLowerCase();
  const message = (error.message || "").toLowerCase();

  return (
    name.includes("quotaexceeded") ||
    message.includes("quotaexceeded") ||
    name.includes("ns_error_dom_quota_reached") ||
    message.includes("ns_error_dom_quota_reached") ||
    name.includes("dataclone") || // DataCloneError (buffer too large)
    message.includes("could not be cloned")
  );
};

/**
 * Save imported audio as an asset in IndexedDB
 * Attempts PCM storage first, falls back to blob storage on quota errors
 * @param {Object} importResult - The import result from AudioImporter
 * @param {Object} importResult.metadata - Metadata about the audio
 * @param {AudioBuffer} importResult.buffer - The audio buffer
 * @param {File} importResult.originalFile - Original uploaded file reference
 * @param {Object} dbManager - The database manager instance
 * @returns {Promise<number>} The asset ID
 */
export const saveAsset = async (importResult, dbManager) => {
  const {metadata, buffer, originalFile} = importResult;

  if (!buffer || !metadata) {
    throw new Error("Invalid import result: missing buffer or metadata");
  }

  // Base metadata for all storage strategies
  const basePayload = {
    name: metadata.name || "Untitled",
    duration: formatDuration(metadata.duration),
    size: metadata.size,
    sampleRate: metadata.sampleRate,
    channels: metadata.numberOfChannels,
    mimeType: originalFile?.type || metadata.type,
    sizeBytes: originalFile?.size ?? null,
  };

  const serializedBuffer = serializeAudioBuffer(buffer);

  try {
    // Primary strategy: store PCM data directly in IndexedDB
    const assetId = await dbManager.addAsset({
      ...basePayload,
      storageMode: "pcm",
      buffer: serializedBuffer,
      fileBlob: null,
    });
    console.log(`Asset saved: ${metadata.name} (ID: ${assetId})`);
    return assetId;
  } catch (error) {
    // If quota exceeded and we have the original file, fall back to blob storage
    if (!shouldFallbackToBlobStorage(error) || !originalFile) {
      throw error; // Re-throw non-quota errors
    }

    console.warn(
      `Falling back to blob storage for asset ${metadata.name}:`,
      error
    );

    // Fallback strategy: store original file as blob reference
    const assetId = await dbManager.addAsset({
      ...basePayload,
      storageMode: "blob",
      buffer: null, // Don't store PCM data
      fileBlob: originalFile, // Store reference to original file
    });
    console.log(
      `Asset saved via blob fallback: ${metadata.name} (ID: ${assetId})`
    );
    return assetId;
  }
};
