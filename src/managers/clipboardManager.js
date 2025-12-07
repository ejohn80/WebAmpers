/**
 * Clipboard Manager for Track Cut/Copy/Paste operations
 * Manages clipboard state with localStorage persistence
 */

const CLIPBOARD_STORAGE_KEY = "webamp.clipboard";

class ClipboardManager {
  constructor() {
    this.clipboard = this.loadFromStorage();
  }

  /**
   * Load clipboard data from localStorage
   * @returns {Object|null} Clipboard data or null
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn("Failed to load clipboard from storage:", error);
      return null;
    }
  }

  /**
   * Save clipboard data to localStorage
   * @param {Object} data - Clipboard data to save
   */
  saveToStorage(data) {
    try {
      if (data === null) {
        localStorage.removeItem(CLIPBOARD_STORAGE_KEY);
      } else {
        localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.warn("Failed to save clipboard to storage:", error);
    }
  }

  /**
   * Copy a track to clipboard
   * @param {Object} track - The track to copy
   * @param {string} operation - 'copy' or 'cut'
   */
  setClipboard(track, operation = "copy") {
    if (!track) {
      console.warn("Cannot set clipboard: no track provided");
      return;
    }

    const clipboardData = {
      operation, // 'copy' or 'cut'
      timestamp: new Date().toISOString(),
      trackData: {
        id: track.id,
        name: track.name,
        color: track.color,
        assetId: track.assetId,
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
        effects: track.effects ? JSON.parse(JSON.stringify(track.effects)) : {},
        activeEffectsList: track.activeEffectsList
          ? [...track.activeEffectsList]
          : [],
        enabledEffects: track.enabledEffects
          ? JSON.parse(JSON.stringify(track.enabledEffects))
          : {},
        segments: track.segments?.map((seg) => ({
          id: seg.id,
          assetId: seg.assetId,
          offset: seg.offset,
          duration: seg.duration,
          durationMs: seg.durationMs,
          startOnTimelineMs: seg.startOnTimelineMs,
          startInFileMs: seg.startInFileMs,
          // Include name, fileName, AND assetId properties
          name: seg.name,
          fileName: seg.fileName,
          assetId: seg.assetId, // Each segment needs its own assetId
        })),
        // For single-segment cuts, preserve the region info
        clipStartInFileMs: track.clipStartInFileMs,
        clipDurationMs: track.clipDurationMs,
      },
    };

    this.clipboard = clipboardData;
    this.saveToStorage(clipboardData);
    console.log(`Track ${operation} to clipboard:`, track.name);
  }

  /**
   * Get clipboard data
   * @returns {Object|null} Clipboard data or null
   */
  getClipboard() {
    return this.clipboard;
  }

  /**
   * Check if clipboard has data
   * @returns {boolean}
   */
  hasClipboard() {
    return this.clipboard !== null;
  }

  /**
   * Clear clipboard
   */
  clearClipboard() {
    this.clipboard = null;
    this.saveToStorage(null);
    console.log("Clipboard cleared");
  }

  /**
   * Check if a specific asset is in clipboard
   * @param {number} assetId
   * @returns {boolean}
   */
  isAssetInClipboard(assetId) {
    return this.clipboard?.trackData?.assetId === assetId;
  }
}

// Export singleton instance
export const clipboardManager = new ClipboardManager();
