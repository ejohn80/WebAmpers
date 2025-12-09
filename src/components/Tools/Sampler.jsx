/**
 * Sampler.jsx
 *
 * A draggable virtual instrument panel with piano and drum sampler capabilities.
 * Features include:
 * - Switchable piano/drum instruments with visual UI
 * - Keyboard and mouse input support
 * - Audio recording with timeline events
 * - Drag-and-drop panel positioning
 * - Audio sample loading with Tone.js
 *
 * Exports recorded data including MIDI-like events and audio blob to parent component.
 *
 */

import React, {useState, useEffect, useRef, useCallback, useMemo} from "react";
import * as Tone from "tone";
import styles from "./Sampler.module.css";

// Piano sample file mappings
const PIANO_SOUNDS = {
  A0: "A0.mp3",
  A1: "A1.mp3",
  A2: "A2.mp3",
  A3: "A3.mp3",
  A4: "A4.mp3",
  A5: "A5.mp3",
  A6: "A6.mp3",
  A7: "A7.mp3",
  C1: "C1.mp3",
  C2: "C2.mp3",
  C3: "C3.mp3",
  C4: "C4.mp3",
  C5: "C5.mp3",
  C6: "C6.mp3",
  C7: "C7.mp3",
  C8: "C8.mp3",
  "D#1": "Ds1.mp3",
  "D#2": "Ds2.mp3",
  "D#3": "Ds3.mp3",
  "D#4": "Ds4.mp3",
  "D#5": "Ds5.mp3",
  "D#6": "Ds6.mp3",
  "D#7": "Ds7.mp3",
  "F#1": "Fs1.mp3",
  "F#2": "Fs2.mp3",
  "F#3": "Fs3.mp3",
  "F#4": "Fs4.mp3",
  "F#5": "Fs5.mp3",
  "F#6": "Fs6.mp3",
  "F#7": "Fs7.mp3",
};

// Piano UI key layout (1 octave)
const PIANO_KEYS = [
  {note: "C4", label: "C", key: "a", isBlack: false},
  {note: "C#4", label: "C#", key: "w", isBlack: true, offset: 1},
  {note: "D4", label: "D", key: "s", isBlack: false},
  {note: "D#4", label: "D#", key: "e", isBlack: true, offset: 2},
  {note: "E4", label: "E", key: "d", isBlack: false},
  {note: "F4", label: "F", key: "f", isBlack: false},
  {note: "F#4", label: "F#", key: "t", isBlack: true, offset: 4},
  {note: "G4", label: "G", key: "g", isBlack: false},
  {note: "G#4", label: "G#", key: "y", isBlack: true, offset: 5},
  {note: "A4", label: "A", key: "h", isBlack: false},
  {note: "A#4", label: "A#", key: "u", isBlack: true, offset: 6},
  {note: "B4", label: "B", key: "j", isBlack: false},
];

// Drum pad configuration
const DRUM_PADS = [
  {note: "C1", label: "Kick", key: "a", file: "kick-plain"},
  {note: "D1", label: "Snare", key: "s", file: "snare-acoustic01"},
  {note: "E1", label: "Hi-Hat", key: "d", file: "hihat-plain"},
  {note: "F1", label: "Open HH", key: "f", file: "openhat-tight"},
  {note: "G1", label: "Tom", key: "g", file: "tom-acoustic01"},
  {note: "A1", label: "Clap", key: "h", file: "clap-analog"},
  {note: "B1", label: "Kick 2", key: "j", file: "kick-thump"},
  {note: "C2", label: "Snare 2", key: "k", file: "snare-808"},
];

// Map drum notes to file names
const DRUM_SOUNDS = DRUM_PADS.reduce((acc, pad) => {
  acc[pad.note] = `${pad.file}.wav`;
  return acc;
}, {});

/**
 * Sampler component - Virtual piano/drum instrument with recording
 */
const Sampler = ({
  isOpen,
  onClose,
  onSaveRecording,
  initialPosition = {x: 100, y: 100},
}) => {
  // State
  const [instrument, setInstrument] = useState("piano"); // 'piano' | 'drum'
  const [activeKeys, setActiveKeys] = useState(new Set()); // Currently pressed keys
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false); // Samples loaded
  const [position, setPosition] = useState(initialPosition); // Panel position
  const [isDragging, setIsDragging] = useState(false); // Drag state
  const [dragOffset, setDragOffset] = useState({x: 0, y: 0}); // Drag offset

  // Refs
  const panelRef = useRef(null);
  const pianoSamplerRef = useRef(null);
  const drumSamplerRef = useRef(null);
  const recorderRef = useRef(null); // Tone.Recorder instance
  const recordingStartTimeRef = useRef(null); // Recording start timestamp
  const recordingIntervalRef = useRef(null); // Recording timer interval
  const recordedEventsRef = useRef([]); // Note events during recording
  const destinationRef = useRef(null); // Audio output destination
  const recordedBlobRef = useRef(null); // Recorded audio blob

  // Initialize audio samplers and recorder
  useEffect(() => {
    if (!isOpen) return;

    setIsLoaded(false);

    destinationRef.current = new Tone.Gain(1).toDestination();

    // Setup recorder
    recorderRef.current = new Tone.Recorder();
    destinationRef.current.connect(recorderRef.current);

    let loadedCount = 0;
    const totalToLoad = 2; // Piano + drum samplers

    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= totalToLoad) {
        setIsLoaded(true);
      }
    };

    // Piano sampler
    pianoSamplerRef.current = new Tone.Sampler({
      urls: PIANO_SOUNDS,
      baseUrl: "/sounds/piano/",
      release: 1,
      onload: checkLoaded,
      onerror: (err) => {
        console.warn("Piano sampler load error:", err);
        checkLoaded();
      },
    }).connect(destinationRef.current);

    // Drum sampler
    drumSamplerRef.current = new Tone.Sampler({
      urls: DRUM_SOUNDS,
      baseUrl: "/sounds/drum/",
      release: 0.5,
      onload: checkLoaded,
      onerror: (err) => {
        console.warn("Drum sampler load error:", err);
        checkLoaded();
      },
    }).connect(destinationRef.current);

    // Cleanup on unmount
    return () => {
      if (pianoSamplerRef.current) {
        pianoSamplerRef.current.dispose();
        pianoSamplerRef.current = null;
      }
      if (drumSamplerRef.current) {
        drumSamplerRef.current.dispose();
        drumSamplerRef.current = null;
      }
      if (recorderRef.current) {
        recorderRef.current.dispose();
        recorderRef.current = null;
      }
      if (destinationRef.current) {
        destinationRef.current.dispose();
        destinationRef.current = null;
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isOpen]);

  // Play a note and record if recording
  const playNote = useCallback(
    (note) => {
      const sampler =
        instrument === "piano"
          ? pianoSamplerRef.current
          : drumSamplerRef.current;

      if (!sampler || !isLoaded) return;

      // Start audio context if not already running
      if (Tone.context.state !== "running") {
        Tone.start();
      }

      try {
        sampler.triggerAttack(note);

        // Record event if recording
        if (isRecording && recordingStartTimeRef.current) {
          const timestamp = Date.now() - recordingStartTimeRef.current;
          recordedEventsRef.current.push({
            note,
            timestamp,
            type: "attack",
            instrument,
          });
        }
      } catch (err) {
        console.warn("Failed to play note:", note, err);
      }
    },
    [instrument, isLoaded, isRecording]
  );

  // Release a note
  const releaseNote = useCallback(
    (note) => {
      const sampler =
        instrument === "piano"
          ? pianoSamplerRef.current
          : drumSamplerRef.current;

      if (!sampler || !isLoaded) return;

      try {
        sampler.triggerRelease(note);

        // Record release event
        if (isRecording && recordingStartTimeRef.current) {
          const timestamp = Date.now() - recordingStartTimeRef.current;
          recordedEventsRef.current.push({
            note,
            timestamp,
            type: "release",
            instrument,
          });
        }
      } catch (err) {
        console.log(err);
      }
    },
    [instrument, isLoaded, isRecording]
  );

  // Keyboard event handling
  useEffect(() => {
    if (!isOpen) return;

    // Get valid keys for current instrument
    const keys =
      instrument === "piano"
        ? PIANO_KEYS.map((k) => k.key)
        : DRUM_PADS.map((p) => p.key);

    // Create key-to-note mapping
    const keyToNoteMap =
      instrument === "piano"
        ? PIANO_KEYS.reduce((acc, k) => {
            acc[k.key] = k.note;
            return acc;
          }, {})
        : DRUM_PADS.reduce((acc, p) => {
            acc[p.key] = p.note;
            return acc;
          }, {});

    const handleKeyDown = (e) => {
      // Ignore if typing in input
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Play note if valid key pressed
      if (keys.includes(key) && !e.repeat) {
        e.preventDefault();
        const note = keyToNoteMap[key];

        setActiveKeys((prev) => new Set([...prev, key]));
        playNote(note);
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();

      if (keys.includes(key)) {
        e.preventDefault();
        const note = keyToNoteMap[key];

        setActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        releaseNote(note);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isOpen, instrument, playNote, releaseNote]);

  // Start/stop recording
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);

      // Get recorded audio blob
      if (recorderRef.current) {
        try {
          const recording = await recorderRef.current.stop();
          recordedBlobRef.current = recording;
          console.log("Recording stopped, blob size:", recording.size);
        } catch (err) {
          console.warn("Failed to stop recorder:", err);
        }
      }
    } else {
      // Start recording
      recordedEventsRef.current = [];
      recordedBlobRef.current = null;
      recordingStartTimeRef.current = Date.now();
      setRecordingTime(0);
      setIsRecording(true);

      // Start audio recorder
      if (recorderRef.current) {
        try {
          await recorderRef.current.start();
        } catch (err) {
          console.warn("Failed to start recorder:", err);
        }
      }

      // Update recording timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 100);
      }, 100);
    }
  }, [isRecording]);

  // Save recording to parent
  const handleSaveRecording = useCallback(async () => {
    if (!isRecording && recordedEventsRef.current.length === 0) {
      return;
    }

    let audioBlob = recordedBlobRef.current;

    // Stop recording if active
    if (isRecording) {
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }

    // Get final audio blob
    if (recorderRef.current) {
      try {
        audioBlob = await recorderRef.current.stop();
        recordedBlobRef.current = audioBlob;
      } catch (err) {
        console.warn("Failed to get recording blob:", err);
      }
    }

    // Pass data to parent component
    if (onSaveRecording) {
      onSaveRecording({
        events: recordedEventsRef.current,
        duration: recordingTime,
        instrument,
        audioBlob,
        name: `SR - ${new Date().toLocaleTimeString()}`,
      });
    }

    // Reset recording state
    recordedEventsRef.current = [];
    setRecordingTime(0);
    recordingStartTimeRef.current = null;
    recordedBlobRef.current = null;
  }, [isRecording, recordingTime, instrument, onSaveRecording]);

  // Discard recording
  const handleDiscardRecording = useCallback(async () => {
    if (isRecording) {
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);

      // Stop recorder
      if (recorderRef.current) {
        try {
          await recorderRef.current.stop();
        } catch (err) {
          console.log(err);
        }
      }
    }

    // Clear recording data
    recordedEventsRef.current = [];
    setRecordingTime(0);
    recordingStartTimeRef.current = null;
    recordedBlobRef.current = null;
  }, [isRecording]);

  // Format time for display
  const formatTime = (ms, showCentiseconds = false) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (showCentiseconds) {
      const centiseconds = Math.floor((ms % 1000) / 10);
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
    }

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Dragging handlers for panel
  const handleMouseDown = (e) => {
    // Don't drag if clicking on interactive elements
    const isLoadingOverlay = e.target.closest(`.${styles.loadingOverlay}`);

    if (
      !isLoadingOverlay &&
      (e.target.closest(`.${styles.keyboardContainer}`) ||
        e.target.closest(`.${styles.instrumentSelector}`) ||
        e.target.closest(`.${styles.recordingControls}`) ||
        e.target.closest(`.${styles.closeButton}`))
    ) {
      return;
    }
    setIsDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({x: e.clientX - rect.left, y: e.clientY - rect.top});
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 520);
      const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 400);
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    },
    [isDragging, dragOffset]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // Add/remove global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Memoize filtered key lists
  const whiteKeys = useMemo(() => PIANO_KEYS.filter((k) => !k.isBlack), []);
  const blackKeys = useMemo(() => PIANO_KEYS.filter((k) => k.isBlack), []);

  // Calculate black key positions (between white keys)
  const getBlackKeyPosition = useCallback(
    (keyIndex) => {
      const whiteKeyWidth = 100 / whiteKeys.length;
      const positions = {
        1: 1.075, // C# after C
        2: 2.05, // D# after D
        4: 4, // F# after F
        5: 4.975, // G# after G
        6: 5.925, // A# after A
      };
      return positions[keyIndex] * whiteKeyWidth;
    },
    [whiteKeys.length]
  );

  const hasRecordedEvents =
    recordedEventsRef.current.length > 0 || recordingTime > 0;

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`${styles.samplerPanel} ${isDragging ? styles.dragging : ""}`}
      style={{left: position.x, top: position.y}}
      onMouseDown={handleMouseDown}
    >
      {/* Header with close button */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>Sampler</h3>
        </div>
        <button className={styles.closeButton} onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M1.4 14L0 12.6L5.6 7L0 1.4L1.4 0L7 5.6L12.6 0L14 1.4L8.4 7L14 12.6L12.6 14L7 8.4L1.4 14Z" />
          </svg>
        </button>
      </div>

      {/* Instrument selector */}
      <div className={styles.instrumentSelector}>
        <button
          className={`${styles.instrumentButton} ${instrument === "piano" ? styles.active : ""}`}
          onClick={() => setInstrument("piano")}
        >
          Piano
        </button>
        <button
          className={`${styles.instrumentButton} ${instrument === "drum" ? styles.active : ""}`}
          onClick={() => setInstrument("drum")}
        >
          Drums
        </button>
      </div>

      {/* Keyboard/drum pad area */}
      <div className={styles.keyboardContainer}>
        {/* Loading overlay */}
        {!isLoaded && (
          <div className={styles.loadingOverlay}>
            <span className={styles.loadingText}>Loading samples...</span>
          </div>
        )}

        {/* Piano keyboard */}
        {instrument === "piano" ? (
          <div className={styles.pianoKeyboard}>
            {whiteKeys.map((pianoKey) => (
              <div
                key={pianoKey.note}
                className={`${styles.pianoKey} ${activeKeys.has(pianoKey.key) ? styles.active : ""}`}
                onMouseDown={() => {
                  setActiveKeys((prev) => new Set([...prev, pianoKey.key]));
                  playNote(pianoKey.note);
                }}
                onMouseUp={() => {
                  setActiveKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(pianoKey.key);
                    return next;
                  });
                  releaseNote(pianoKey.note);
                }}
                onMouseLeave={() => {
                  if (activeKeys.has(pianoKey.key)) {
                    setActiveKeys((prev) => {
                      const next = new Set(prev);
                      next.delete(pianoKey.key);
                      return next;
                    });
                    releaseNote(pianoKey.note);
                  }
                }}
              >
                <span className={styles.keyLabel}>{pianoKey.label}</span>
                <span className={styles.keyBinding}>{pianoKey.key}</span>
              </div>
            ))}
            {blackKeys.map((pianoKey) => (
              <div
                key={pianoKey.note}
                className={`${styles.pianoKey} ${styles.black} ${activeKeys.has(pianoKey.key) ? styles.active : ""}`}
                style={{left: `${getBlackKeyPosition(pianoKey.offset)}%`}}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setActiveKeys((prev) => new Set([...prev, pianoKey.key]));
                  playNote(pianoKey.note);
                }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  setActiveKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(pianoKey.key);
                    return next;
                  });
                  releaseNote(pianoKey.note);
                }}
                onMouseLeave={() => {
                  if (activeKeys.has(pianoKey.key)) {
                    setActiveKeys((prev) => {
                      const next = new Set(prev);
                      next.delete(pianoKey.key);
                      return next;
                    });
                    releaseNote(pianoKey.note);
                  }
                }}
              >
                <span className={styles.keyLabel}>{pianoKey.label}</span>
                <span className={styles.keyBinding}>{pianoKey.key}</span>
              </div>
            ))}
          </div>
        ) : (
          // Drum pad grid
          <div className={styles.drumPadGrid}>
            {DRUM_PADS.map((pad) => (
              <div
                key={pad.note}
                className={`${styles.drumPad} ${activeKeys.has(pad.key) ? styles.active : ""}`}
                onMouseDown={() => {
                  setActiveKeys((prev) => new Set([...prev, pad.key]));
                  playNote(pad.note);
                }}
                onMouseUp={() => {
                  setActiveKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(pad.key);
                    return next;
                  });
                  releaseNote(pad.note);
                }}
                onMouseLeave={() => {
                  if (activeKeys.has(pad.key)) {
                    setActiveKeys((prev) => {
                      const next = new Set(prev);
                      next.delete(pad.key);
                      return next;
                    });
                    releaseNote(pad.note);
                  }
                }}
              >
                <span className={styles.padLabel}>{pad.label}</span>
                <span className={styles.keyBinding}>{pad.key}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recording controls */}
      <div className={styles.recordingControls}>
        <div className={styles.recordingStatus}>
          <button
            className={`${styles.recordButton} ${isRecording ? styles.recording : ""}`}
            onClick={toggleRecording}
            title={
              isRecording ? "Stop Recording (Space)" : "Start Recording (Space)"
            }
          >
            <div className={styles.recordButtonInner} />
          </button>
          <span
            className={`${styles.recordingTime} ${isRecording ? styles.active : ""}`}
          >
            {formatTime(recordingTime, true)}
          </span>
        </div>

        <div className={styles.saveControls}>
          <button
            className={styles.discardButton}
            onClick={handleDiscardRecording}
            disabled={!hasRecordedEvents && !isRecording}
          >
            Discard
          </button>
          <button
            className={styles.saveButton}
            onClick={handleSaveRecording}
            disabled={!hasRecordedEvents && !isRecording}
          >
            Save to Track
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sampler;
