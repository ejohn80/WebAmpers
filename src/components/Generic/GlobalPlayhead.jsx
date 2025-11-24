import React, {useEffect, useState} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * GlobalPlayhead
 * Renders a single vertical red bar spanning the tracks area, positioned by global ms.
 */
export default function GlobalPlayhead({totalLengthMs = 0, timelineWidth = 0}) {
  const [{ms, lengthMs}, setProgress] = useState(progressStore.getState());

  useEffect(() => progressStore.subscribe(setProgress), []);

  const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;
  const p = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
  const leftPx = Math.round(p * Math.max(0, timelineWidth));

  if (!timelineWidth) return null;

  return <div className="global-playhead" style={{left: `${leftPx}px`}} />;
}
