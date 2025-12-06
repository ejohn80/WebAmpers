import React, {useEffect, useRef} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * GlobalPlayhead
 * Renders a single vertical red bar spanning the tracks area.
 * Optimized: Uses direct DOM manipulation to avoid React render cycles during playback.
 */
export default function GlobalPlayhead({totalLengthMs = 0, timelineWidth = 0}) {
  const playheadRef = useRef(null);

  useEffect(() => {
    // Subscribe to the store without triggering React state updates
    const unsubscribe = progressStore.subscribe(({ms, lengthMs}) => {
      if (!playheadRef.current) return;
      if (timelineWidth <= 0) return;

      const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;

      // Calculate position
      const p = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
  const leftPx = p * timelineWidth;
  const centeringOffsetPx = -0.5; // keep 1px line centered beneath the triangle marker
  playheadRef.current.style.transform = `translate3d(${leftPx + centeringOffsetPx}px, 0, 0)`;
    });

    return unsubscribe;
  }, [totalLengthMs, timelineWidth]);

  if (!timelineWidth) return null;

  // Initial style sets left to 0, movement is handled by transform in the effect
  return (
    <div
      ref={playheadRef}
      className="global-playhead"
      style={{left: 0, willChange: "transform"}}
    />
  );
}
