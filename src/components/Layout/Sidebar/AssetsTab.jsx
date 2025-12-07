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
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingAssetId, setEditingAssetId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const {dbRefreshTrigger} = useContext(AppContext);

  // Load assets from IndexedDB
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

  useEffect(() => {
    loadAssets();
  }, [dbRefreshTrigger]);

  // Reload when refreshTrigger changes (triggered by external imports)
  useEffect(() => {
    if (refreshTrigger) {
      loadAssets();
    }
  }, [refreshTrigger]);

  const handleImportSuccess = async (importResult) => {
    console.log("[AssetsTab] Import result:", importResult);

    try {
      const {buffer} = importResult;

      // Use shared utility to save asset
      const assetId = await saveAsset(importResult, dbManager);

      // Get the saved asset to retrieve the potentially renamed name
      const savedAsset = await dbManager.getAsset(assetId);
      if (!savedAsset) {
        console.error("[AssetsTab] Failed to retrieve saved asset");
        setError("Failed to save asset");
        return;
      }

      // Update importResult with the actual saved name (may have been renamed for duplicates)
      const updatedImportResult = {
        ...importResult,
        name: savedAsset.name, // Use the name from DB which may include (2), (3), etc.
      };

      // Cache the buffer with the asset ID for buffer sharing
      if (assetBufferCache && buffer) {
        // Import provides native AudioBuffer, convert to Tone.ToneAudioBuffer
        const Tone = await import("tone");
        const toneBuffer = new Tone.ToneAudioBuffer(buffer);
        assetBufferCache.set(assetId, toneBuffer);
        console.log(`[AssetsTab] Cached buffer for asset ${assetId}`);
      }

      // Reload assets
      await loadAssets();

      // Call parent's onImportSuccess to create a track with the updated name
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

  const handleDeleteAsset = async (assetId, event) => {
    event.stopPropagation();

    try {
      // Check if asset is being used by any tracks
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

      // Notify parent to clear buffer cache
      if (onAssetDelete) {
        onAssetDelete(assetId);
      }
    } catch (err) {
      console.error("Failed to delete asset:", err);
      setError("Failed to delete asset");
    }
  };

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

  const handleDragStart = (event, asset) => {
    // Store asset data in drag event
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

  useEffect(() => () => clearGlobalDragAsset(), []);

  const handleDoubleClick = (asset) => {
    setEditingAssetId(asset.id);
    setEditingName(asset.name);
  };

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

  const handleRenameKeyDown = (e, assetId) => {
    if (e.key === "Enter") {
      handleRenameSubmit(assetId);
    } else if (e.key === "Escape") {
      setEditingAssetId(null);
      setEditingName("");
    }
  };

  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
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

        <div className={styles.tableHeader}>
          <div>Name</div>
          <div>Duration</div>
          <div></div> {/* Empty header for trash can column */}
        </div>

        {isLoading ? (
          <div className={styles.spinner}>
            <MoonLoader color="white" size={30} />
          </div>
        ) : (
          <div className={styles.songList}>
            {filteredAssets.length === 0 ? (
              <div className={styles.emptyMessage}>
                {searchTerm
                  ? "No results"
                  : "No assets yet. Import some audio files!"}
              </div>
            ) : (
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
                  <div className={styles.songDuration}>{asset.duration}</div>

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

        {error && <p className={styles.error}>{error}</p>}

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
