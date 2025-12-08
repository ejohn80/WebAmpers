/**
 * SessionsTab Component
 *
 * Tab panel for managing user sessions.
 * Handles session creation, renaming, deletion, and switching between sessions.
 * Each session maintains its own effect settings and track data in IndexedDB.
 */

import {useState, useEffect, useContext, useRef, useCallback} from "react";
import {MoonLoader} from "react-spinners";
import {AppContext} from "../../../context/AppContext";
import {createDefaultEffects} from "../../../context/effectsStorage";
import {dbManager} from "../../../managers/DBManager";
import styles from "../Layout.module.css";
import {DeleteIcon} from "../Svgs.jsx";

function SessionsTab() {
  // Access session management from AppContext
  const {
    activeSession,
    setActiveSession,
    effects,
    setEffects,
    dbRefreshTrigger,
  } = useContext(AppContext);

  // Component state
  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const initializingRef = useRef(false);

  /**
   * Load all sessions from IndexedDB
   */
  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const allSessions = await dbManager.getAllSessions();
      setSessions(allSessions);

      // Clear active session if it no longer exists
      if (activeSession && !allSessions.find((s) => s.id === activeSession)) {
        setActiveSession(null);
      }

      return allSessions;
    } catch (e) {
      console.error("Failed to load sessions:", e);
      setError("Failed to load sessions.");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [activeSession, setActiveSession]);

  /**
   * Initialize sessions on mount:
   * - Load existing sessions
   * - Create default session if none exist
   * - Set active session
   */
  useEffect(() => {
    if (hasInitialized || initializingRef.current) return;
    initializingRef.current = true;

    const initialize = async () => {
      try {
        const allSessions = await loadSessions();

        // Create default session if none exist
        if (allSessions.length === 0) {
          try {
            const defaultSessionId = await dbManager.createSession(
              "Session 1",
              {
                effects: createDefaultEffects(),
              }
            );
            console.log("Created default session:", defaultSessionId);
            setActiveSession(defaultSessionId);
            await loadSessions();
          } catch (e) {
            console.error("Failed to create default session:", e);
          }
        } else if (!activeSession) {
          // Set first session as active if none selected
          console.log(
            "Setting active session to first available:",
            allSessions[0].id
          );
          setActiveSession(allSessions[0].id);
        } else {
          // Load effects for existing active session
          console.log("Loading existing active session:", activeSession);
          try {
            const session = await dbManager.getSession(activeSession);
            if (session && session.effects) {
              setEffects(session.effects);
            }
          } catch (e) {
            console.error("Failed to load initial session data:", e);
          }
        }

        setHasInitialized(true);
      } finally {
        initializingRef.current = false;
      }
    };

    initialize();
  }, [
    hasInitialized,
    activeSession,
    setEffects,
    loadSessions,
    setActiveSession,
  ]);

  /**
   * Reload sessions when database trigger changes (e.g., cloud save loads)
   */
  useEffect(() => {
    if (hasInitialized) {
      loadSessions();
    }
  }, [dbRefreshTrigger, hasInitialized, loadSessions]);

  /**
   * Load session effects when active session changes
   */
  useEffect(() => {
    if (!activeSession || !hasInitialized) return;

    const loadSessionEffects = async () => {
      try {
        const session = await dbManager.getSession(activeSession);
        if (session && session.effects) {
          console.log("Loading effects for session", activeSession);
          setEffects(session.effects);
        }
      } catch (e) {
        console.error("Failed to load session effects:", e);
      }
    };

    loadSessionEffects();
  }, [activeSession, hasInitialized, setEffects]);

  /**
   * Save effects to session when they change (debounced)
   */
  useEffect(() => {
    if (!activeSession || !hasInitialized) return;

    const saveEffects = async () => {
      try {
        await dbManager.updateSession(activeSession, {effects});
      } catch (e) {
        console.error("Failed to save session effects:", e);
      }
    };

    const timer = setTimeout(saveEffects, 500);
    return () => clearTimeout(timer);
  }, [effects, activeSession, hasInitialized]);

  /**
   * Create a new session with auto-generated name
   */
  const createSession = async () => {
    setError(null);

    try {
      // Generate sequential session name
      const sessionNumber = sessions.length + 1;
      const newSessionName = `Session ${sessionNumber}`;

      // Create with default effects
      const newSessionId = await dbManager.createSession(newSessionName, {
        effects: createDefaultEffects(),
      });
      await loadSessions();

      // Switch to new session
      setActiveSession(newSessionId);
    } catch (e) {
      console.error(e);
      setError("Failed to create session.");
    }
  };

  /**
   * Rename a session with duplicate name validation
   * @param {number} sessionId - ID of session to rename
   * @param {string} newName - New session name
   */
  const handleRenameSession = async (sessionId, newName) => {
    if (!newName.trim()) {
      setError("Session name cannot be empty");
      return;
    }

    try {
      // Check for duplicate names
      const exists = await dbManager.sessionExists(newName);
      const session = sessions.find((s) => s.id === sessionId);

      if (exists && session.name !== newName.trim()) {
        setError("A session with that name already exists.");
        return;
      }

      await dbManager.updateSession(sessionId, {name: newName.trim()});
      await loadSessions();
      setRenamingSessionId(null);
      setRenameValue("");
      setError(null);
    } catch (e) {
      console.error("Failed to rename session:", e);
      setError("Failed to rename session.");
    }
  };

  /**
   * Start rename mode on double-click
   * @param {Object} session - Session object
   */
  const handleDoubleClick = (session) => {
    setRenamingSessionId(session.id);
    setRenameValue(session.name);
  };

  /**
   * Delete a session with confirmation
   * Prevents deleting the last session
   * @param {number} sessionId - ID of session to delete
   * @param {Event} event - Click event for stopPropagation
   */
  const handleDeleteSession = async (sessionId, event) => {
    event.stopPropagation();

    // Prevent deleting last session
    if (sessions.length <= 1) {
      setError("Cannot delete the last session.");
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this session? All tracks will be deleted."
      )
    ) {
      return;
    }

    try {
      await dbManager.deleteSession(sessionId);

      // Switch to another session if deleting active one
      if (activeSession === sessionId) {
        const remainingSessions = sessions.filter((s) => s.id !== sessionId);
        if (remainingSessions.length > 0) {
          setActiveSession(remainingSessions[0].id);
        }
      }

      await loadSessions();
    } catch (e) {
      console.error("Failed to delete session:", e);
      setError("Failed to delete session.");
    }
  };

  return (
    <div className={styles.container}>
      {/* Loading State */}
      {isLoading ? (
        <div className={styles.spinner}>
          <MoonLoader color="white" />
        </div>
      ) : (
        <div>
          {/* Empty State */}
          {sessions.length === 0 ? (
            <p className={styles.emptyMessage}>No sessions yet.</p>
          ) : (
            /* Sessions List */
            <ul className={styles.projectsList}>
              {[...sessions]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => (
                  <li
                    key={s.id}
                    onClick={() => {
                      if (renamingSessionId !== s.id) {
                        setActiveSession(s.id);
                      }
                    }}
                    onDoubleClick={() => handleDoubleClick(s)}
                    className={`${styles.projectItem} ${s.id === activeSession ? styles.activeProject : ""}`}
                  >
                    {/* Rename Input or Session Name */}
                    {renamingSessionId === s.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameSession(s.id, renameValue)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleRenameSession(s.id, renameValue);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setRenamingSessionId(null);
                            setRenameValue("");
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={styles.input}
                        autoFocus
                        style={{flex: 1, marginRight: "8px"}}
                      />
                    ) : (
                      <span>{s.name}</span>
                    )}

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className={styles.deleteButton}
                      aria-label="Delete session"
                    >
                      <DeleteIcon />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && <p className={styles.error}>{error}</p>}

      {/* Create Session Button */}
      <button className={styles.createButton} onClick={() => createSession()}>
        Create a session
      </button>
    </div>
  );
}

export default SessionsTab;
