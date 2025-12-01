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

/**
 * Serialize an AudioBuffer for IndexedDB storage
 * @param {AudioBuffer} buffer - The AudioBuffer to serialize
 * @returns {Object} Serialized buffer data
 */
export const serializeAudioBuffer = (buffer) => {
  const channels = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  return {
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
    channels: channels,
  };
};

/**
 * Save imported audio as an asset in IndexedDB
 * @param {Object} importResult - The import result from AudioImporter
 * @param {Object} importResult.metadata - Metadata about the audio
 * @param {AudioBuffer} importResult.buffer - The audio buffer
 * @param {Object} dbManager - The database manager instance
 * @returns {Promise<number>} The asset ID
 */
export const saveAsset = async (importResult, dbManager) => {
  const {metadata, buffer} = importResult;

  if (!buffer || !metadata) {
    throw new Error("Invalid import result: missing buffer or metadata");
  }

  const serializedBuffer = serializeAudioBuffer(buffer);

  const assetId = await dbManager.addAsset({
    name: metadata.name || "Untitled",
    duration: formatDuration(metadata.duration),
    size: metadata.size,
    sampleRate: metadata.sampleRate,
    channels: metadata.numberOfChannels,
    buffer: serializedBuffer,
  });

  console.log(`Asset saved: ${metadata.name} (ID: ${assetId})`);
  return assetId;
};
