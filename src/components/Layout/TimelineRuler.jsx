import React, {useEffect, useMemo, useState} from "react";

/**
 * TimelineRuler
 * Draws a time ruler with tick marks aligned to the start of the waveform area.
 */
export default function TimelineRuler({totalLengthMs = 0}) {
  const [geom, setGeom] = useState({offsetPx: 0, widthPx: 0});

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

  const {majorTicks, minorTicks} = useMemo(() => {
    const majors = [];
    const minors = [];
    if (!totalLengthMs || geom.widthPx <= 0) return {majorTicks: majors, minorTicks: minors};

    const totalSec = totalLengthMs / 1000;
    const pxPerSec = geom.widthPx / totalSec;

    // Choose a major tick step aiming for ~80px spacing
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const target = 80;
    let stepSec = candidates[0];
    for (const c of candidates) {
      if (pxPerSec * c >= target) { stepSec = c; break; }
      stepSec = c; // last candidate if none large enough
    }

    const stepMs = stepSec * 1000;
    // Build major ticks and remember their times
    const majorTimes = [];
    for (let t = 0; t <= totalLengthMs + 1; t += stepMs) {
      const p = t / totalLengthMs; // 0..1
      const left = Math.round(geom.offsetPx + p * geom.widthPx);
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
      const end = majorTimes[i + 1];
      for (let k = 1; k < subdivisions; k++) {
        const t = start + k * minorStepMs;
        if (t > totalLengthMs) break;
        const p = t / totalLengthMs;
        const left = Math.round(geom.offsetPx + p * geom.widthPx);
        minors.push({t, left});
      }
    }

    return {majorTicks: majors, minorTicks: minors};
  }, [totalLengthMs, geom]);

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
  };

  if (!totalLengthMs || geom.widthPx <= 0) return null;

  return (
    <div className="timeline-ruler-bar">
      {minorTicks.map(({t, left}) => (
        <div key={`mi-${t}-${left}`} className="timeline-tick minor" style={{left}}>
          <div className="timeline-tick-line" />
        </div>
      ))}
      {majorTicks.map(({t, left}) => (
        <div key={`ma-${t}`} className="timeline-tick" style={{left}}>
          <div className="timeline-tick-line" />
          <div className="timeline-tick-label">{fmt(t)}</div>
        </div>
      ))}
    </div>
  );
}
