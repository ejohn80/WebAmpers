import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  useCallback,
} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import GlobalPlayhead from "../Generic/GlobalPlayhead";
import TimelineRuler from "./TimelineRuler";
import TrackLane from "../../components/TrackLane/TrackLane";
import {progressStore} from "../../playback/progressStore";
import {AppContext} from "../../context/AppContext";
import EffectsMenu from "./Effects/EffectsMenu";
import styles from "./MainContent.module.css";
import "./MainContent.css";

const TRACK_CONTROLS_WIDTH = 180;
const TRACK_CONTROLS_GAP = 12;
const TRACK_ROW_PADDING = 8; // Keep in sync with --track-row-padding in CSS
const TRACK_HEIGHT_PX = 96; // Base track height (fixed for horizontal-only zoom)

function MainContent({
  tracks = [],
  onMute,
  onSolo,
  onDelete,
  onCutTrack,
  onCopyTrack,
  onPasteTrack,
  hasClipboard = false,
  onAssetDrop,
  onSegmentMove,
  onSegmentDelete = () => {},
  requestAssetPreview,
  totalLengthMs = 0,
  onCutSegmentRange,
}) {
  const {selectedTrackId, setSelectedTrackId, isEffectsMenuOpen} =
    useContext(AppContext);
  const initialProgress = useMemo(() => progressStore.getState(), []);

  // Default visible window length (in ms) before horizontal scrolling is needed
  // Timeline scale is driven by pixels-per-second instead of a fixed window length
  const BASE_PX_PER_SEC = 100; // fallback density: 100px per second when viewport not measured
  const DEFAULT_VISIBLE_MS = 60000; // 1 minute of timeline should fit in the viewport at 100% zoom
  const MIN_ZOOM = 0.25; // 25% (zoom out)
  const MAX_ZOOM = 5; // 500% (zoom in)
  const [zoom, setZoom] = useState(1);

  // Follow-mode toggle to auto-scroll the timeline during playback
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [timelineContentWidth, setTimelineContentWidth] = useState(0);
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);
  const scrollAreaRef = useRef(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [playheadMs, setPlayheadMs] = useState(() => initialProgress?.ms || 0);
  const playheadMsRef = useRef(playheadMs);
  const [cutBox, setCutBox] = useState(null);
  const suppressBackgroundClickRef = useRef(false);

  // Keep playhead ref in sync with state
  useEffect(() => {
    playheadMsRef.current = playheadMs;
  }, [playheadMs]);

  // Subscribe to progress store for playhead updates
  useEffect(() => {
    const unsubscribe = progressStore.subscribe(({ms}) => {
      setPlayheadMs(ms || 0);
    });
    return unsubscribe;
  }, []);

  const clearSegmentSelection = useCallback(() => {
    setSelectedSegment(null);
    setCutBox(null);
  }, []);

  const handleSegmentSelected = useCallback(
    (trackId, segmentId, segmentIndex) => {
      if (!trackId) {
        setSelectedSegment(null);
        setCutBox(null);
        return;
      }

      setSelectedSegment({
        trackId,
        segmentId: segmentId ?? null,
        segmentIndex:
          Number.isFinite(segmentIndex) && segmentIndex >= 0
            ? segmentIndex
            : null,
      });
      // selecting a segment should clear any existing cut selection
      setCutBox(null);
    },
    []
  );

  // Deselect when clicking background
  const handleBackgroundClick = () => {
    if (typeof setSelectedTrackId === "function") {
      setSelectedTrackId(null);
    }
    clearSegmentSelection();
    setCutBox(null);
  };

  // Segment validation logic
  useEffect(() => {
    if (!selectedSegment) return;

    const track = tracks.find((t) => t?.id === selectedSegment.trackId);
    if (!track || !Array.isArray(track.segments)) {
      clearSegmentSelection();
      return;
    }

    const hasMatch = track.segments.some((segment, index) => {
      if (!segment) return false;
      if (selectedSegment.segmentId) {
        return segment.id === selectedSegment.segmentId;
      }
      return selectedSegment.segmentIndex === index;
    });

    if (!hasMatch) {
      clearSegmentSelection();
    }
  }, [tracks, selectedSegment, clearSegmentSelection]);

  const timelineStyle = useMemo(
    () => ({
      "--timeline-content-width": `${Math.max(1, timelineContentWidth)}px`,
      // Track height is now fixed, adhering to horizontal-only zoom.
      "--track-height": `${TRACK_HEIGHT_PX}px`,
    }),
    [timelineContentWidth]
  );

  const timelineMetrics = useMemo(() => {
    const leftOffsetPx =
      TRACK_ROW_PADDING + TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;
    const minimumTimelineWidth = Math.max(
      1,
      Math.round(scrollAreaWidth - (leftOffsetPx + TRACK_ROW_PADDING))
    );
    const widthPx = Math.max(
      1,
      Math.round(timelineContentWidth),
      minimumTimelineWidth
    );
    const rowWidthPx = widthPx + leftOffsetPx + TRACK_ROW_PADDING;
    return {widthPx, leftOffsetPx, rowWidthPx};
  }, [timelineContentWidth, scrollAreaWidth]);

  const handleTrackSelected = useCallback(
    (trackId) => {
      if (typeof setSelectedTrackId === "function") {
        setSelectedTrackId(trackId);
      }
      // whenever the user selects any track, clear the yellow box
      setCutBox(null);
    },
    [setSelectedTrackId]
  );

  // Convert a mouse X coordinate → timeline milliseconds.
  const msFromClientX = useCallback(
    (clientX) => {
      const scrollArea = scrollAreaRef.current;
      if (!scrollArea || !totalLengthMs) return 0;

      const rect = scrollArea.getBoundingClientRect();

      // Clamp mouse X inside the scroll area
      const clampedX = Math.max(rect.left, Math.min(rect.right, clientX));
      const xInViewport = clampedX - rect.left;

      const scrollLeft = scrollArea.scrollLeft || 0;
      const xOnRow = scrollLeft + xInViewport;

      // Move into “timeline only” space (skip track controls)
      let xOnTimeline = xOnRow - timelineMetrics.leftOffsetPx;

      // Clamp to timeline
      xOnTimeline = Math.max(0, Math.min(timelineMetrics.widthPx, xOnTimeline));

      const ratio =
        timelineMetrics.widthPx > 0 ? xOnTimeline / timelineMetrics.widthPx : 0;

      const ms = ratio * totalLengthMs;
      return Math.round(Math.max(0, Math.min(totalLengthMs, ms)));
    },
    [totalLengthMs, timelineMetrics]
  );

  // Helper: convert ms → x-position in pixels
  const msToTimelineX = useCallback(
    (ms) => {
      if (!totalLengthMs || !timelineMetrics.widthPx) {
        return timelineMetrics.leftOffsetPx || 0;
      }
      const clampedMs = Math.max(0, Math.min(totalLengthMs, ms));
      const ratio = clampedMs / totalLengthMs;
      return timelineMetrics.leftOffsetPx + ratio * timelineMetrics.widthPx;
    },
    [timelineMetrics, totalLengthMs]
  );

  const clampZoom = useCallback((value) => {
    const sanitized = Number.isFinite(value) ? value : 1;
    return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, sanitized)).toFixed(2));
  }, []);

  const adjustScrollForZoom = useCallback(
    (prevZoom, nextZoom) => {
      const node = scrollAreaRef.current;
      const lengthMs = Math.max(0, totalLengthMs || 0);
      if (!node || !lengthMs) return;

      const currentWidth = timelineMetrics.widthPx;
      if (!currentWidth || prevZoom === 0) return;

      const ratio = nextZoom / prevZoom;
      if (!Number.isFinite(ratio) || ratio === 1) return;

      // We calculate the new timeline width without relying on the state update
      // which hasn't happened yet.
      const newWidth = currentWidth * ratio;

      // Anchor the scroll calculation around the current playhead position
      const anchorRatio = Math.max(
        0,
        Math.min(1, playheadMsRef.current / lengthMs)
      );
      // Calculate how much the content *before* the playhead has expanded/shrunk
      const deltaPx = anchorRatio * (newWidth - currentWidth);

      // Recalculate full row width to determine max scroll
      const newRowWidth =
        newWidth + timelineMetrics.leftOffsetPx + TRACK_ROW_PADDING;
      const viewportWidth = node.clientWidth || 0;
      const maxScroll = Math.max(0, newRowWidth - viewportWidth);

      // Calculate desired scroll based on previous scroll + delta
      const desiredScroll = Math.min(
        Math.max(0, node.scrollLeft + deltaPx),
        maxScroll
      );

      if (Number.isFinite(desiredScroll)) {
        // Direct DOM update (High Performance)
        node.scrollLeft = desiredScroll;
      }
    },
    [timelineMetrics.leftOffsetPx, timelineMetrics.widthPx, totalLengthMs]
  );

  const setZoomWithCompensation = useCallback(
    (computeNext) => {
      setZoom((prevZoom) => {
        const desired = computeNext(prevZoom);
        const nextZoom = clampZoom(desired);
        if (nextZoom === prevZoom) {
          return prevZoom;
        }
        // This adjusts the scroll *before* React renders the new content width
        adjustScrollForZoom(prevZoom, nextZoom);
        return nextZoom;
      });
    },
    [adjustScrollForZoom, clampZoom]
  );

  // === OPTIMIZED SCROLLING LOGIC ===
  useEffect(() => {
    const unsubscribe = progressStore.subscribe(({ms}) => {
      // If follow mode is off, do nothing
      if (!followPlayhead) return;

      const node = scrollAreaRef.current;
      if (!node) return;

      const lengthMs = Math.max(0, totalLengthMs || 0);
      if (lengthMs === 0 || timelineMetrics.widthPx === 0) return;

      const pxPerMs = timelineMetrics.widthPx / lengthMs;

      // Calculate where the playhead is in pixels
      const playheadX =
        timelineMetrics.leftOffsetPx +
        Math.max(0, Math.min(ms, lengthMs)) * pxPerMs;

      const viewportWidth = node.clientWidth || 0;
      if (viewportWidth === 0) return;

      // Center the playhead
      const desiredScroll = playheadX - viewportWidth / 2;
      const maxScroll = Math.max(0, timelineMetrics.rowWidthPx - viewportWidth);
      const nextScroll = Math.min(Math.max(0, desiredScroll), maxScroll);

      if (Number.isFinite(nextScroll)) {
        // Direct DOM update (High Performance)
        node.scrollLeft = nextScroll;
      }
    });

    return unsubscribe;
  }, [followPlayhead, totalLengthMs, timelineMetrics]);

  // Timeline width calculation
  useEffect(() => {
    const lengthMs = Math.max(1, totalLengthMs || 0);
    const visibleWindowMs = Math.max(1, Math.min(lengthMs, DEFAULT_VISIBLE_MS));
    const staticWidth =
      TRACK_ROW_PADDING * 2 + TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;
    const availableWidthPx = Math.max(1, scrollAreaWidth - staticWidth);

    const basePxPerMs =
      availableWidthPx > 1
        ? availableWidthPx / visibleWindowMs
        : BASE_PX_PER_SEC / 1000;

    const pxPerMs = basePxPerMs * (zoom || 1);
    const desiredWidth = Math.max(1, Math.round(pxPerMs * lengthMs));
    setTimelineContentWidth(desiredWidth);
  }, [totalLengthMs, zoom, scrollAreaWidth]);

  // Scroll Area Width Observer
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

  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  const zoomIn = () => setZoomWithCompensation((z) => z + 0.25);
  const zoomOut = () => setZoomWithCompensation((z) => z - 0.25);
  const resetZoom = () => setZoomWithCompensation(() => 1);
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
        // Get drop position to calculate timeline position
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left - timelineMetrics.leftOffsetPx;
        const pxPerMs =
          totalLengthMs > 0 ? timelineMetrics.widthPx / totalLengthMs : 0;
        const timelinePositionMs =
          pxPerMs > 0 ? Math.max(0, dropX / pxPerMs) : 0;

        // Determine which track (if any) was targeted
        const dropY = e.clientY - rect.top;
        const trackHeight = TRACK_HEIGHT_PX; // Fixed height
        const rulerHeight = 40; // Approximate ruler height
        const trackIndex = Math.floor((dropY - rulerHeight) / trackHeight);
        const targetTrackId =
          trackIndex >= 0 && trackIndex < tracks.length
            ? tracks[trackIndex]?.id
            : null;

        onAssetDrop(dropData.assetId, targetTrackId, timelinePositionMs);
      }
    } catch (err) {
      console.error("Error handling drop:", err);
    }
  };

  // Handle Ctrl/Cmd + Click + Drag to create a cut range on the selected segment
  const handleTracksMouseDown = (e) => {
    const modifierPressed = e.ctrlKey || e.metaKey;
    // Only modifier + left button
    if (!(modifierPressed && e.button === 0)) return;

    // Eat this event so TrackLane's drag handler never sees it
    e.preventDefault();
    e.stopPropagation();
    if (
      e.nativeEvent &&
      typeof e.nativeEvent.stopImmediatePropagation === "function"
    ) {
      e.nativeEvent.stopImmediatePropagation();
    }

    const container = e.currentTarget;
    const containerRect = container.getBoundingClientRect();

    // Find which track-wrapper the mouse is over
    const wrappers = Array.from(
      container.getElementsByClassName("track-wrapper")
    );
    let trackIndex = -1;
    let trackTopPx = 0;
    let trackHeightPx = 0;

    for (let i = 0; i < wrappers.length; i++) {
      const wRect = wrappers[i].getBoundingClientRect();
      if (e.clientY >= wRect.top && e.clientY <= wRect.bottom) {
        trackIndex = i;
        trackTopPx = wRect.top - containerRect.top;
        trackHeightPx = wRect.height;
        break;
      }
    }

    if (trackIndex < 0 || trackIndex >= tracks.length) return;
    const track = tracks[trackIndex];
    if (!track || !Array.isArray(track.segments) || track.segments.length === 0)
      return;

    // Prefer measuring the waveform area (timeline) instead of the full track wrapper
    let highlightTopPx = trackTopPx;
    let highlightHeightPx = trackHeightPx;
    const timelineEl = wrappers[trackIndex].querySelector(
      ".tracklane-timeline"
    );
    if (timelineEl) {
      const timelineRect = timelineEl.getBoundingClientRect();
      highlightTopPx = timelineRect.top - containerRect.top;
      highlightHeightPx = timelineRect.height;
    }

    // Time where mouse went down
    const rawStartMs = msFromClientX(e.clientX);

    // Find segment on this track that contains that time
    let segmentIndex = -1;
    let seg = null;
    for (let i = 0; i < track.segments.length; i++) {
      const s = track.segments[i];
      if (!s) continue;
      const segStartMs =
        s.startOnTimelineMs ?? Math.round((s.startOnTimeline ?? 0) * 1000);
      const segDurMs = s.durationMs ?? Math.round((s.duration ?? 0) * 1000);
      const segEndMs = segStartMs + Math.max(0, segDurMs);
      if (rawStartMs >= segStartMs && rawStartMs <= segEndMs) {
        segmentIndex = i;
        seg = s;
        break;
      }
    }

    if (segmentIndex === -1 || !seg) {
      // Ctrl-drag on empty part of track: do nothing
      return;
    }

    // Prevent the "click" after drag from clearing our selection once
    suppressBackgroundClickRef.current = true;

    const segStartMs =
      seg.startOnTimelineMs ?? Math.round((seg.startOnTimeline ?? 0) * 1000);
    const segDurMs = seg.durationMs ?? Math.round((seg.duration ?? 0) * 1000);
    const segEndMs = segStartMs + Math.max(0, segDurMs);

    const startMs = Math.max(segStartMs, Math.min(segEndMs, rawStartMs));

    // Update selection so the rest of the UI knows which segment is active
    if (typeof setSelectedTrackId === "function") {
      setSelectedTrackId(track.id);
    }
    setSelectedSegment({
      trackId: track.id,
      segmentId: seg.id ?? null,
      segmentIndex,
    });

    // Start the cut box, store the actual row top/height in pixels
    setCutBox({
      trackId: track.id,
      segmentIndex,
      startMs,
      endMs: startMs,
      isDragging: true,
      topPx: highlightTopPx,
      heightPx: highlightHeightPx,
    });

    const handleMove = (moveEvt) => {
      const rawMs = msFromClientX(moveEvt.clientX);
      const clamped = Math.max(segStartMs, Math.min(segEndMs, rawMs));
      setCutBox((prev) =>
        prev && prev.isDragging ? {...prev, endMs: clamped} : prev
      );
    };

    const handleUp = (upEvt) => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);

      const rawMs = msFromClientX(upEvt.clientX);
      const clamped = Math.max(segStartMs, Math.min(segEndMs, rawMs));

      setCutBox((prev) =>
        prev
          ? {
              ...prev,
              endMs: clamped,
              isDragging: false,
            }
          : prev
      );
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  const handleScrollAreaClick = (e) => {
    if (suppressBackgroundClickRef.current) {
      suppressBackgroundClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return; // don't clear selection after an Ctrl-drag
    }
    handleBackgroundClick();
  };

  // “Cut” button that actually calls your handler
  const handleCutBoxApply = useCallback(() => {
    if (!cutBox || !onCutSegmentRange) return;

    const {trackId, segmentIndex, startMs, endMs} = cutBox;
    if (trackId == null || segmentIndex == null) return;
    if (startMs === endMs) return;

    onCutSegmentRange(trackId, segmentIndex, startMs, endMs);
    setCutBox(null);
  }, [cutBox, onCutSegmentRange]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleClearSegmentSelection = useCallback(() => {
    clearSegmentSelection();
    setCutBox(null);
  }, [clearSegmentSelection]);

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
        onClick={handleScrollAreaClick}
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
                style={{
                  width: `${timelineMetrics.rowWidthPx}px`,
                  position: "relative",
                }}
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

                {/* CUT BOX OVERLAY */}
                {cutBox &&
                  (() => {
                    const startX = msToTimelineX(cutBox.startMs);
                    const endX = msToTimelineX(cutBox.endMs);
                    const left = Math.min(startX, endX);
                    const width = Math.max(2, Math.abs(endX - startX));
                    const top = cutBox.topPx ?? 0;
                    const height = cutBox.heightPx ?? TRACK_HEIGHT_PX; // Fixed height

                    return (
                      <div
                        className="cut-selection-overlay"
                        style={{
                          position: "absolute",
                          zIndex: 20,
                          pointerEvents: "auto",
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${width}px`,
                          height: `${height}px`,
                          border: "1px solid #e6c200",
                          backgroundColor: "rgba(255, 255, 153, 0.6)", // light yellow
                          boxSizing: "border-box",
                        }}
                      >
                        {!cutBox.isDragging && (
                          <button
                            type="button"
                            className="cut-selection-button"
                            style={{
                              position: "absolute",
                              right: 4,
                              top: 4,
                              pointerEvents: "auto",
                              background: "#e6c200",
                              color: "#000",
                              border: "none",
                              padding: "4px 8px",
                              cursor: "pointer",
                            }}
                            onClick={handleCutBoxApply}
                          >
                            Cut
                          </button>
                        )}
                      </div>
                    );
                  })()}

                <div
                  className="tracks-container"
                  style={{width: `${timelineMetrics.rowWidthPx}px`}}
                  onMouseDownCapture={handleTracksMouseDown}
                >
                  {tracks.map((track, index) => (
                    <div key={track.id} className="track-wrapper">
                      <TrackLane
                        track={track}
                        trackIndex={index}
                        totalTracks={tracks.length}
                        isSelected={track.id === selectedTrackId}
                        onSelect={handleTrackSelected}
                        showTitle={true}
                        onMute={onMute}
                        onSolo={onSolo}
                        onDelete={onDelete}
                        onSegmentMove={onSegmentMove}
                        requestAssetPreview={requestAssetPreview}
                        onAssetDrop={onAssetDrop}
                        onCutTrack={onCutTrack}
                        onCopyTrack={onCopyTrack}
                        onPasteTrack={onPasteTrack}
                        hasClipboard={hasClipboard}
                        totalLengthMs={totalLengthMs}
                        timelineWidth={timelineMetrics.widthPx}
                        rowWidthPx={timelineMetrics.rowWidthPx}
                        selectedSegment={selectedSegment}
                        onSegmentSelected={handleSegmentSelected}
                        onClearSegmentSelection={handleClearSegmentSelection}
                        onSegmentDelete={onSegmentDelete}
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
          <button className="zoom-btn" onClick={zoomOut} title="Zoom out (-)">
            -
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
