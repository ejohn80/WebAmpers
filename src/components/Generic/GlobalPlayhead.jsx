import React, {useEffect, useState} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * GlobalPlayhead
 * Renders a single vertical red bar spanning the tracks area, positioned by global ms.
 */
export default function GlobalPlayhead({totalLengthMs = 0}) {
  const [{ms, lengthMs}, setProgress] = useState(progressStore.getState());
  const [geom, setGeom] = useState({offsetPx: 0, widthPx: 0});

  useEffect(() => progressStore.subscribe(setProgress), []);

  useEffect(() => {
    const compute = () => {
      try {
        const main = document.querySelector('.maincontent');
        const tl = document.querySelector('.tracklane-timeline');
        if (!main || !tl) return;
        const mrect = main.getBoundingClientRect();
        const trect = tl.getBoundingClientRect();
        const offsetPx = Math.max(0, trect.left - mrect.left);
        const widthPx = Math.max(0, trect.width);
        setGeom({offsetPx, widthPx});
      } catch {}
    };

    compute();
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => compute());
    try {
      const main = document.querySelector('.maincontent');
      const tl = document.querySelector('.tracklane-timeline');
      if (main) ro.observe(main);
      if (tl) ro.observe(tl);
    } catch {}
    return () => {
      window.removeEventListener('resize', onResize);
      try { ro.disconnect(); } catch {}
    };
  }, []);

  const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;
  const p = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
  const leftPx = Math.round(geom.offsetPx + p * geom.widthPx);

  return <div className="global-playhead" style={{left: `${leftPx}px`}} />;
}
