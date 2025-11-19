import React, {useRef, useEffect, useState} from "react";
import "./Waveform.css";
import {progressStore} from "../../playback/progressStore";

/**
 * A component that renders an audio buffer as a waveform on a canvas.
 * @param {object} props
 * @param {Tone.ToneAudioBuffer} props.audioBuffer - The audio buffer to visualize.
 * @param {string} [props.color] - Stroke color for the waveform.
 * @param {number} [props.startOnTimelineMs] - Segment start time on the global timeline (ms).
 * @param {number} [props.durationMs] - Segment duration on the global timeline (ms).
 * @param {boolean} [props.showProgress] - Whether to render the progress bar within this waveform (default true).
 */
const Waveform = ({
  audioBuffer,
  color = "#ffffff",
  startOnTimelineMs = 0,
  durationMs = null,
  showProgress = true,
}) => {
  const canvasRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Use layout size for crisp rendering
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    // 🔧 Unwrap Tone.ToneAudioBuffer -> native AudioBuffer robustly
    let native = null;
    if (audioBuffer instanceof AudioBuffer) {
      native = audioBuffer;
    } else if (audioBuffer && audioBuffer._buffer instanceof AudioBuffer) {
      native = audioBuffer._buffer; // ToneAudioBuffer internal
    } else if (audioBuffer && typeof audioBuffer.get === "function") {
      // Some Tone versions expose .get(channel?) returning Float32Array; not usable here
      // Prefer _buffer path above; if not available, abort to avoid rendering garbage
      native = null;
    }

    if (!native) return; // still nothing to draw

    const data = native.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // allow caller to specify the stroke color (track color) with a sensible default
    ctx.strokeStyle = color || "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0,
        max = -1.0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= data.length) break;
        const v = data[idx];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
  }, [audioBuffer, color]); // Redraw when the audioBuffer or color prop changes

  const [{ms, lengthMs}, setProgress] = useState(progressStore.getState());

  useEffect(() => {
    return progressStore.subscribe(setProgress);
  }, []);

  // Compute playhead position within this segment if we have segment timing,
  // otherwise fall back to global percentage (legacy behavior)
  let pct = 0;
  if (durationMs && durationMs > 0) {
    const rel = (ms - (startOnTimelineMs || 0)) / durationMs;
    const clamped = Math.max(0, Math.min(1, rel));
    pct = clamped * 100;
  } else {
    pct = lengthMs > 0 ? Math.max(0, Math.min(100, (ms / lengthMs) * 100)) : 0;
  }

  // Scrub helpers
  const msAtClientX = (clientX) => {
    const el = canvasRef.current?.parentElement; // container div
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const p = rect.width > 0 ? rel / rect.width : 0;
    // If segment timing provided, map within this segment; else map across global length
    if (durationMs && durationMs > 0) {
      return (startOnTimelineMs || 0) + p * durationMs;
    }
    if (!lengthMs) return;
    return p * lengthMs;
  };

  const onMouseDown = (e) => {
    draggingRef.current = true;
    progressStore.beginScrub();
    const target = msAtClientX(e.clientX);
    if (typeof target === "number") {
      // preview only: move the playhead visually without seeking audio
      progressStore.setMs(target);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  const onMouseMove = (e) => {
    if (!draggingRef.current) return;
    const target = msAtClientX(e.clientX);
    if (typeof target === "number") {
      progressStore.setMs(target);
    }
  };
  const onMouseUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const target = msAtClientX(e.clientX);
    if (typeof target === "number") {
      // finalize seek in the engine and progress store
      progressStore.requestSeek(target);
    }
    progressStore.endScrub();
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  useEffect(
    () => () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    },
    []
  );

  // Touch support
  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    draggingRef.current = true;
    progressStore.beginScrub();
    const target = msAtClientX(e.touches[0].clientX);
    if (typeof target === "number") {
      progressStore.setMs(target);
    }
  };
  const onTouchMove = (e) => {
    if (!draggingRef.current || !e.touches || e.touches.length === 0) return;
    const target = msAtClientX(e.touches[0].clientX);
    if (typeof target === "number") {
      progressStore.setMs(target);
    }
  };
  const onTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // finalize at current playhead; engine will have been paused
    const {ms: current} = progressStore.getState();
    progressStore.requestSeek(current);
    progressStore.endScrub();
  };

  return (
    <div
      className="waveform-container"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <canvas ref={canvasRef} className="waveform-canvas" />
      {showProgress && (
        <div className="waveform-progress" style={{left: `${pct}%`}} />
      )}
    </div>
  );
};

export default Waveform;
