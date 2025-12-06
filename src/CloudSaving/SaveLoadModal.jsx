import React, { useState, useEffect } from "react";
import { MoonLoader } from "react-spinners";
import { FaTrash, FaDownload, FaSave } from "react-icons/fa";
import { RxCross2 } from "react-icons/rx";
import { useCloudStorage } from "../hooks/useCloudStorage";
import styles from "./SaveLoadModal.module.css";

/**
 * Modal component for saving and loading sessions from Firebase
 */
function SaveLoadModal({ isOpen, onClose, onLoadComplete, mode = "save" }) {
  const {
    isSaving,
    isLoading,
    saves,
    error,
    isAuthenticated,
    saveSession,
    quickSave,
    loadSession,
    listSaves,
    deleteSave,
    clearError,
  } = useCloudStorage();

  const [projectName, setProjectName] = useState("");
  const [localError, setLocalError] = useState(null);

  // Load saves list when modal opens in load mode
  useEffect(() => {
    if (isOpen && mode === "load" && isAuthenticated) {
      listSaves();
    }
  }, [isOpen, mode, isAuthenticated, listSaves]);

  // Clear errors when closing
  useEffect(() => {
    if (!isOpen) {
      clearError();
      setLocalError(null);
      setProjectName("");
    }
  }, [isOpen, clearError]);

  const handleSave = async () => {
    if (!projectName.trim()) {
      setLocalError("Please enter a project name");
      return;
    }

    const url = await saveSession(projectName.trim());
    if (url) {
      setProjectName("");
      onClose();
    }
  };

  const handleQuickSave = async () => {
    const url = await quickSave();
    if (url) {
      onClose();
    }
  };

  const handleLoad = async (fileName) => {
    if (!window.confirm("Loading will replace your current session. Continue?")) {
      return;
    }
  
    const stats = await loadSession(fileName);
    if (stats) {
      console.log("Session loaded successfully:", stats);
      
      // Call the callback if provided
      onLoadComplete?.(stats);
      
      // Close modal
      onClose();
      
      // Reload page to refresh all components
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  const handleDelete = async (fileName, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this save?")) {
      return;
    }
    await deleteSave(fileName);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2>{mode === "save" ? "Save Session" : "Load Session"}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <RxCross2 size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {!isAuthenticated ? (
            <div className={styles.loginPrompt}>
              <p>Please log in to {mode} sessions.</p>
            </div>
          ) : mode === "save" ? (
            /* Save Tab */
            <div className={styles.saveSection}>
              <div className={styles.inputGroup}>
                <label>Project Name</label>
                <input
                  type="text"
                  placeholder="Enter project name..."
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className={styles.input}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
              </div>

              <div className={styles.buttonGroup}>
                <button
                  className={styles.saveButton}
                  onClick={handleSave}
                  disabled={isSaving || !projectName.trim()}
                >
                  {isSaving ? (
                    <MoonLoader color="white" size={14} />
                  ) : (
                    <>
                      <FaSave size={14} />
                      <span>Save</span>
                    </>
                  )}
                </button>

                <button
                  className={styles.quickSaveButton}
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Load Tab */
            <div className={styles.loadSection}>
              {isLoading ? (
                <div className={styles.spinner}>
                  <MoonLoader color="white" size={30} />
                </div>
              ) : saves.length === 0 ? (
                <div className={styles.emptyMessage}>
                  No saved sessions found.
                </div>
              ) : (
                <div className={styles.savesList}>
                  {saves.map((save) => (
                    <div
                      key={save.name}
                      className={styles.saveItem}
                      onClick={() => handleLoad(save.name)}
                    >
                      <div className={styles.saveInfo}>
                        <span className={styles.saveName}>{save.projectName}</span>
                        <span className={styles.saveMeta}>
                          {formatDate(save.savedAt)} • {formatSize(save.size)}
                        </span>
                      </div>
                      <div className={styles.saveActions}>
                        <button
                          className={styles.loadButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoad(save.name);
                          }}
                        >
                          <FaDownload size={12} />
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={(e) => handleDelete(save.name, e)}
                        >
                          <FaTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {(error || localError) && (
            <div className={styles.error}>
              {error || localError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SaveLoadModal;