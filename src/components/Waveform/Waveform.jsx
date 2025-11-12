import React, {useRef, useEffect, useState} from "react";
import "./Waveform.css";
import {progressStore} from "../../playback/progressStore";

/**
 * A component that renders an audio buffer as a waveform on a canvas.
 * @param {object} props
 * @param {Tone.ToneAudioBuffer} props.audioBuffer - The audio buffer to visualize.
 */
const Waveform = ({
  audioBuffer,
  color = "#ffffff",
  pixelsPerSecond = 120, // tweak this for more/less horizontal zoom
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const draggingRef = useRef(false);

  const [canvasWidth, setCanvasWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [{ms, lengthMs}, setProgress] = useState(progressStore.getState());

  // Subscribe to global playback progress
  useEffect(() => progressStore.subscribe(setProgress), []);

  // Track container size (for correct playhead positioning)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleResize = () => {
      setContainerWidth(el.clientWidth || 0);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Track horizontal scroll so playhead follows when user slides
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => setScrollLeft(el.scrollLeft || 0);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Draw waveform whenever buffer changes
  useEffect(() => {
    if (!audioBuffer || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
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

    // Always base horizontal scale on the actual buffer duration
    const durationSec =
      typeof native.duration === "number" && native.duration > 0
        ? native.duration
        : data.length / (native.sampleRate || 44100);

    const bufferDurationMs = durationSec * 1000;
    setDurationMs(bufferDurationMs);

    const baseWidth = container.clientWidth || 1;
    const fullWidth = Math.max(baseWidth, durationSec * pixelsPerSecond);

    canvas.width = fullWidth;
    canvas.height = container.clientHeight || 80;
    setCanvasWidth(fullWidth);

    // Draw waveform
    const step = Math.max(1, Math.floor(data.length / fullWidth));
    const amp = canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // allow caller to specify the stroke color (track color) with a sensible default
    ctx.strokeStyle = color || "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < fullWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      const base = i * step;
      for (let j = 0; j < step; j++) {
        const idx = base + j;
        if (idx >= data.length) break;
        const v = data[idx];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
  }, [audioBuffer, color, pixelsPerSecond]); // Redraw when the audioBuffer or color prop changes

  // const pct =
  //   lengthMs > 0 ? Math.max(0, Math.min(100, (ms / lengthMs) * 100)) : 0;

  // Use the same total timeline length for everything
  const maxMs = lengthMs || durationMs || 0;

  let playheadLeftPx = 0;
  if (maxMs > 0 && canvasWidth > 0) {
    // Single source of truth: world position on the canvas.
    playheadLeftPx = (ms / maxMs) * canvasWidth;

    // Optional: clamp to canvas bounds so the line never renders off-canvas.
    if (playheadLeftPx < 0) playheadLeftPx = 0;
    if (playheadLeftPx > canvasWidth) playheadLeftPx = canvasWidth;
  }

  // Scrub helpers
  const msAtClientX = (clientX) => {
    const el = containerRef.current; // the scrollable waveform container
    if (!el || !canvasWidth) return;

    const maxMs = lengthMs || durationMs;
    if (!maxMs) return;

    const rect = el.getBoundingClientRect();

    // X within the visible area of the container
    const rel = Math.max(0, Math.min(rect.width, clientX - rect.left));

    // Map visible X + scroll offset → absolute X on the full canvas
    const xOnCanvas = rel + el.scrollLeft;

    const p = xOnCanvas / canvasWidth;
    const target = p * maxMs;

    return Math.max(0, Math.min(maxMs, target));
  };

  // Scrubbing handlers
  const onMouseDown = (e) => {
    if (e.button !== 0) return; // left button only
    draggingRef.current = true;
    progressStore.beginScrub();
    const target = msAtClientX(e.clientX);
    if (typeof target === "number") {
      // preview only: move the playhead visually without seeking audio
      progressStore.setMs(target); // visual move
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
      progressStore.requestSeek(target); // commit seek to engine
    }
    progressStore.endScrub();
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const onWheel = (e) => {
    const el = containerRef.current;
    if (!el) return;

    // Use whichever axis has the stronger signal so normal mouse wheels work
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    if (delta === 0) return;

    e.preventDefault(); // don't vertical-scroll the page
    el.scrollLeft += delta;
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
      ref={containerRef}
      className="waveform-container"
      onWheel={onWheel} // wheel = scroll only
    >
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      <div
        className="waveform-progress"
        style={{left: `${playheadLeftPx}px`}}
      />
    </div>
  );
};

export default Waveform;
