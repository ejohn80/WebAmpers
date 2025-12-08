import React, {useEffect, useRef} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * GlobalPlayhead
 * Renders a single vertical red bar spanning the tracks area.
 * Optimized: Uses direct DOM manipulation to avoid React render cycles during playback.
 */
export default function GlobalPlayhead({totalLengthMs = 0, timelineWidth = 0}) {
  const playheadRef = useRef(null); // Reference to the playhead DOM element

  useEffect(() => {
    // Update playhead position based on current playback time
    const updatePosition = (ms, lengthMs) => {
      if (!playheadRef.current) return;
      if (timelineWidth <= 0) return;

      // Calculate playback ratio (0 to 1)
      const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;
      const cappedRatio = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
      const leftPx = cappedRatio * timelineWidth;

      // Use transform for smooth, performant movement
      playheadRef.current.style.transform = `translate3d(${leftPx}px, 0, 0)`;
    };

    // Set initial position
    const currentState = progressStore.getState();
    updatePosition(currentState.ms || 0, currentState.lengthMs || 0);

    // Subscribe to progress updates (avoids React re-renders)
    const unsubscribe = progressStore.subscribe(({ms, lengthMs}) => {
      updatePosition(ms, lengthMs);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, [totalLengthMs, timelineWidth]); // Re-run when timeline dimensions change

  // Don't render if timeline width isn't set
  if (!timelineWidth) return null;

  // Initial style: left position handled by transform in effect
  return (
    <div
      ref={playheadRef}
      className="global-playhead"
      style={{left: 0, willChange: "transform"}} // willChange optimizes rendering
    />
  );
}
