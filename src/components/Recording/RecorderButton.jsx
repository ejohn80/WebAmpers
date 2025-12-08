/**
 * RecorderButton Component
 *
 * Audio recording button using MediaRecorder API.
 * Captures microphone input, creates ToneAudioBuffer, and provides to parent.
 * Includes recording timer and visual state indicators.
 */

import React, {useEffect, useRef, useState} from "react";
import * as Tone from "tone";

export default function RecorderButton({onComplete, onStart, onStop}) {
  // Component state
  const [recording, setRecording] = useState(false);
  const [support, setSupport] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs for recording state and timing
  const mediaRef = useRef(null); // {stream, recorder, chunks: []}
  const counterRef = useRef(1);
  const startTimeRef = useRef(0);
  const timerIdRef = useRef(null);

  /**
   * Check for MediaRecorder support and clean up on unmount
   */
  useEffect(() => {
    setSupport(!!(navigator.mediaDevices && window.MediaRecorder));

    return () => {
      // Stop any active recording
      try {
        mediaRef.current?.recorder?.stop?.();
        mediaRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
      } catch {
        // Intentionally empty
      }

      // Clear timer
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, []);

  /**
   * Format milliseconds to MM:SS display
   */
  const fmt = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  /**
   * Start audio recording from microphone
   */
  const start = async () => {
    if (!support || recording) return;

    try {
      await Tone.start(); // Ensure audio context is unlocked

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      // Setup recorder event handlers
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          const name = `Recording ${counterRef.current++}`;

          // Convert blob to AudioBuffer
          const arrayBuffer = await blob.arrayBuffer();
          if (Tone.context.state !== "running") {
            await Tone.start();
          }

          const native =
            await Tone.context.rawContext.decodeAudioData(arrayBuffer);
          const toneBuffer = new Tone.ToneAudioBuffer(native);

          // Pass recording data to parent
          onComplete?.({
            name,
            buffer: toneBuffer,
            originalFile: null,
            durationSec: native.duration,
          });
        } catch (e) {
          console.error("Recording decode failed", e);
        } finally {
          // Cleanup
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {
            // Intentionally empty
          }
          mediaRef.current = null;
          setRecording(false);
        }
      };

      // Store recording state
      mediaRef.current = {stream, recorder, chunks};
      recorder.start();
      setRecording(true);

      // Start recording timer
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerIdRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 200);

      // Notify parent for live preview
      onStart?.({stream, startTs: startTimeRef.current});
    } catch (e) {
      console.error("Recording start failed", e);
      setSupport(false);
    }
  };

  /**
   * Stop active recording
   */
  const stop = () => {
    if (!recording) return;

    try {
      mediaRef.current?.recorder?.stop?.();
    } catch {
      // Intentionally empty
    }

    // Stop timer
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }

    // Notify parent to stop live preview
    onStop?.();
  };

  // Unsupported browser state
  if (!support) {
    return (
      <button title="Recording not supported" disabled className="rec-button">
        <span className="rec-indicator" />
        <span>Rec</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      title={recording ? "Stop Recording" : "Start Recording"}
      className={`rec-button${recording ? " recording" : ""}`}
    >
      <span className="rec-indicator" />
      <span>{recording ? `Stop (${fmt(elapsedMs)})` : "Rec"}</span>
    </button>
  );
}
