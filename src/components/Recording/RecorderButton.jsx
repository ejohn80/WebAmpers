import React, {useEffect, useRef, useState} from "react";
import * as Tone from "tone";
import RecordIcon from "../../assets/footer/RecordButton.svg";
import StopRecordIcon from "../../assets/footer/StopRecordButton.svg";

/**
 * Simple recorder using MediaRecorder. Produces an AudioBuffer + blob URL.
 * Also renders a tiny live visualizer next to the button in the footer.
 * Props:
 *  - onComplete(audioData)
 */
export default function RecorderButton({onComplete, onStart, onStop}) {
  const [recording, setRecording] = useState(false);
  const [support, setSupport] = useState(true);
  const mediaRef = useRef(null); // {stream, recorder, chunks: []}
  const counterRef = useRef(1);
  const startTimeRef = useRef(0);
  const timerIdRef = useRef(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  // No footer visualizer in this version

  useEffect(() => {
    setSupport(!!(navigator.mediaDevices && window.MediaRecorder));
    return () => {
      try {
        mediaRef.current?.recorder?.stop?.();
        mediaRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
      } catch {}
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
      // no visualizer teardown needed
    };
  }, []);

  const fmt = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const start = async () => {
    if (!support || recording) return;
    try {
      await Tone.start(); // ensure audio context unlocked
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          const name = `Recording ${counterRef.current++}`;
          // Robust decode path: arrayBuffer -> native AudioBuffer -> Tone.ToneAudioBuffer
          const arrayBuffer = await blob.arrayBuffer();
          if (Tone.context.state !== "running") {
            await Tone.start();
          }
          const native =
            await Tone.context.rawContext.decodeAudioData(arrayBuffer);
          const toneBuffer = new Tone.ToneAudioBuffer(native);
          onComplete &&
            onComplete({
              name,
              buffer: toneBuffer,
              originalFile: null,
              durationSec: native.duration,
            });
        } catch (e) {
          console.error("Recording decode failed", e);
        } finally {
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {}
          mediaRef.current = null;
          setRecording(false);
          // no visualizer resources to stop
        }
      };
      mediaRef.current = {stream, recorder, chunks};
      recorder.start();
      setRecording(true);
      // start elapsed timer
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerIdRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 200);
      // notify parent so main waveform can show live preview
      try {
        onStart && onStart({stream, startTs: startTimeRef.current});
      } catch {}
    } catch (e) {
      console.error("Recording start failed", e);
      setSupport(false);
    }
  };

  const stop = () => {
    if (!recording) return;
    try {
      mediaRef.current?.recorder?.stop?.();
    } catch {}
    // stop elapsed timer; onstop will finalize state
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
    // notify parent live preview to stop immediately
    try {
      onStop && onStop();
    } catch {}
  };

  if (!support) {
    return (
      <button title="Recording not supported" disabled style={{opacity: 0.6}}>
        <img
          src={RecordIcon}
          alt="Record"
          style={{height: 26, display: "block"}}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      title={recording ? "Stop Recording" : "Start Recording"}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: "pointer",
      }}
    >
      {recording ? (
        <span
          className="record-pulse"
          aria-label={`Stop Recording ${fmt(elapsedMs)}`}
        >
          <img
            src={StopRecordIcon}
            alt="Stop Recording"
            style={{height: 26, display: "block"}}
          />
        </span>
      ) : (
        <img
          src={RecordIcon}
          alt="Record"
          style={{height: 26, display: "block"}}
        />
      )}
    </button>
  );
}
