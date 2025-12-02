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

function MainContent({
  tracks = [],
  onMute,
  onSolo,
  onDelete,
  onAssetDrop,
  totalLengthMs = 0,
  selection,
  onSelectionChange,
  selectMode = false,
  confirmEdit,
  onTrimCancel,
  selectedTrackId,
  setSelectedTrackId,
  onTrimTrackSelect,
}) {
  const {isEffectsMenuOpen} = useContext(AppContext);

  // Default visible window length (in ms) before horizontal scrolling is needed
  // Timeline scale is driven by pixels-per-second instead of a fixed window length
  const BASE_PX_PER_SEC = 100; // default density: 100px per second at 100% zoom
  const MIN_ZOOM = 0.25; // 25% (zoom out)
  const MAX_ZOOM = 5; // 500% (zoom in)
  const [zoom, setZoom] = useState(1);

  // Follow-mode toggle to auto-scroll the timeline during playback
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [progressMs, setProgressMs] = useState(
    progressStore.getState().ms || 0
  );
  const [timelineContentWidth, setTimelineContentWidth] = useState(0);
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);
  const scrollAreaRef = useRef(null);
  const [draggingHandle, setDraggingHandle] = useState(null);

  // Background click: only clear selection when NOT in trim/cut mode,
  // and only if the click was NOT inside a track row.
  const handleBackgroundClick = (e) => {
    // If we're in trim/cut mode, never clear selection via background click
    if (selectMode) return;

    // If click happened inside a track row, ignore
    const target = e.target;
    if (target && target.closest && target.closest(".track-wrapper")) {
      return;
    }

    // Real empty-background click -> clear selected track
    setSelectedTrackId(null);
  };

  useEffect(() => {
    const lengthMs = Math.max(1, totalLengthMs || 0);
    const pxPerMs = (BASE_PX_PER_SEC * (zoom || 1)) / 1000;
    const desiredWidth = Math.max(1, Math.round(pxPerMs * lengthMs));
    setTimelineContentWidth(desiredWidth);
  }, [totalLengthMs, zoom]);

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

  useEffect(
    // Track global playhead position for follow mode
    () => progressStore.subscribe(({ms}) => setProgressMs(ms || 0)),
    []
  );

  const verticalScale = useMemo(
    () => Math.min(2.25, Math.max(0.6, Math.pow(Math.max(zoom, 0.01), 0.5))),
    [zoom]
  );

  // Ref to the global playhead timeline bar (used for click-to-seek)
  const playheadRailRef = useRef(null);

  // Stores information while dragging a left/right trim handle
  const trimDragStateRef = useRef(null);

  // Convert a mouse X coordinate → timeline milliseconds.
  // This accounts for scroll, track-control width, and full timeline width.
  const msFromClientX = (clientX) => {
    const rail = playheadRailRef.current;
    const scrollArea = scrollAreaRef.current;
    if (!rail || !scrollArea || !totalLengthMs) return 0;

    // Full width of JUST the timeline (no track controls)
    const timelineWidth =
      timelineContentWidth ||
      rail.scrollWidth ||
      rail.offsetWidth ||
      scrollArea.clientWidth;

    if (timelineWidth <= 0) return 0;

    // How far the mouse is from the left edge of the scroll area
    const areaRect = scrollArea.getBoundingClientRect();
    const clampedX = Math.max(areaRect.left, Math.min(areaRect.right, clientX));
    const xInViewport = clampedX - areaRect.left;

    // Position along the entire row (controls + timeline)
    const scrollLeft = scrollArea.scrollLeft || 0;
    const xOnRow = scrollLeft + xInViewport;

    // Subtract the fixed controls panel width to get into timeline space
    const leftOffsetPx = TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;
    let xOnTimeline = xOnRow - leftOffsetPx;

    // Clamp to [0, timelineWidth]
    xOnTimeline = Math.max(0, Math.min(xOnTimeline, timelineWidth));

    const ratio = xOnTimeline / timelineWidth;
    const ms = ratio * totalLengthMs;

    return Math.max(0, Math.min(totalLengthMs, Math.round(ms)));
  };



  // Click behavior on the main timeline.
  // - In trim mode: clicking does nothing (only handles can move)
  // - Outside trim mode: clicking seeks playhead position (red line)
  const handlePlayheadRailMouseDown = (e) => {
    if (e.button !== 0) return; // left-click only

    // In trim mode we don't want clicks on the rail to do anything.
    // (Selection is controlled only by the yellow handles.)
    if (selectMode) {
      e.preventDefault();
      return;
    }

    // Normal (non-trim) mode: click-to-seek on the global timeline.
    const target = msFromClientX(e.clientX);
    if (typeof target !== "number") return;

    // Move the red line immediately and seek audio there.
    progressStore.beginScrub();
    progressStore.setMs(target);       // visual playhead move
    progressStore.requestSeek(target); // jump playback
    progressStore.endScrub();
  };

  // Start dragging a trim handle ("left" or "right").
  // Save initial data so dragging can adjust the correct boundary.
  const startHandleDrag = (side, e) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !selection ||
      typeof selection.startMs !== "number" ||
      typeof selection.endMs !== "number"
    ) {
      return;
    }

    const selStart = Math.min(selection.startMs, selection.endMs);
    const selEnd = Math.max(selection.startMs, selection.endMs);

    trimDragStateRef.current = {
      side,                       // "left" or "right"
      startClientX: e.clientX,    // mouse x at drag start
      initialStartMs: selStart,   // selection at drag start
      initialEndMs: selEnd,
    };

    setDraggingHandle(side);
  };

  // Handle dragging of trim handles.
  // Converts mouse movement → updated trim start/end.
  // Enforces clamping and minimum trim length.
  useEffect(() => {
    if (!draggingHandle) return;

    const handleMove = (e) => {
      if (!onSelectionChange || !totalLengthMs) return;
      const state = trimDragStateRef.current;
      if (!state) return;

      const { side, startClientX, initialStartMs, initialEndMs } = state;

      // How many pixels the mouse moved since drag started
      const deltaPx = e.clientX - startClientX;

      // Map pixels -> ms using the current timeline width
      const timelineWidthPx = timelineContentWidth || 1;
      const msPerPx = totalLengthMs / timelineWidthPx;

      const MIN_LEN = 10;
      let startMs = initialStartMs;
      let endMs = initialEndMs;

      if (side === "left") {
        let nextStart = initialStartMs + deltaPx * msPerPx;
        // Clamp inside [0, initialEndMs - MIN_LEN]
        nextStart = Math.max(0, Math.min(nextStart, initialEndMs - MIN_LEN));
        startMs = nextStart;
      } else if (side === "right") {
        let nextEnd = initialEndMs + deltaPx * msPerPx;
        // Clamp inside [initialStartMs + MIN_LEN, totalLengthMs]
        nextEnd = Math.max(
          initialStartMs + MIN_LEN,
          Math.min(nextEnd, totalLengthMs)
        );
        endMs = nextEnd;
      }

      onSelectionChange({ startMs, endMs });
    };

    const handleUp = () => {
      setDraggingHandle(null);
      trimDragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingHandle, onSelectionChange, totalLengthMs, timelineContentWidth]);

  const timelineStyle = useMemo(
    () => ({
      "--timeline-content-width": `${Math.max(1, timelineContentWidth)}px`,
      "--track-height": `${Math.round(96 * verticalScale)}px`,
    }),
    [timelineContentWidth, verticalScale]
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

  const zoomIn = () =>
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))));
  const zoomOut = () =>
    setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))));
  const resetZoom = () => setZoom(1);
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
        onClick={handleBackgroundClick}
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
                ref={playheadRailRef}
                onMouseDown={handlePlayheadRailMouseDown}
                style={{
                  left: `${timelineMetrics.leftOffsetPx}px`,
                  width: `${timelineMetrics.widthPx}px`,
                  // Always allow clicks; we gate trim logic inside the handler
                  pointerEvents: "auto",
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
                {/* Full-height red playhead that runs through all tracks */}
                <div
                  className="global-playhead-rail-full"
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
                  className="tracks-container"
                  style={{width: `${timelineMetrics.rowWidthPx}px`}}
                >
                  {tracks.map((track, index) => {
                    const isTrimSelected = selectMode && selectedTrackId === track.id;
                    const isTrackSelected = selectedTrackId === track.id;
                    // Build row classes so we can show hover + selected states
                    const rowClasses = [
                      "track-wrapper",
                      selectMode ? "track-wrapper-trim-hover" : "",
                      isTrimSelected ? "track-wrapper-trim-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    // Compute selection window (in %) for the selected track only
                    let trackHasSelection = false;
                    let trackSelLeftPx = 0;
                    let trackSelWidthPx = 0;
                    if (
                      selectMode &&
                      isTrimSelected &&
                      selection &&
                      typeof selection.startMs === "number" &&
                      typeof selection.endMs === "number" &&
                      selection.endMs !== selection.startMs &&
                      totalLengthMs > 0
                    ) {
                      const selStart = Math.min(selection.startMs, selection.endMs);
                      const selEnd = Math.max(selection.startMs, selection.endMs);
                      const total = Math.max(totalLengthMs || 1, 1);

                      const timelineWidthPx = timelineMetrics.widthPx;
                      const leftOffsetPx = timelineMetrics.leftOffsetPx;
                      const pxPerMs = timelineWidthPx / total;

                      trackHasSelection = true;
                      trackSelLeftPx = leftOffsetPx + selStart * pxPerMs;
                      trackSelWidthPx = (selEnd - selStart) * pxPerMs;
                    }

                    return (
                      <div
                        key={track.id}
                        className={rowClasses}
                        onClick={() => {
                          // Only allow selecting a track while in trim mode
                          if (selectMode && onTrimTrackSelect) {
                            onTrimTrackSelect(track.id);
                          }
                        }}
                      >
                        {trackHasSelection && (
                          <>
                            {/* Yellow fill across the selected region of THIS track only */}
                            <div
                              className="track-trim-highlight"
                              style={{
                                left: `${trackSelLeftPx}px`,
                                width: `${trackSelWidthPx}px`,
                              }}
                            />

                            {/* Left handle at selection start */}
                            <div
                              className="trim-handle trim-handle-left"
                              style={{ left: `${trackSelLeftPx}px` }}
                              onMouseDown={(e) => startHandleDrag("left", e)}
                            />

                            {/* Right handle at selection end */}
                            <div
                              className="trim-handle trim-handle-right"
                              style={{ left: `${trackSelLeftPx + trackSelWidthPx}px` }}
                              onMouseDown={(e) => startHandleDrag("right", e)}
                            />

                            {/* ✓ / ✕ controls, following the right edge */}
                            <div
                              className="trim-controls"
                              style={{ left: `${trackSelLeftPx + trackSelWidthPx}px` }}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <button
                                className="trim-btn trim-confirm"
                                type="button"
                                onClick={confirmEdit}
                                title="Apply trim to selected region"
                              >
                                ✓
                              </button>
                              <button
                                className="trim-btn trim-cancel"
                                type="button"
                                onClick={onTrimCancel}
                                title="Cancel trim"
                              >
                                ✕
                              </button>
                            </div>
                          </>
                        )}

                        <TrackLane
                          track={track}
                          trackIndex={index}
                          totalTracks={tracks.length}
                          isSelected={isTrackSelected}
                          onSelect={setSelectedTrackId}
                          showTitle={true}
                          onMute={onMute}
                          onSolo={onSolo}
                          onDelete={onDelete}
                          totalLengthMs={totalLengthMs}
                          timelineWidth={timelineMetrics.widthPx}
                          rowWidthPx={timelineMetrics.rowWidthPx}
                        />
                      </div>
                    );
                  })}
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
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
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
