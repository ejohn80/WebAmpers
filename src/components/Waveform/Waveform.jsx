import React, {useRef, useEffect, useState, useMemo} from "react";
import "./Waveform.css";
import {progressStore} from "../../playback/progressStore";

const MAX_TILE_CSS_PX = 4096; // keep each canvas safely under browser limits

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
  const containerRef = useRef(null);
  const canvasRefs = useRef([]);
  const draggingRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({width: 0, height: 0});

  // Track container resize so we can redraw with accurate resolution when zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(container);
      return () => observer.disconnect();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    return undefined;
  }, []);

  const tiles = useMemo(() => {
    const totalWidth = canvasSize.width || 0;
    if (!totalWidth) return [];

    const chunks = [];
    let offset = 0;
    while (offset < totalWidth) {
      const cssWidth = Math.min(MAX_TILE_CSS_PX, totalWidth - offset);
      const startRatio = totalWidth > 0 ? offset / totalWidth : 0;
      const endRatio = totalWidth > 0 ? (offset + cssWidth) / totalWidth : 1;
      chunks.push({cssWidth, startRatio, endRatio});
      offset += cssWidth;
    }
    return chunks;
  }, [canvasSize.width]);

  useEffect(() => {
    canvasRefs.current = canvasRefs.current.slice(0, tiles.length);
  }, [tiles.length]);

  useEffect(() => {
    if (!audioBuffer) return;
    if (!canvasSize.width || !canvasSize.height) return;
    if (!tiles.length) return;

    const dpr =
      typeof window !== "undefined" && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1;
    const cssHeight = canvasSize.height;

    // 🔧 Unwrap Tone.ToneAudioBuffer -> native AudioBuffer robustly
    let native = null;
    if (audioBuffer instanceof AudioBuffer) {
      native = audioBuffer;
    } else if (audioBuffer && audioBuffer._buffer instanceof AudioBuffer) {
      native = audioBuffer._buffer; // ToneAudioBuffer internal
    } else if (audioBuffer && typeof audioBuffer.get === "function") {
      native = null;
    }

    if (!native) return; // still nothing to draw

    const data = native.getChannelData(0);
    const totalSamples = data.length;

    tiles.forEach((tile, index) => {
      const canvas = canvasRefs.current[index];
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cssWidth = tile.cssWidth;
      const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
      const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const startSample = Math.floor(tile.startRatio * totalSamples);
      const endSample = Math.floor(tile.endRatio * totalSamples);
      const sliceLength = Math.max(1, endSample - startSample);
      const visibleWidth = Math.max(1, Math.round(cssWidth));
      const step = Math.max(1, Math.floor(sliceLength / visibleWidth));
      const amp = cssHeight / 2;

      ctx.strokeStyle = color || "#ffffff";
      ctx.lineWidth = dpr >= 2 ? 0.75 : 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      for (let i = 0; i < visibleWidth; i++) {
        let min = 1.0;
        let max = -1.0;

        const base = startSample + i * step;
        for (let j = 0; j < step; j++) {
          const idx = base + j;
          if (idx >= endSample) break;
          const v = data[idx];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const x = i + 0.5; // center lines on pixel for crispness
        ctx.moveTo(x, (1 + min) * amp);
        ctx.lineTo(x, (1 + max) * amp);
      }
      ctx.stroke();
    });
  }, [audioBuffer, canvasSize.height, canvasSize.width, color, tiles]);

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
    const el = containerRef.current; // container div
    if (!el) return;
    const rect = el.getBoundingClientRect();

    // X within the visible area of the container
    const rel = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const p = rect.width > 0 ? rel / rect.width : 0;
    // If segment timing provided, map within this segment; else map across global length
    if (durationMs && durationMs > 0) {
      return (startOnTimelineMs || 0) + p * durationMs;
    }
    if (!lengthMs) return;
    return p * lengthMs;
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
    const timelineScroll = containerRef.current?.closest(
      ".timeline-scroll-area"
    );
    if (!timelineScroll) return;

    // Use whichever axis has the stronger signal so normal mouse wheels work
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    if (delta === 0) return;

    e.preventDefault(); // don't vertical-scroll the page
    timelineScroll.scrollLeft += delta;
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
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="waveform-tiles">
        {tiles.map((tile, index) => (
          <canvas
            key={`waveform-tile-${index}`}
            ref={(node) => {
              canvasRefs.current[index] = node;
            }}
            className="waveform-canvas"
            style={{width: `${tile.cssWidth}px`}}
          />
        ))}
      </div>
      {showProgress && (
        <div className="waveform-progress" style={{left: `${pct}%`}} />
      )}
    </div>
  );
};

export default Waveform;
