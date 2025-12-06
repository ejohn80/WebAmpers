import React, {useEffect, useMemo, useRef} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * TimelineRuler
 * Draws a time ruler with tick marks aligned to the start of the waveform area.
 */
export default function TimelineRuler({
  totalLengthMs = 0,
  timelineWidth = 0,
  timelineLeftOffsetPx = 0,
  onScrubStart = null,
}) {
  const playheadMarkerRef = useRef(null);
  const {
    majorTicks,
    minorTicks,
    preMajorTicks,
    preMinorTicks,
    preHighlightWidthPx,
  } = useMemo(() => {
    const majors = [];
    const minors = [];
    const preMajors = [];
    const preMinors = [];
    let preHighlightWidthPx = 0;
    if (!totalLengthMs || timelineWidth <= 0) {
      return {
        majorTicks: majors,
        minorTicks: minors,
        preMajorTicks: preMajors,
        preMinorTicks: preMinors,
        preHighlightWidthPx,
      };
    }

    const totalSec = totalLengthMs / 1000;
    const pxPerSec = timelineWidth / totalSec;
    const pxPerMs = timelineWidth / totalLengthMs;

    // Choose a major tick step aiming for ~80px spacing
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const target = 80;
    let stepSec = candidates[0];
    for (const c of candidates) {
      if (pxPerSec * c >= target) {
        stepSec = c;
        break;
      }
      stepSec = c; // last candidate if none large enough
    }

    const stepMs = stepSec * 1000;
    // Build major ticks and remember their times
    const majorTimes = [];
    for (let t = 0; t <= totalLengthMs + 1; t += stepMs) {
      const p = t / totalLengthMs; // 0..1
      const left = Math.round(p * timelineWidth);
      majors.push({t, left});
      majorTimes.push(t);
    }

    // Decide how many minor subdivisions per major interval
    // Aim for ~20px spacing between minor ticks
    const majorPx = pxPerSec * stepSec; // px between majors (≈ target)
    const approxMinorCount = Math.max(2, Math.min(8, Math.round(majorPx / 20)));
    // Snap to a friendly divisor: prefer 4, then 5, else approx
    let subdivisions = 4;
    if (approxMinorCount === 5) subdivisions = 5;
    else if (approxMinorCount <= 3) subdivisions = 2;
    else if (approxMinorCount >= 6) subdivisions = 5; // keep density reasonable

    const minorStepMs = stepMs / subdivisions;
    for (let i = 0; i < majorTimes.length - 1; i++) {
      const start = majorTimes[i];
      for (let k = 1; k < subdivisions; k++) {
        const t = start + k * minorStepMs;
        if (t > totalLengthMs) break;
        const p = t / totalLengthMs;
        const left = Math.round(p * timelineWidth);
        minors.push({t, left});
      }
    }

    const preIntervals = 4;
    const negativeExtent = preIntervals * stepMs;
    preHighlightWidthPx = Math.max(0, Math.round(negativeExtent * pxPerMs));
    for (let t = -stepMs; Math.abs(t) <= negativeExtent; t -= stepMs) {
      const left = Math.round((t / totalLengthMs) * timelineWidth);
      preMajors.push({t, left});
    }

    for (let interval = 0; interval < preIntervals; interval++) {
      const base = interval * stepMs;
      for (let k = 1; k < subdivisions; k++) {
        const t = -(base + k * minorStepMs);
        if (Math.abs(t) > negativeExtent) break;
        const left = Math.round(t * pxPerMs);
        preMinors.push({t, left});
      }
    }

    return {
      majorTicks: majors,
      minorTicks: minors,
      preMajorTicks: preMajors,
      preMinorTicks: preMinors,
      preHighlightWidthPx,
    };
  }, [totalLengthMs, timelineWidth]);

  useEffect(() => {
    const node = playheadMarkerRef.current;
    if (!node || timelineWidth <= 0) return undefined;

    const updatePosition = ({ms, lengthMs}) => {
      const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;
      const p = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
      const leftPx = p * timelineWidth;
      node.style.transform = `translateX(${leftPx}px) translateX(-50%)`;
    };

    const initialState =
      typeof progressStore.getState === "function"
        ? progressStore.getState()
        : {ms: 0, lengthMs: totalLengthMs};
    updatePosition(initialState);
    const unsubscribe = progressStore.subscribe(updatePosition);
    return unsubscribe;
  }, [timelineWidth, totalLengthMs]);

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  };

  if (!totalLengthMs || timelineWidth <= 0) return null;

  const rulerStyle = {
    marginLeft: `${timelineLeftOffsetPx}px`,
    width: `${Math.max(0, Math.round(timelineWidth))}px`,
  };

  const startScrubFromMouse = (event) => {
    if (typeof onScrubStart !== "function") return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onScrubStart(event.clientX, "mouse");
  };

  const startScrubFromTouch = (event) => {
    if (typeof onScrubStart !== "function") return;
    if (!event.touches || event.touches.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    onScrubStart(event.touches[0].clientX, "touch");
  };

  return (
    <div
      className="timeline-ruler-bar"
      style={rulerStyle}
      onMouseDown={startScrubFromMouse}
      onTouchStart={startScrubFromTouch}
    >
      {preHighlightWidthPx > 0 && (
        <div
          className="timeline-pre-highlight"
          style={{
            width: `${preHighlightWidthPx}px`,
            left: `${-preHighlightWidthPx}px`,
          }}
        />
      )}
      {preMinorTicks.map(({t, left}) => (
        <div
          key={`pre-mi-${t}-${left}`}
          className="timeline-tick minor pre"
          style={{left: `${left}px`}}
        >
          <div className="timeline-tick-line" />
        </div>
      ))}
      {preMajorTicks.map(({t, left}) => (
        <div
          key={`pre-ma-${t}`}
          className="timeline-tick pre"
          style={{left: `${left}px`}}
        >
          <div className="timeline-tick-line" />
        </div>
      ))}
      {minorTicks.map(({t, left}) => (
        <div
          key={`mi-${t}-${left}`}
          className="timeline-tick minor"
          style={{left: `${left}px`}}
        >
          <div className="timeline-tick-line" />
        </div>
      ))}
      {majorTicks.map(({t, left}) => (
        <div
          key={`ma-${t}`}
          className="timeline-tick"
          style={{left: `${left}px`}}
        >
          <div className="timeline-tick-line" />
          <div className="timeline-tick-label">{fmt(t)}</div>
        </div>
      ))}
      <div
        ref={playheadMarkerRef}
        className="timeline-playhead-marker"
        aria-hidden="true"
      />
    </div>
  );
}
