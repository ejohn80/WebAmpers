/**
 * AssetsTab Component
 *
 * Displays and manages audio assets in a searchable list.
 * Supports import, rename, delete, and drag-and-drop operations.
 * Integrates with IndexedDB for persistent storage and asset buffer caching.
 */

import {useState, useEffect, useContext} from "react";
import {IoSearch} from "react-icons/io5";
import {MoonLoader} from "react-spinners";
import {dbManager} from "../../../managers/DBManager";
import {saveAsset} from "../../../utils/assetUtils";
import AudioImportButton from "../../AudioImport/AudioImportButton2";
import styles from "../Layout.module.css";
import {TrashCan} from "../Svgs.jsx";
import {AppContext} from "../../../context/AppContext";

const AssetsTab = ({
  onImportSuccess,
  onImportError,
  onAssetDelete,
  refreshTrigger,
  assetBufferCache,
}) => {
  // Component state
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingAssetId, setEditingAssetId] = useState(null);
  const [editingName, setEditingName] = useState("");

  // Access database refresh trigger from app context
  const {dbRefreshTrigger} = useContext(AppContext);

  /**
   * Load assets from IndexedDB
   */
  const loadAssets = async () => {
    try {
      setIsLoading(true);
      const allAssets = await dbManager.getAllAssets();
      setAssets(allAssets);
    } catch (err) {
      console.error("Error fetching assets:", err);
      setError("Failed to load assets");
    } finally {
      setIsLoading(false);
    }
  };

  // Load assets on mount and when refresh trigger changes
  useEffect(() => {
    loadAssets();
  }, [dbRefreshTrigger]);

  // Reload when external import triggers a refresh
  useEffect(() => {
    if (refreshTrigger) {
      loadAssets();
    }
  }, [refreshTrigger]);

  /**
   * Handle successful audio import
   * @param {Object} importResult - Imported audio data with buffer
   */
  const handleImportSuccess = async (importResult) => {
    console.log("[AssetsTab] Import result:", importResult);

    try {
      const {buffer} = importResult;

      // Save asset to IndexedDB using shared utility
      const assetId = await saveAsset(importResult, dbManager);

      // Retrieve saved asset to get final name (may have been auto-renamed)
      const savedAsset = await dbManager.getAsset(assetId);
      if (!savedAsset) {
        console.error("[AssetsTab] Failed to retrieve saved asset");
        setError("Failed to save asset");
        return;
      }

      // Update result with DB-stored name
      const updatedImportResult = {
        ...importResult,
        name: savedAsset.name,
      };

      // Cache audio buffer for shared access across tracks
      if (assetBufferCache && buffer) {
        const Tone = await import("tone");
        const toneBuffer = new Tone.ToneAudioBuffer(buffer);
        assetBufferCache.set(assetId, toneBuffer);
        console.log(`[AssetsTab] Cached buffer for asset ${assetId}`);
      }

      // Reload asset list
      await loadAssets();

      // Notify parent component to create track
      if (onImportSuccess) {
        onImportSuccess(updatedImportResult, assetId);
      }
    } catch (err) {
      console.error("Error saving asset:", err);
      setError("Failed to save asset");
      if (onImportError) {
        onImportError("Failed to save asset");
      }
    }
  };

  /**
   * Delete an asset with confirmation and dependency check
   * @param {string} assetId - ID of asset to delete
   * @param {Event} event - Click event to stop propagation
   */
  const handleDeleteAsset = async (assetId, event) => {
    event.stopPropagation();

    try {
      // Check if asset is in use by any tracks
      const isInUse = await dbManager.isAssetInUse(assetId);

      if (isInUse) {
        alert(
          "Cannot delete this asset because it is being used by one or more tracks. Please delete those tracks first."
        );
        return;
      }

      if (!window.confirm("Are you sure you want to delete this asset?")) {
        return;
      }

      await dbManager.deleteAsset(assetId);
      await loadAssets();

      // Notify parent to clear cached buffer
      if (onAssetDelete) {
        onAssetDelete(assetId);
      }
    } catch (err) {
      console.error("Failed to delete asset:", err);
      setError("Failed to delete asset");
    }
  };

  /**
   * Set global drag data for cross-component drag operations
   * @param {Object} asset - Asset object being dragged
   */
  const setGlobalDragAsset = (asset) => {
    if (typeof window === "undefined") return;
    window.__WEBAMP_DRAG_ASSET__ = {
      type: "asset",
      assetId: asset.id,
      name: asset.name,
    };
  };

  const clearGlobalDragAsset = () => {
    if (typeof window === "undefined") return;
    delete window.__WEBAMP_DRAG_ASSET__;
  };

  /**
   * Handle drag start event for asset dragging
   * @param {DragEvent} event - Native drag event
   * @param {Object} asset - Asset being dragged
   */
  const handleDragStart = (event, asset) => {
    event.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        type: "asset",
        assetId: asset.id,
        name: asset.name,
      })
    );
    event.dataTransfer.effectAllowed = "copy";
    setGlobalDragAsset(asset);
  };

  const handleDragEnd = () => {
    clearGlobalDragAsset();
  };

  // Clean up global drag data on unmount
  useEffect(() => () => clearGlobalDragAsset(), []);

  /**
   * Start editing asset name on double-click
   * @param {Object} asset - Asset to rename
   */
  const handleDoubleClick = (asset) => {
    setEditingAssetId(asset.id);
    setEditingName(asset.name);
  };

  /**
   * Submit renamed asset name to database
   * @param {string} assetId - ID of asset being renamed
   */
  const handleRenameSubmit = async (assetId) => {
    if (!editingName.trim()) {
      alert("Asset name cannot be empty");
      setEditingAssetId(null);
      return;
    }

    try {
      await dbManager.updateAsset(assetId, {name: editingName.trim()});
      await loadAssets();
      setEditingAssetId(null);
      setEditingName("");
    } catch (err) {
      console.error("Failed to rename asset:", err);
      setError("Failed to rename asset");
      setEditingAssetId(null);
    }
  };

  /**
   * Handle key events during rename editing
   * @param {KeyboardEvent} e - Keyboard event
   * @param {string} assetId - ID of asset being renamed
   */
  const handleRenameKeyDown = (e, assetId) => {
    if (e.key === "Enter") {
      handleRenameSubmit(assetId);
    } else if (e.key === "Escape") {
      setEditingAssetId(null);
      setEditingName("");
    }
  };

  // Filter assets based on search term
  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* Search Bar */}
        <div className={styles.searchBar}>
          <IoSearch size={18} color="#888" />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Table Headers */}
        <div className={styles.tableHeader}>
          <div>Name</div>
          <div>Duration</div>
          <div></div> {/* Empty column for delete button */}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className={styles.spinner}>
            <MoonLoader color="white" size={30} />
          </div>
        ) : (
          <div className={styles.songList}>
            {/* Empty State */}
            {filteredAssets.length === 0 ? (
              <div className={styles.emptyMessage}>
                {searchTerm
                  ? "No results"
                  : "No assets yet. Import some audio files!"}
              </div>
            ) : (
              /* Asset List */
              filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  className={styles.songRow}
                  draggable={editingAssetId !== asset.id}
                  onDragStart={(e) => handleDragStart(e, asset)}
                  onDragEnd={handleDragEnd}
                  onDoubleClick={() => handleDoubleClick(asset)}
                  style={{
                    cursor: editingAssetId === asset.id ? "text" : "grab",
                  }}
                >
                  {/* Asset Name (editable on double-click) */}
                  <div className={styles.songName}>
                    {editingAssetId === asset.id ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleRenameSubmit(asset.id)}
                        onKeyDown={(e) => handleRenameKeyDown(e, asset.id)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className={styles.editInput}
                      />
                    ) : (
                      <span>{asset.name}</span>
                    )}
                  </div>

                  {/* Asset Duration */}
                  <div className={styles.songDuration}>{asset.duration}</div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDeleteAsset(asset.id, e)}
                    className={styles.deleteButton}
                    aria-label="Delete asset"
                  >
                    <TrashCan />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Error Display */}
        {error && <p className={styles.error}>{error}</p>}

        {/* Import Button */}
        <div className={styles.importButtonWrapper}>
          <AudioImportButton
            onImportSuccess={handleImportSuccess}
            onImportError={onImportError}
          />
        </div>
      </div>
    </div>
  );
};

export default AssetsTab;
