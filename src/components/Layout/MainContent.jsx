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
  const DEFAULT_WINDOW_MS = 60_000; // 60 seconds

  const [timelineContentWidth, setTimelineContentWidth] = useState();

  useEffect(() => {
    const compute = () => {
      try {
        const tl = document.querySelector('.tracklane-timeline');
        if (!tl) return;
        // Viewport width for the timeline area (use parent of timeline which is the main column)
        const viewportEl = tl.parentElement || tl;
        const vp = viewportEl.getBoundingClientRect();
        const viewportWidth = Math.max(0, vp.width);
        const denom = DEFAULT_WINDOW_MS || 1;
        const pxPerMs = viewportWidth / denom;
        const targetMs = Math.max(DEFAULT_WINDOW_MS, totalLengthMs || 0);
        const contentWidth = Math.max(viewportWidth, Math.round(pxPerMs * targetMs));
        setTimelineContentWidth(contentWidth);
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
  }, [totalLengthMs]);

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
    </DraggableDiv>
  );
}

export default MainContent;