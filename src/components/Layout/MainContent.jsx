import React, { useEffect, useState } from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import GlobalPlayhead from "../Generic/GlobalPlayhead";
import TimelineRuler from "./TimelineRuler";
import TrackLane from "../../components/TrackLane/TrackLane";
import "./MainContent.css";

/**
 * MainContent component for the application layout.
 * Displays all audio tracks or a placeholder message.
 * @param {object} props
 * @param {Array} props.tracks - Array of all audio tracks
 * @param {Function} props.onMute - Callback for mute toggle
 * @param {Function} props.onSolo - Callback for solo toggle
 * @param {Function} props.onDelete - Callback for track deletion
 * @param {number} props.totalLengthMs - Global timeline length in milliseconds for proportional sizing
 */
function MainContent({ tracks = [], onMute, onSolo, onDelete, totalLengthMs = 0 }) {
  // Default visible window length (in ms) before horizontal scrolling is needed
  // Timeline scale is driven by pixels-per-second instead of a fixed window length
  const BASE_PX_PER_SEC = 100; // default density: 100px per second at 100% zoom
  const MIN_ZOOM = 0.25; // 25% (zoom out)
  const MAX_ZOOM = 8;    // 800% (zoom in)
  const [zoom, setZoom] = useState(1);

  const [timelineContentWidth, setTimelineContentWidth] = useState();

  useEffect(() => {
    const compute = () => {
      try {
        const main = document.querySelector('.maincontent');
        const tl = document.querySelector('.tracklane-timeline');
        if (!main || !tl) return;
        const mrect = main.getBoundingClientRect();
        const trect = tl.getBoundingClientRect();
        const offsetPx = trect.left - mrect.left; // can be negative when scrolled right
        const viewportTimelineWidth = Math.max(0, Math.round(main.clientWidth - Math.max(0, offsetPx)));
        const pxPerMs = (BASE_PX_PER_SEC * (zoom || 1)) / 1000;
        const lengthMs = Math.max(0, totalLengthMs || 0);
        const desiredWidth = Math.round(pxPerMs * lengthMs);
  // Content width strictly follows desired width so zooming always adjusts overflow
  const contentWidth = Math.max(1, desiredWidth);
        setTimelineContentWidth(contentWidth);
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
      if (tl) ro.observe(tl);
      if (main) main.addEventListener('scroll', onScroll, { passive: true });
    } catch {}
    return () => {
      window.removeEventListener('resize', onResize);
      try {
        const main = document.querySelector('.maincontent');
        if (main) main.removeEventListener('scroll', onScroll);
      } catch {}
      try { ro.disconnect(); } catch {}
    };
  }, [totalLengthMs, zoom]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))));
  const resetZoom = () => setZoom(1);

  return (
    <DraggableDiv className="maincontent" style={timelineContentWidth ? {['--timeline-content-width']: `${timelineContentWidth}px`} : undefined}>
      <TimelineRuler totalLengthMs={totalLengthMs} />
      <div className="global-playhead-rail">
        <GlobalPlayhead totalLengthMs={totalLengthMs} />
      </div>
      {tracks && tracks.length > 0 ? (
        <div className="tracks-relative">
          <div className="tracks-container">
          {tracks.map((track, index) => (
            <div key={track.id} className="track-wrapper">
              <TrackLane
                track={track}
                trackIndex={index}
                totalTracks={tracks.length}
                showTitle={true}
                onMute={onMute}
                onSolo={onSolo}
                onDelete={onDelete}
                totalLengthMs={totalLengthMs}
              />
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h2>No Tracks Yet</h2>
          <p>Import an audio file or start recording to add tracks.</p>
        </div>
      )}
      <div className="zoom-controls-bar">
        <div className="zoom-controls" role="toolbar" aria-label="Timeline zoom controls">
          <button className="zoom-btn" onClick={zoomOut} title="Zoom out (−)">−</button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={zoomIn} title="Zoom in (+)">+</button>
          <button className="zoom-btn reset" onClick={resetZoom} title="Reset zoom">Reset</button>
        </div>
      </div>
    </DraggableDiv>
  );
}

export default MainContent;