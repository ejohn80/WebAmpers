import React, {useEffect, useState} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * GlobalPlayhead
 * Renders a single vertical red bar spanning the tracks area, positioned by global ms.
 */
export default function GlobalPlayhead({totalLengthMs = 0}) {
  const [{ms, lengthMs}, setProgress] = useState(progressStore.getState());
  const [geom, setGeom] = useState({offsetPx: 0, widthPx: 0, viewportWidth: 0});

  useEffect(() => progressStore.subscribe(setProgress), []);

  useEffect(() => {
    let observedTl = null;

    const compute = () => {
      try {
        const main = document.querySelector('.maincontent');
        const tl = document.querySelector('.tracklane-timeline');
        if (!main || !tl) return;
  const mrect = main.getBoundingClientRect();
        const trect = tl.getBoundingClientRect();
  const offsetPx = (trect.left - mrect.left); // allow negative when scrolled right
        const widthPx = Math.max(0, trect.width);
  const viewportWidth = Math.max(0, main.clientWidth);
  setGeom({offsetPx, widthPx, viewportWidth});
      } catch {}
    };

    compute();
  const onResize = () => compute();
  const onScroll = () => compute();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => compute());
    try {
      const main = document.querySelector('.maincontent');
      const tl = document.querySelector('.tracklane-timeline');
  if (main) ro.observe(main);
      if (tl) { ro.observe(tl); observedTl = tl; }
  if (main) main.addEventListener('scroll', onScroll, { passive: true });

      // Watch for the timeline element appearing/changing
      const mo = new MutationObserver(() => {
        const nextTl = document.querySelector('.tracklane-timeline');
        if (nextTl && nextTl !== observedTl) {
          try { if (observedTl) ro.unobserve(observedTl); } catch {}
          try { ro.observe(nextTl); observedTl = nextTl; } catch {}
        }
        compute();
      });
      mo.observe(main || document.body, { childList: true, subtree: true, attributes: true });
      // Stash on window for cleanup access
      window.__globalPlayheadMO = mo;
    } catch {}
    return () => {
      window.removeEventListener('resize', onResize);
      try {
        const main = document.querySelector('.maincontent');
        if (main) main.removeEventListener('scroll', onScroll);
      } catch {}
      try { ro.disconnect(); } catch {}
      try { window.__globalPlayheadMO && window.__globalPlayheadMO.disconnect(); } catch {}
    };
  }, []);

  const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;
  const p = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
  const leftPx = Math.round(geom.offsetPx + p * geom.widthPx);
  const visibleLeft = 0; // left edge of maincontent viewport
  const visibleRight = geom.viewportWidth; // right edge of maincontent viewport
  const isVisible = leftPx >= visibleLeft && leftPx <= visibleRight;

  return <div className="global-playhead" style={{left: `${leftPx}px`, visibility: isVisible ? 'visible' : 'hidden'}} />;
}
