import React, {useEffect, useMemo, useRef, useState, useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import GlobalPlayhead from "../Generic/GlobalPlayhead";
import TimelineRuler from "./TimelineRuler";
import TrackLane from "../../components/TrackLane/TrackLane";
import {progressStore} from "../../playback/progressStore";
import {AppContext} from "../../context/AppContext";
import EffectsMenu from "./Effects/EffectsMenu";
import styles from "./MainContent.module.css";
import "./MainContent.css";

/**
 * MainContent component for the application layout.
 * Displays all audio tracks or a placeholder message.
 * @param {object} props
 * @param {Array} props.tracks - Array of all audio tracks
 * @param {Function} props.onMute - Callback for mute toggle
 * @param {Function} props.onSolo - Callback for solo toggle
 * @param {Function} props.onDelete - Callback for track deletion
 * @param {Function} props.onAssetDrop - Callback for dropping an asset to create a track
 * @param {number} props.totalLengthMs - Global timeline length in milliseconds for proportional sizing
 */
const TRACK_CONTROLS_WIDTH = 180;
const TRACK_CONTROLS_GAP = 12;
const TRACK_HEIGHT_PX = 96;
const BASE_PX_PER_SEC = 120;
const MIN_ZOOM_STEP = -4; // 1/16x
const MAX_ZOOM_STEP = 8; // 256x

function MainContent({
  tracks = [],
  onMute,
  onSolo,
  onDelete,
  onAssetDrop,
  onAssetDrop,
  totalLengthMs = 0,
}) {
  const {isEffectsMenuOpen} = useContext(AppContext);

  // Exponential zoom lets us reach detailed waveform views quickly
  const [zoomStep, setZoomStep] = useState(0); // 0 => 1x, ±n => 2^n scale
  const zoomScale = useMemo(() => Math.pow(2, zoomStep), [zoomStep]);
  const pxPerMs = useMemo(
    () => (BASE_PX_PER_SEC * zoomScale) / 1000,
    [zoomScale]
  );

  // Follow-mode toggle to auto-scroll the timeline during playback
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [progressMs, setProgressMs] = useState(
    progressStore.getState().ms || 0
  );
  const [timelineContentWidth, setTimelineContentWidth] = useState(0);
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);
  const scrollAreaRef = useRef(null);
  const prevTimelineWidthRef = useRef(0);

  useEffect(() => {
    const lengthMs = Math.max(1, totalLengthMs || 0);
    const desiredWidth = Math.max(1, Math.round(pxPerMs * lengthMs));
    setTimelineContentWidth(desiredWidth);
  }, [pxPerMs, totalLengthMs]);

  useEffect(() => {
    const node = scrollAreaRef.current;
    if (!node) return;

    const updateWidth = () => {
      setScrollAreaWidth(node.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(node);
      return () => observer.disconnect();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    return undefined;
  }, []);

  useEffect(() => {
    const node = scrollAreaRef.current;
    if (!node) {
      prevTimelineWidthRef.current = timelineContentWidth;
      return;
    }

    const prevWidth = prevTimelineWidthRef.current || 0;
    const nextWidth = timelineContentWidth;
    if (prevWidth === nextWidth) return;

    const viewportWidth = node.clientWidth || 0;
    const prevScrollable = Math.max(0, prevWidth - viewportWidth);
    const ratio = prevScrollable > 0 ? node.scrollLeft / prevScrollable : 0;

    const nextScrollable = Math.max(0, nextWidth - viewportWidth);
    node.scrollLeft = ratio * nextScrollable;

    prevTimelineWidthRef.current = nextWidth;
  }, [timelineContentWidth]);

  useEffect(
    // Track global playhead position for follow mode
    () => progressStore.subscribe(({ms}) => setProgressMs(ms || 0)),
    []
  );

  const timelineStyle = useMemo(
    () => ({
      "--timeline-content-width": `${Math.max(1, timelineContentWidth)}px`,
      "--track-height": `${TRACK_HEIGHT_PX}px`,
    }),
    [timelineContentWidth]
  );

  const timelineMetrics = useMemo(() => {
    const leftOffsetPx = TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;
    const minimumTimelineWidth = Math.max(
      1,
      Math.round(scrollAreaWidth - leftOffsetPx)
    );
    const widthPx = Math.max(
      1,
      Math.round(timelineContentWidth),
      minimumTimelineWidth
    );
    const rowWidthPx = widthPx + leftOffsetPx;
    return {widthPx, leftOffsetPx, rowWidthPx};
  }, [timelineContentWidth, scrollAreaWidth]);

  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  const zoomIn = () => setZoomStep((z) => Math.min(MAX_ZOOM_STEP, z + 1));
  const zoomOut = () => setZoomStep((z) => Math.max(MIN_ZOOM_STEP, z - 1));
  const resetZoom = () => setZoomStep(0);
  const toggleFollow = () => setFollowPlayhead((v) => !v);

  // Handle asset drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const data = e.dataTransfer.getData("application/json");
      if (!data) return;

      const dropData = JSON.parse(data);
      if (dropData.type === "asset" && onAssetDrop) {
        onAssetDrop(dropData.assetId);
      }
    } catch (err) {
      console.error("Error handling drop:", err);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  // Auto-scroll to keep the red playhead centered when follow mode is on
  useEffect(() => {
    if (!followPlayhead) return;
    const node = scrollAreaRef.current;
    if (!node) return;

    const lengthMs = Math.max(0, totalLengthMs || 0);
    if (lengthMs === 0 || timelineMetrics.widthPx === 0) return;

    const pxPerMs = timelineMetrics.widthPx / lengthMs;
    const playheadX =
      timelineMetrics.leftOffsetPx +
      Math.max(0, Math.min(progressMs, lengthMs)) * pxPerMs;

    const viewportWidth = node.clientWidth || 0;
    if (viewportWidth === 0) return;

    const desiredScroll = playheadX - viewportWidth / 2;
    const maxScroll = Math.max(0, timelineMetrics.rowWidthPx - viewportWidth);
    const nextScroll = Math.min(Math.max(0, desiredScroll), maxScroll);

    if (Number.isFinite(nextScroll)) {
      node.scrollLeft = nextScroll;
    }
  }, [
    followPlayhead,
    progressMs,
    totalLengthMs,
    timelineMetrics.leftOffsetPx,
    timelineMetrics.rowWidthPx,
    timelineMetrics.widthPx,
  ]);

  return (
    <DraggableDiv
      className={`maincontent ${isEffectsMenuOpen ? styles.blurred : ""}`}
      style={timelineStyle}
      disableSectionPadding
    >
      {/* Effects Menu */}
      {isEffectsMenuOpen && (
        <div className={styles.effectsMenuContainer}>
          <EffectsMenu />
        </div>
      )}

      <div
        className="timeline-scroll-area"
        ref={scrollAreaRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {hasTracks ? (
          <>
            <TimelineRuler
              totalLengthMs={totalLengthMs}
              timelineWidth={timelineMetrics.widthPx}
              timelineLeftOffsetPx={timelineMetrics.leftOffsetPx}
            />
            <div
              className="timeline-scroll-content"
              style={{
                minWidth: `${timelineMetrics.rowWidthPx}px`,
                width: `${timelineMetrics.rowWidthPx}px`,
              }}
            >
              <div
                className="global-playhead-rail"
                style={{
                  left: `${timelineMetrics.leftOffsetPx}px`,
                  width: `${timelineMetrics.widthPx}px`,
                }}
              >
                <GlobalPlayhead
                  totalLengthMs={totalLengthMs}
                  timelineWidth={timelineMetrics.widthPx}
                />
              </div>
              <div
                className="tracks-relative"
                style={{width: `${timelineMetrics.rowWidthPx}px`}}
              >
                <div
                  className="tracks-container"
                  style={{width: `${timelineMetrics.rowWidthPx}px`}}
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
            </div>
          </>
        ) : (
          <div className="empty-state" role="status" aria-live="polite">
            Import an audio file
          </div>
        )}
      </div>
      <div className="zoom-controls-bar">
        <div
          className="zoom-controls"
          role="toolbar"
          aria-label="Timeline zoom controls"
        >
          <button className="zoom-btn" onClick={zoomOut} title="Zoom out (−)">
            −
          </button>
          <span className="zoom-label">{Math.round(zoomScale * 100)}%</span>
          <button className="zoom-btn" onClick={zoomIn} title="Zoom in (+)">
            +
          </button>
          <button
            className="zoom-btn reset"
            onClick={resetZoom}
            title="Reset zoom"
          >
            Reset
          </button>
          <label className="follow-toggle" title="Scroll with the playhead">
            <input
              type="checkbox"
              checked={followPlayhead}
              onChange={toggleFollow}
            />
            <span>Follow</span>
          </label>
        </div>
      </div>
    </DraggableDiv>
  );
}

export default MainContent;
