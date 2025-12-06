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

const extractClientX = (event) => {
  if (!event) return null;
  if (event.touches && event.touches.length > 0) {
    return event.touches[0].clientX;
  }
  if (event.changedTouches && event.changedTouches.length > 0) {
    return event.changedTouches[0].clientX;
  }
  if (typeof event.clientX === "number") {
    return event.clientX;
  }
  return null;
};

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
}) {
  const {selectedTrackId, setSelectedTrackId, isEffectsMenuOpen} =
    useContext(AppContext);

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
  const scrubSessionRef = useRef({active: false, source: null, lastMs: null});
  const scrubSeekRafRef = useRef(null);
  const pendingScrubSeekRef = useRef(null);
  const [selectedSegment, setSelectedSegment] = useState(null);

  const clearSegmentSelection = useCallback(() => {
    setSelectedSegment(null);
  }, []);

  const handleSegmentSelected = useCallback(
    (trackId, segmentId, segmentIndex) => {
      if (!trackId) {
        setSelectedSegment(null);
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
    },
    []
  );

  // Deselect when clicking background
  const handleBackgroundClick = () => {
    if (typeof setSelectedTrackId === "function") {
      setSelectedTrackId(null);
    }
    clearSegmentSelection();
  };

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

  const verticalScale = useMemo(
    () => Math.min(2.25, Math.max(0.6, Math.pow(Math.max(zoom, 0.01), 0.5))),
    [zoom]
  );

  const timelineStyle = useMemo(
    () => ({
      "--timeline-content-width": `${Math.max(1, timelineContentWidth)}px`,
      "--track-height": `${Math.round(96 * verticalScale)}px`,
    }),
    [timelineContentWidth, verticalScale]
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

  // === OPTIMIZED SCROLLING LOGIC ===
  // This replaces the old state-based scrolling.
  // It reads directly from the store and manipulates the DOM.
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

  const zoomIn = () =>
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))));
  const zoomOut = () =>
    setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))));
  const resetZoom = () => setZoom(1);
  const toggleFollow = () => setFollowPlayhead((v) => !v);

  // Handle asset drop - can target empty space OR an existing track
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
        const trackHeight = 96 * verticalScale;
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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const getTimelineMsFromClientX = useCallback(
    (clientX) => {
      if (!Number.isFinite(clientX)) return null;
      if (!scrollAreaRef.current) return null;
      if (totalLengthMs <= 0 || timelineMetrics.widthPx <= 0) return null;

      const rect = scrollAreaRef.current.getBoundingClientRect();
      const scrollLeft = scrollAreaRef.current.scrollLeft || 0;
      const relativeX =
        clientX - rect.left + scrollLeft - timelineMetrics.leftOffsetPx;
      const clampedPx = Math.max(
        0,
        Math.min(timelineMetrics.widthPx, relativeX)
      );
      const pxPerMs = timelineMetrics.widthPx / totalLengthMs;
      if (!Number.isFinite(pxPerMs) || pxPerMs <= 0) return null;
      const ms = clampedPx / pxPerMs;
      return Math.max(0, Math.min(totalLengthMs, ms));
    },
    [
      totalLengthMs,
      timelineMetrics.leftOffsetPx,
      timelineMetrics.widthPx,
    ]
  );

  const moveScrubToClientX = useCallback(
    (clientX) => {
      const target = getTimelineMsFromClientX(clientX);
      if (typeof target !== "number") return null;
      progressStore.setMs(target);
      return target;
    },
    [getTimelineMsFromClientX]
  );

  const flushScheduledScrubSeek = useCallback(() => {
    if (scrubSeekRafRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(scrubSeekRafRef.current);
      scrubSeekRafRef.current = null;
    }
    const pending = pendingScrubSeekRef.current;
    pendingScrubSeekRef.current = null;
    if (typeof pending === "number") {
      try {
        progressStore.requestSeek(pending);
      } catch (err) {
        console.warn("MainContent scrub seek error:", err);
      }
    }
  }, []);

  const scheduleScrubSeek = useCallback((ms) => {
    if (typeof ms !== "number") return;
    pendingScrubSeekRef.current = ms;

    if (typeof window === "undefined") {
      flushScheduledScrubSeek();
      return;
    }

    if (scrubSeekRafRef.current !== null) return;
    scrubSeekRafRef.current = window.requestAnimationFrame(() => {
      scrubSeekRafRef.current = null;
      const pending = pendingScrubSeekRef.current;
      pendingScrubSeekRef.current = null;
      if (typeof pending === "number") {
        try {
          progressStore.requestSeek(pending);
        } catch (err) {
          console.warn("MainContent scrub seek error:", err);
        }
      }
    });
  }, [flushScheduledScrubSeek]);

  const handleScrubPointerMove = useCallback(
    (event) => {
      if (!scrubSessionRef.current.active) return;
      const clientX = extractClientX(event);
      if (!Number.isFinite(clientX)) return;
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      const target = moveScrubToClientX(clientX);
      if (typeof target === "number") {
        scrubSessionRef.current.lastMs = target;
        scheduleScrubSeek(target);
      }
    },
    [moveScrubToClientX, scheduleScrubSeek]
  );

  const handleScrubPointerUp = useCallback(
    (event) => {
      if (!scrubSessionRef.current.active) return;
      const clientX = extractClientX(event);
      let finalMs = scrubSessionRef.current.lastMs;
      if (Number.isFinite(clientX)) {
        const target = moveScrubToClientX(clientX);
        if (typeof target === "number") {
          finalMs = target;
        }
      }
      flushScheduledScrubSeek();
      if (typeof finalMs === "number") {
        progressStore.requestSeek(finalMs);
      }
      progressStore.endScrub();
      scrubSessionRef.current = {active: false, source: null, lastMs: null};
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", handleScrubPointerMove);
        window.removeEventListener("mouseup", handleScrubPointerUp);
        window.removeEventListener("touchmove", handleScrubPointerMove);
        window.removeEventListener("touchend", handleScrubPointerUp);
        window.removeEventListener("touchcancel", handleScrubPointerUp);
      }
    },
    [moveScrubToClientX, handleScrubPointerMove, flushScheduledScrubSeek]
  );

  const startScrubSession = useCallback(
    (clientX, source = "mouse") => {
      if (scrubSessionRef.current.active) return;
      if (!Number.isFinite(clientX)) return;
      if (timelineMetrics.widthPx <= 0 || totalLengthMs <= 0) return;

      try {
        progressStore.beginScrub({
          pauseTransport: true,
          silenceDuringScrub: true,
        });
      } catch (err) {
        console.warn("MainContent scrub begin error:", err);
        return;
      }

      const target = moveScrubToClientX(clientX);
      if (typeof target !== "number") {
        progressStore.endScrub();
        return;
      }

      scrubSessionRef.current = {active: true, source, lastMs: target};
      scheduleScrubSeek(target);

      if (typeof window !== "undefined") {
        if (source === "touch") {
          window.addEventListener("touchmove", handleScrubPointerMove, {
            passive: false,
          });
          window.addEventListener("touchend", handleScrubPointerUp);
          window.addEventListener("touchcancel", handleScrubPointerUp);
        } else {
          window.addEventListener("mousemove", handleScrubPointerMove);
          window.addEventListener("mouseup", handleScrubPointerUp);
        }
      }
    },
    [
      timelineMetrics.widthPx,
      totalLengthMs,
      moveScrubToClientX,
      handleScrubPointerMove,
      handleScrubPointerUp,
      scheduleScrubSeek,
    ]
  );

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", handleScrubPointerMove);
        window.removeEventListener("mouseup", handleScrubPointerUp);
        window.removeEventListener("touchmove", handleScrubPointerMove);
        window.removeEventListener("touchend", handleScrubPointerUp);
        window.removeEventListener("touchcancel", handleScrubPointerUp);
      }
      if (scrubSessionRef.current.active) {
        progressStore.endScrub();
        scrubSessionRef.current = {active: false, source: null, lastMs: null};
      }
      flushScheduledScrubSeek();
    };
  }, [
    handleScrubPointerMove,
    handleScrubPointerUp,
    flushScheduledScrubSeek,
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
        {hasTracks && (
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
        )}
        {hasTracks ? (
          <>
            <TimelineRuler
              totalLengthMs={totalLengthMs}
              timelineWidth={timelineMetrics.widthPx}
              timelineLeftOffsetPx={timelineMetrics.leftOffsetPx}
              onScrubStart={startScrubSession}
            />
            <div
              className="timeline-scroll-content"
              style={{
                minWidth: `${timelineMetrics.rowWidthPx}px`,
                width: `${timelineMetrics.rowWidthPx}px`,
              }}
            >
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
                        isSelected={track.id === selectedTrackId}
                        onSelect={(id) => setSelectedTrackId(id)}
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
                        onClearSegmentSelection={clearSegmentSelection}
                        onSegmentDelete={onSegmentDelete}
                        onTimelineScrubStart={startScrubSession}
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
