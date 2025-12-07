import React, {useRef, useEffect, useState, useCallback} from "react";
import "./Waveform.css";
import {progressStore} from "../../playback/progressStore";

const MIN_POINTS = 512;
const MAX_POINTS = 20000;
const DEFAULT_POINTS = 4000;
const VIEWBOX_HEIGHT = 100;

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const isAudioBuffer = (value) =>
  typeof AudioBuffer !== "undefined" && value instanceof AudioBuffer;

const unwrapAudioBuffer = (candidate) => {
  if (!candidate) return null;
  if (isAudioBuffer(candidate)) return candidate;
  if (candidate._buffer && isAudioBuffer(candidate._buffer)) {
    return candidate._buffer;
  }
  if (candidate.buffer && isAudioBuffer(candidate.buffer)) {
    return candidate.buffer;
  }
  return null;
};

const computePeaks = (
  audioBuffer,
  targetPoints,
  startSample = 0,
  endSample = null
) => {
  if (!audioBuffer) return [];
  const totalLength = audioBuffer.length ?? 0;
  if (!totalLength || !audioBuffer.numberOfChannels) return [];

  const safeStart = Math.max(0, Math.min(startSample || 0, totalLength));
  const safeEnd = Math.max(
    safeStart + 1,
    Math.min(endSample ?? totalLength, totalLength)
  );
  const regionLength = safeEnd - safeStart;
  if (!regionLength) return [];

  const points = clamp(
    targetPoints,
    MIN_POINTS,
    Math.min(MAX_POINTS, regionLength)
  );

  const channelData = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    try {
      channelData.push(audioBuffer.getChannelData(ch));
    } catch (err) {
      console.warn("Waveform: unable to read channel data", err);
      break;
    }
  }
  if (!channelData.length) return [];

  const peaks = new Array(points);
  for (let point = 0; point < points; point++) {
    const start = safeStart + Math.floor((point / points) * regionLength);
    const end =
      point === points - 1
        ? safeEnd
        : safeStart + Math.floor(((point + 1) / points) * regionLength);

    let min = 1.0;
    let max = -1.0;

    if (start >= safeEnd) {
      peaks[point] = {min: 0, max: 0};
      continue;
    }

    const boundedEnd = Math.max(start + 1, Math.min(end, safeEnd));
    for (let sampleIdx = start; sampleIdx < boundedEnd; sampleIdx++) {
      for (let ch = 0; ch < channelData.length; ch++) {
        const sample = channelData[ch][sampleIdx] ?? 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
    }

    if (min === 1.0) min = 0;
    if (max === -1.0) max = 0;
    peaks[point] = {min, max};
  }

  return peaks;
};

const buildWavePath = (peaks) => {
  if (!peaks.length) return {d: "", width: 0};
  const mid = VIEWBOX_HEIGHT / 2;
  const amp = VIEWBOX_HEIGHT / 2;
  const sanitize = (value) => (Number.isFinite(value) ? value : 0);
  const toY = (value) => mid - sanitize(value) * amp;

  const topCommands = [];
  const bottomCommands = [];
  for (let i = 0; i < peaks.length; i++) {
    const x = i;
    const upper = toY(peaks[i].max);
    topCommands.push([x, upper]);
  }

  for (let i = peaks.length - 1; i >= 0; i--) {
    const x = i;
    const lower = toY(peaks[i].min);
    bottomCommands.push([x, lower]);
  }

  const firstPoint = topCommands[0] ?? [0, mid];
  const d = [
    `M ${firstPoint[0]} ${firstPoint[1]}`,
    ...topCommands.slice(1).map(([x, y]) => `L ${x} ${y}`),
    ...bottomCommands.map(([x, y]) => `L ${x} ${y}`),
    "Z",
  ].join(" ");

  return {d, width: Math.max(1, peaks.length - 1)};
};

/**
 * Renders an audio buffer waveform using a scalable SVG path so very long tracks
 * don't exceed browser canvas limits.
 */
const Waveform = ({
  audioBuffer,
  color = "#ffffff",
  startOnTimelineMs = 0,
  durationMs = null,
  startInFileMs = 0,
  showProgress = true,
  interactive = true,
}) => {
  const containerRef = useRef(null);
  const draggingRef = useRef(false);
  const liveSeekFrameRef = useRef(null);
  const liveSeekValueRef = useRef(null);
  const [resolutionHint, setResolutionHint] = useState(DEFAULT_POINTS);
  const [wavePath, setWavePath] = useState({d: "", width: 0});
  const [{ms, lengthMs}, setProgress] = useState(progressStore.getState());

  const isScrubLocked = useCallback(() => {
    return typeof progressStore.isScrubLocked === "function"
      ? progressStore.isScrubLocked()
      : false;
  }, []);

  useEffect(() => {
    return progressStore.subscribe(setProgress);
  }, []);

  const cancelLiveSeek = useCallback(() => {
    if (typeof window !== "undefined" && liveSeekFrameRef.current !== null) {
      window.cancelAnimationFrame(liveSeekFrameRef.current);
    }
    liveSeekFrameRef.current = null;
    liveSeekValueRef.current = null;
  }, []);

  const flushLiveSeek = useCallback(() => {
    if (typeof window !== "undefined" && liveSeekFrameRef.current !== null) {
      window.cancelAnimationFrame(liveSeekFrameRef.current);
    }
    liveSeekFrameRef.current = null;
    const pending = liveSeekValueRef.current;
    liveSeekValueRef.current = null;
    if (typeof pending === "number") {
      progressStore.requestSeek(pending);
    }
  }, []);

  const scheduleLiveSeek = useCallback(
    (target) => {
      if (typeof target !== "number") return;
      liveSeekValueRef.current = target;
      if (
        typeof window === "undefined" ||
        typeof window.requestAnimationFrame !== "function"
      ) {
        flushLiveSeek();
        return;
      }
      if (liveSeekFrameRef.current !== null) return;
      liveSeekFrameRef.current = window.requestAnimationFrame(() => {
        liveSeekFrameRef.current = null;
        const pending = liveSeekValueRef.current;
        liveSeekValueRef.current = null;
        if (typeof pending === "number") {
          progressStore.requestSeek(pending);
        }
      });
    },
    [flushLiveSeek]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateResolution = () => {
      const rect = container.getBoundingClientRect();
      const width = rect?.width ?? 0;
      if (!width) return;
      const next = clamp(Math.round(width), MIN_POINTS, MAX_POINTS);
      setResolutionHint((prev) => (prev === next ? prev : next));
    };

    updateResolution();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateResolution);
      observer.observe(container);
      return () => observer.disconnect();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateResolution);
      return () => window.removeEventListener("resize", updateResolution);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const native = unwrapAudioBuffer(audioBuffer);
    if (!native) {
      setWavePath({d: "", width: 0});
      return () => {
        cancelled = true;
      };
    }

    const targetPoints = clamp(
      Math.round(resolutionHint || DEFAULT_POINTS),
      MIN_POINTS,
      MAX_POINTS
    );

    // Decide which part of the buffer to visualize
    const sampleRate = native.sampleRate || 44100;
    let regionStartSample = 0;
    let regionEndSample = native.length ?? 0;

    if (durationMs && durationMs > 0) {
      const startSec = (startInFileMs || 0) / 1000;
      const durSec = durationMs / 1000;
      regionStartSample = Math.max(
        0,
        Math.min(Math.floor(startSec * sampleRate), native.length ?? 0)
      );
      const regionLenSamples = Math.max(1, Math.floor(durSec * sampleRate));
      regionEndSample = Math.max(
        regionStartSample + 1,
        Math.min(regionStartSample + regionLenSamples, native.length ?? 0)
      );
    }

    const compute = () => {
      if (cancelled) return;
      const peaks = computePeaks(
        native,
        targetPoints,
        regionStartSample,
        regionEndSample
      );
      const nextPath = buildWavePath(peaks);
      if (!cancelled) {
        setWavePath(nextPath);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(compute, {timeout: 200});
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }

    compute();
    return () => {
      cancelled = true;
    };
  }, [audioBuffer, resolutionHint, durationMs, startInFileMs]);

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
  const msAtClientX = useCallback(
    (clientX) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const visibleWidth = rect?.width ?? 0;
      if (!visibleWidth) return;

      const rel = clamp(clientX - rect.left, 0, visibleWidth);
      const scrollLeft = el.scrollLeft ?? 0;
      const scrollWidth = el.scrollWidth ?? visibleWidth;
      const totalWidth = Math.max(scrollWidth, 1);
      const absolute = Math.max(0, Math.min(totalWidth, scrollLeft + rel));
      const p = absolute / totalWidth;
      if (durationMs && durationMs > 0) {
        return (startOnTimelineMs || 0) + p * durationMs;
      }
      if (!lengthMs) return;
      return p * lengthMs;
    },
    [durationMs, startOnTimelineMs, lengthMs]
  );

  // Scrubbing handlers
  const onMouseMove = useCallback(
    (e) => {
      if (!draggingRef.current) return;
      if (isScrubLocked()) return;
      const target = msAtClientX(e.clientX);
      if (typeof target === "number") {
        progressStore.setMs(target);
        scheduleLiveSeek(target);
      }
    },
    [isScrubLocked, msAtClientX, scheduleLiveSeek]
  );

  const onMouseUp = useCallback(
    (e) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      cancelLiveSeek();
      const target = msAtClientX(e.clientX);
      if (!isScrubLocked()) {
        if (typeof target === "number") {
          progressStore.requestSeek(target);
        }
        progressStore.endScrub();
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
    },
    [cancelLiveSeek, isScrubLocked, msAtClientX, onMouseMove]
  );

  const onMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return; // left button only
      if (!interactive || isScrubLocked()) return;
      draggingRef.current = true;
      progressStore.beginScrub({
        pauseTransport: true,
        silenceDuringScrub: false,
      });
      const target = msAtClientX(e.clientX);
      if (typeof target === "number") {
        progressStore.setMs(target);
        scheduleLiveSeek(target);
      }
      if (typeof window !== "undefined") {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      }
    },
    [
      interactive,
      isScrubLocked,
      msAtClientX,
      scheduleLiveSeek,
      onMouseMove,
      onMouseUp,
    ]
  );

  const onWheel = (e) => {
    const el = containerRef.current;
    if (!el) return;

    // Use whichever axis has the stronger signal so normal mouse wheels work
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    if (delta === 0) return;

    el.scrollLeft += delta;
  };

  useEffect(
    () => () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
      cancelLiveSeek();
    },
    [onMouseMove, onMouseUp, cancelLiveSeek]
  );

  // Touch support
  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    if (!interactive || isScrubLocked()) return;
    draggingRef.current = true;
    progressStore.beginScrub({
      pauseTransport: true,
      silenceDuringScrub: false,
    });
    const target = msAtClientX(e.touches[0].clientX);
    if (typeof target === "number") {
      progressStore.setMs(target);
      scheduleLiveSeek(target);
    }
  };

  const onTouchMove = (e) => {
    if (!draggingRef.current || !e.touches || e.touches.length === 0) return;
    if (isScrubLocked()) return;
    const target = msAtClientX(e.touches[0].clientX);
    if (typeof target === "number") {
      progressStore.setMs(target);
      scheduleLiveSeek(target);
    }
  };

  const onTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    cancelLiveSeek();
    // finalize at current playhead; engine will have been paused
    if (!isScrubLocked()) {
      const {ms: current} = progressStore.getState();
      progressStore.requestSeek(current);
      progressStore.endScrub();
    }
  };

  return (
    <div
      ref={containerRef}
      className="waveform-container"
      onMouseDown={interactive ? onMouseDown : undefined}
      onTouchStart={interactive ? onTouchStart : undefined}
      onTouchMove={interactive ? onTouchMove : undefined}
      onTouchEnd={interactive ? onTouchEnd : undefined}
      onWheel={interactive ? onWheel : undefined}
    >
      {wavePath.d ? (
        <svg
          className="waveform-svg"
          viewBox={`0 0 ${wavePath.width || 1} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          style={{color}}
        >
          <path className="waveform-shape" d={wavePath.d} />
        </svg>
      ) : (
        <div className="waveform-placeholder">Generating waveform…</div>
      )}
      {showProgress && (
        <div className="waveform-progress" style={{left: `${pct}%`}} />
      )}
    </div>
  );
};

export default Waveform;
