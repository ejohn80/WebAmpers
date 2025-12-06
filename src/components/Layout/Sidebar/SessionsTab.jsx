import {useState, useEffect, useContext, useRef, useCallback} from "react";
import {MoonLoader} from "react-spinners";
import {RxCross2} from "react-icons/rx";
import {FaTrash} from "react-icons/fa";
import {AppContext} from "../../../context/AppContext";
import {createDefaultEffects} from "../../../context/effectsStorage";
import {dbManager} from "../../../managers/DBManager";
import styles from "../Layout.module.css";

function SessionsTab() {
  const {activeSession, setActiveSession, effects, setEffects, dbRefreshTrigger} =
    useContext(AppContext);

  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const initializingRef = useRef(false);

  // Load sessions from IndexedDB
  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const allSessions = await dbManager.getAllSessions();
      setSessions(allSessions);

      // If there's an active session ID but the session doesn't exist, clear it
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

  // Initialize: Create default session if none exist
  useEffect(() => {
    if (hasInitialized || initializingRef.current) return;
    initializingRef.current = true;

    const initialize = async () => {
      try {
        const allSessions = await loadSessions();

        // If no sessions exist, create a default one
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
          // If sessions exist but none is active, activate the first one
          console.log(
            "Setting active session to first available:",
            allSessions[0].id
          );
          setActiveSession(allSessions[0].id);
        } else {
          // Active session exists, load its effects
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

  // Reload sessions when dbRefreshTrigger changes (from loading cloud saves)
  useEffect(() => {
    if (hasInitialized) {
      loadSessions();
    }
  }, [dbRefreshTrigger, hasInitialized, loadSessions]);

  // Load session effects when active session changes
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

  // Save effects when they change
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

  const createSession = async () => {
    setError(null);

    try {
      // Auto-generate session name based on count
      const sessionNumber = sessions.length + 1;
      const newSessionName = `Session ${sessionNumber}`;

      // Use clean default effects
      const newSessionId = await dbManager.createSession(newSessionName, {
        effects: createDefaultEffects(),
      });
      await loadSessions();

      // Set the newly created session as active
      setActiveSession(newSessionId);
    } catch (e) {
      console.error(e);
      setError("Failed to create session.");
    }
  };

  const handleRenameSession = async (sessionId, newName) => {
    if (!newName.trim()) {
      setError("Session name cannot be empty");
      return;
    }

    try {
      // Check for duplicate
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

  const handleDoubleClick = (session) => {
    setRenamingSessionId(session.id);
    setRenameValue(session.name);
  };

  const handleDeleteSession = async (sessionId, event) => {
    event.stopPropagation();

    // Prevent deleting the last session
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

      // If we deleted the active session, switch to another one
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
      {isLoading ? (
        <div className={styles.spinner}>
          <MoonLoader color="white" />
        </div>
      ) : (
        <div>
          {sessions.length === 0 ? (
            <p className={styles.emptyMessage}>No sessions yet.</p>
          ) : (
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
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className={styles.deleteButton}
                      aria-label="Delete session"
                    >
                      <FaTrash size={12} />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.createButton} onClick={() => createSession()}>
        Create a session
      </button>
    </div>
  );
}

export default SessionsTab;
