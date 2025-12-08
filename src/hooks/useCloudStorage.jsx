import {useState, useCallback, useContext} from "react";
import {AppContext} from "../context/AppContext";
import {cloudStorageManager} from "../managers/CloudStorageManager";

/**
 * Hook for managing session saves to Firebase Storage
 * @returns {Object} Save/load functions and state
 */
export function useCloudStorage() {
  const {userData} = useContext(AppContext); // Get user auth data from context

  // State
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saves, setSaves] = useState([]); // List of saved sessions
  const [error, setError] = useState(null);

  /**
   * Save current session to Firebase with custom project name
   */
  const saveSession = useCallback(
    async (projectName) => {
      if (!userData?.uid) {
        setError("Please log in to save your session");
        return null;
      }

      setIsSaving(true);
      setError(null);

      try {
        const url = await cloudStorageManager.saveToFirebase(
          userData.uid,
          projectName || "Untitled Project"
        );
        return url; // Returns Firebase storage URL
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userData]
  );

  /**
   * Quick save to a standard slot (auto-named)
   */
  const quickSave = useCallback(async () => {
    if (!userData?.uid) {
      setError("Please log in to save your session");
      return null;
    }

    setIsSaving(true);
    setError(null);

    try {
      const url = await cloudStorageManager.quickSave(userData.uid);
      return url;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [userData]);

  /**
   * Load specific session from Firebase by filename
   * @param {boolean} clearExisting - Whether to clear current session first
   */
  const loadSession = useCallback(
    async (fileName, clearExisting = true) => {
      if (!userData?.uid) {
        setError("Please log in to load a session");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const stats = await cloudStorageManager.loadFromFirebase(
          userData.uid,
          fileName,
          clearExisting
        );
        return stats; // Returns load statistics/metadata
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userData]
  );

  /**
   * Quick load from standard slot
   */
  const quickLoad = useCallback(
    async (clearExisting = true) => {
      if (!userData?.uid) {
        setError("Please log in to load a session");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const stats = await cloudStorageManager.quickLoad(
          userData.uid,
          clearExisting
        );
        return stats;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userData]
  );

  /**
   * List all saved sessions for current user
   */
  const listSaves = useCallback(async () => {
    if (!userData?.uid) {
      setError("Please log in to view saves");
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const savesList = await cloudStorageManager.listSaves(userData.uid);
      setSaves(savesList); // Update state with list
      return savesList;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [userData]);

  /**
   * Delete a saved session by filename
   */
  const deleteSave = useCallback(
    async (fileName) => {
      if (!userData?.uid) {
        setError("Please log in to delete saves");
        return false;
      }

      setError(null);

      try {
        await cloudStorageManager.deleteSave(userData.uid, fileName);
        // Refresh the list after deletion
        await listSaves();
        return true;
      } catch (err) {
        setError(err.message);
        return false;
      }
    },
    [userData, listSaves]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isSaving,
    isLoading,
    saves,
    error,
    isAuthenticated: !!userData?.uid, // Convenience flag

    // Actions
    saveSession,
    quickSave,
    loadSession,
    quickLoad,
    listSaves,
    deleteSave,
    clearError,
  };
}
