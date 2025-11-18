import React, { useEffect, useMemo, useState } from "react";
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
const TRACK_CONTROLS_WIDTH = 180;
const TRACK_CONTROLS_GAP = 12;

function MainContent({ tracks = [], onMute, onSolo, onDelete, totalLengthMs = 0 }) {
  // Default visible window length (in ms) before horizontal scrolling is needed
  // Timeline scale is driven by pixels-per-second instead of a fixed window length
  const BASE_PX_PER_SEC = 100; // default density: 100px per second at 100% zoom
  const MIN_ZOOM = 0.25; // 25% (zoom out)
  const MAX_ZOOM = 8;    // 800% (zoom in)
  const [zoom, setZoom] = useState(1);

  const [timelineContentWidth, setTimelineContentWidth] = useState(0);

  useEffect(() => {
    const lengthMs = Math.max(1, totalLengthMs || 0);
    const pxPerMs = (BASE_PX_PER_SEC * (zoom || 1)) / 1000;
    const desiredWidth = Math.max(1, Math.round(pxPerMs * lengthMs));
    setTimelineContentWidth(desiredWidth);
  }, [totalLengthMs, zoom]);

  const verticalScale = useMemo(() => (
    Math.min(2.25, Math.max(0.6, Math.pow(Math.max(zoom, 0.01), 0.5)))
  ), [zoom]);

  const timelineStyle = useMemo(() => ({
    "--timeline-content-width": `${Math.max(1, timelineContentWidth)}px`,
    "--track-height": `${Math.round(96 * verticalScale)}px`
  }), [timelineContentWidth, verticalScale]);

  const timelineMetrics = useMemo(() => {
    const widthPx = Math.max(1, Math.round(timelineContentWidth));
    const leftOffsetPx = TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;
    const rowWidthPx = widthPx + leftOffsetPx;
    return { widthPx, leftOffsetPx, rowWidthPx };
  }, [timelineContentWidth]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))));
  const resetZoom = () => setZoom(1);

  return (
    <DraggableDiv className="maincontent" style={timelineStyle}>
      <div className="timeline-scroll-area">
        <TimelineRuler
          totalLengthMs={totalLengthMs}
          timelineWidth={timelineMetrics.widthPx}
          timelineLeftOffsetPx={timelineMetrics.leftOffsetPx}
        />
        <div
          className="timeline-scroll-content"
          style={{
            minWidth: `${timelineMetrics.rowWidthPx}px`,
            width: `${timelineMetrics.rowWidthPx}px`
          }}
        >
          <div
            className="global-playhead-rail"
            style={{
              left: `${timelineMetrics.leftOffsetPx}px`,
              width: `${timelineMetrics.widthPx}px`
            }}
          >
            <GlobalPlayhead
              totalLengthMs={totalLengthMs}
              timelineWidth={timelineMetrics.widthPx}
            />
          </div>
          {tracks && tracks.length > 0 ? (
            <div
              className="tracks-relative"
              style={{ width: `${timelineMetrics.rowWidthPx}px` }}
            >
              <div
                className="tracks-container"
                style={{ width: `${timelineMetrics.rowWidthPx}px` }}
              >
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
                      timelineWidth={timelineMetrics.widthPx}
                      rowWidthPx={timelineMetrics.rowWidthPx}
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
        </div>
      </div>
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