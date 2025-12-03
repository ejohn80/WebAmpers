/**
 * Utility functions for handling assets
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

const normalizeToNativeAudioBuffer = (buffer) => {
  if (!buffer) return null;

  const isNativeAudioBuffer =
    typeof AudioBuffer !== "undefined" && buffer instanceof AudioBuffer;

  if (isNativeAudioBuffer) {
    return buffer;
  }

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

  if (buffer._buffer) {
    return buffer._buffer;
  }

  return buffer;
};

/**
 * Serialize an AudioBuffer for IndexedDB storage
 * @param {AudioBuffer|ToneAudioBuffer} buffer - The buffer to serialize
 * @returns {Object} Serialized buffer data
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

  const channels = [];
  for (let i = 0; i < nativeBuffer.numberOfChannels; i++) {
    channels.push(nativeBuffer.getChannelData(i));
  }

  return {
    numberOfChannels: nativeBuffer.numberOfChannels,
    length: nativeBuffer.length,
    sampleRate: nativeBuffer.sampleRate,
    duration: nativeBuffer.duration,
    channels,
  };
};

const shouldFallbackToBlobStorage = (error) => {
  if (!error) return false;

  const name = (error.name || "").toLowerCase();
  const message = (error.message || "").toLowerCase();

  return (
    name.includes("quotaexceeded") ||
    message.includes("quotaexceeded") ||
    name.includes("ns_error_dom_quota_reached") ||
    message.includes("ns_error_dom_quota_reached") ||
    name.includes("dataclone") ||
    message.includes("could not be cloned")
  );
};

/**
 * Save imported audio as an asset in IndexedDB
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
    const assetId = await dbManager.addAsset({
      ...basePayload,
      storageMode: "pcm",
      buffer: serializedBuffer,
      fileBlob: null,
    });
    console.log(`Asset saved: ${metadata.name} (ID: ${assetId})`);
    return assetId;
  } catch (error) {
    if (!shouldFallbackToBlobStorage(error) || !originalFile) {
      throw error;
    }

    console.warn(
      `Falling back to blob storage for asset ${metadata.name}:`,
      error
    );

    const assetId = await dbManager.addAsset({
      ...basePayload,
      storageMode: "blob",
      buffer: null,
      fileBlob: originalFile,
    });
    console.log(
      `Asset saved via blob fallback: ${metadata.name} (ID: ${assetId})`
    );
    return assetId;
  }
};
