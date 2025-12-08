/**
 * MainContent Component
 *
 * Central workspace with timeline, tracks, and playback controls.
 * Handles timeline zoom, scrolling, track management, and audio segment editing.
 * Includes drag-and-drop for assets, cut/copy/paste operations, and effects menu.
 *
 * Features:
 * - Horizontal-only timeline zoom with scroll compensation
 * - Follow playhead mode for automatic scrolling during playback
 * - Ctrl/Cmd + drag to create cut ranges on audio segments
 * - Context menu for paste operations
 * - Integration with effects menu and global playhead
 *
 * Key State:
 * - zoom: Timeline zoom level (0.25x to 5x)
 * - followPlayhead: Auto-scroll during playback
 * - selectedSegment: Currently selected audio segment
 * - cutBox: Visual selection for cutting segments
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  useCallback,
  useLayoutEffect,
} from "react";
import {createPortal} from "react-dom";
import DraggableDiv from "../Generic/DraggableDiv";
import GlobalPlayhead from "../Generic/GlobalPlayhead";
import TimelineRuler from "./TimelineRuler";
import TrackLane from "../../components/TrackLane/TrackLane";
import {progressStore} from "../../playback/progressStore";
import {AppContext} from "../../context/AppContext";
import EffectsMenu from "./Effects/EffectsMenu";
import styles from "./MainContent.module.css";
import "./MainContent.css";

// Layout constants for track controls and spacing
const TRACK_CONTROLS_WIDTH = 70;
const TRACK_CONTROLS_GAP = 37;
const TRACK_ROW_PADDING = 8;
const TRACK_HEIGHT_PX = 96; // Fixed track height (horizontal-only zoom)
const DEFAULT_TIMELINE_LEFT_OFFSET =
  TRACK_ROW_PADDING + TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;

// Zoom limits and defaults
const BASE_PX_PER_SEC = 100;
const DEFAULT_VISIBLE_MS = 60000; // 1 minute visible at 100% zoom
const MIN_ZOOM = 0.25; // 25% min zoom
const MAX_ZOOM = 5; // 500% max zoom

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
  // App context for selected track and effects menu
  const {selectedTrackId, setSelectedTrackId, isEffectsMenuOpen} =
    useContext(AppContext);
  const initialProgress = useMemo(() => progressStore.getState(), []);

  // Core state for timeline interaction
  const [zoom, setZoom] = useState(1);
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [timelineContentWidth, setTimelineContentWidth] = useState(0);
  const [measuredLeftOffsetPx, setMeasuredLeftOffsetPx] = useState(null);
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [backgroundMenu, setBackgroundMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const [playheadMs, setPlayheadMs] = useState(() => initialProgress?.ms || 0);
  const [cutBox, setCutBox] = useState(null);

  // Refs for DOM access and performance
  const scrollAreaRef = useRef(null);
  const tracksRelativeRef = useRef(null);
  const playheadMsRef = useRef(playheadMs);
  const suppressBackgroundClickRef = useRef(false);

  // Keep playhead ref synchronized
  useEffect(() => {
    playheadMsRef.current = playheadMs;
  }, [playheadMs]);

  // Subscribe to playback progress updates
  useEffect(() => {
    const unsubscribe = progressStore.subscribe(({ms}) => {
      setPlayheadMs(ms || 0);
    });
    return unsubscribe;
  }, []);

  // Clear segment selection helper
  const clearSegmentSelection = useCallback(() => {
    setSelectedSegment(null);
    setCutBox(null);
  }, []);

  // Handle segment selection
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
      setCutBox(null); // Clear any existing cut selection
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

  // Validate selected segment exists in current tracks
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

  // Calculate left offset for timeline positioning
  const resolvedLeftOffsetPx = Number.isFinite(measuredLeftOffsetPx)
    ? measuredLeftOffsetPx
    : DEFAULT_TIMELINE_LEFT_OFFSET;

  // Timeline CSS variables for consistent sizing
  const timelineStyle = useMemo(
    () => ({
      "--timeline-content-width": `${Math.max(1, timelineContentWidth)}px`,
      "--track-height": `${TRACK_HEIGHT_PX}px`,
      "--timeline-left-offset": `${resolvedLeftOffsetPx}px`,
    }),
    [timelineContentWidth, resolvedLeftOffsetPx]
  );

  // Pre-calculated timeline dimensions
  const timelineMetrics = useMemo(() => {
    const leftOffsetPx = resolvedLeftOffsetPx;
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
  }, [timelineContentWidth, scrollAreaWidth, resolvedLeftOffsetPx]);

  // Measure actual timeline offset for precise positioning
  useLayoutEffect(() => {
    const container = tracksRelativeRef.current;
    if (!container) {
      setMeasuredLeftOffsetPx(null);
      return undefined;
    }

    let frame = null;

    const measure = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        const timelineEl = container.querySelector(
          ".tracklane-root .tracklane-main"
        );
        if (!timelineEl) return;

        const containerRect = container.getBoundingClientRect();
        const timelineRect = timelineEl.getBoundingClientRect();
        const offset = Math.round(timelineRect.left - containerRect.left);
        if (Number.isFinite(offset) && offset >= 0) {
          setMeasuredLeftOffsetPx((prev) => (prev === offset ? prev : offset));
        }
      });
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => {
        observer.disconnect();
        if (frame) cancelAnimationFrame(frame);
      };
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
        if (frame) cancelAnimationFrame(frame);
      };
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tracks.length, zoom, scrollAreaWidth]);

  // Handle track selection
  const handleTrackSelected = useCallback(
    (trackId) => {
      if (typeof setSelectedTrackId === "function") {
        setSelectedTrackId(trackId);
      }
      setCutBox(null); // Clear cut selection when track changes
    },
    [setSelectedTrackId]
  );

  // Convert mouse X coordinate to timeline milliseconds
  const msFromClientX = useCallback(
    (clientX) => {
      const scrollArea = scrollAreaRef.current;
      if (!scrollArea || !totalLengthMs) return 0;

      const rect = scrollArea.getBoundingClientRect();
      const clampedX = Math.max(rect.left, Math.min(rect.right, clientX));
      const xInViewport = clampedX - rect.left;

      const scrollLeft = scrollArea.scrollLeft || 0;
      const xOnRow = scrollLeft + xInViewport;

      // Adjust for track controls offset
      let xOnTimeline = xOnRow - timelineMetrics.leftOffsetPx;

      // Clamp to timeline bounds
      xOnTimeline = Math.max(0, Math.min(timelineMetrics.widthPx, xOnTimeline));

      const ratio =
        timelineMetrics.widthPx > 0 ? xOnTimeline / timelineMetrics.widthPx : 0;

      const ms = ratio * totalLengthMs;
      return Math.round(Math.max(0, Math.min(totalLengthMs, ms)));
    },
    [totalLengthMs, timelineMetrics]
  );

  // Convert milliseconds to X position on timeline
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

  // Clamp zoom value to valid range
  const clampZoom = useCallback((value) => {
    const sanitized = Number.isFinite(value) ? value : 1;
    return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, sanitized)).toFixed(2));
  }, []);

  // Adjust scroll position when zoom changes (anchor around playhead)
  const adjustScrollForZoom = useCallback(
    (prevZoom, nextZoom) => {
      const node = scrollAreaRef.current;
      const lengthMs = Math.max(0, totalLengthMs || 0);
      if (!node || !lengthMs) return;

      const currentWidth = timelineMetrics.widthPx;
      if (!currentWidth || prevZoom === 0) return;

      const ratio = nextZoom / prevZoom;
      if (!Number.isFinite(ratio) || ratio === 1) return;

      const newWidth = currentWidth * ratio;
      const anchorRatio = Math.max(
        0,
        Math.min(1, playheadMsRef.current / lengthMs)
      );
      const deltaPx = anchorRatio * (newWidth - currentWidth);

      const newRowWidth =
        newWidth + timelineMetrics.leftOffsetPx + TRACK_ROW_PADDING;
      const viewportWidth = node.clientWidth || 0;
      const maxScroll = Math.max(0, newRowWidth - viewportWidth);

      const desiredScroll = Math.min(
        Math.max(0, node.scrollLeft + deltaPx),
        maxScroll
      );

      if (Number.isFinite(desiredScroll)) {
        node.scrollLeft = desiredScroll;
      }
    },
    [timelineMetrics.leftOffsetPx, timelineMetrics.widthPx, totalLengthMs]
  );

  // Set zoom with scroll compensation
  const setZoomWithCompensation = useCallback(
    (computeNext) => {
      setZoom((prevZoom) => {
        const desired = computeNext(prevZoom);
        const nextZoom = clampZoom(desired);
        if (nextZoom === prevZoom) {
          return prevZoom;
        }
        adjustScrollForZoom(prevZoom, nextZoom);
        return nextZoom;
      });
    },
    [adjustScrollForZoom, clampZoom]
  );

  // Auto-scroll when follow mode is enabled during playback
  useEffect(() => {
    const unsubscribe = progressStore.subscribe(({ms}) => {
      if (!followPlayhead) return;

      const node = scrollAreaRef.current;
      if (!node) return;

      const lengthMs = Math.max(0, totalLengthMs || 0);
      if (lengthMs === 0 || timelineMetrics.widthPx === 0) return;

      const pxPerMs = timelineMetrics.widthPx / lengthMs;
      const playheadX =
        timelineMetrics.leftOffsetPx +
        Math.max(0, Math.min(ms, lengthMs)) * pxPerMs;

      const viewportWidth = node.clientWidth || 0;
      if (viewportWidth === 0) return;

      // Center playhead in viewport
      const desiredScroll = playheadX - viewportWidth / 2;
      const maxScroll = Math.max(0, timelineMetrics.rowWidthPx - viewportWidth);
      const nextScroll = Math.min(Math.max(0, desiredScroll), maxScroll);

      if (Number.isFinite(nextScroll)) {
        node.scrollLeft = nextScroll;
      }
    });

    return unsubscribe;
  }, [followPlayhead, totalLengthMs, timelineMetrics]);

  // Calculate timeline width based on zoom and available space
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

  // Observe scroll area width for responsive layout
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

  // Check if any tracks exist
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  // Zoom control handlers
  const zoomIn = () => setZoomWithCompensation((z) => z + 0.25);
  const zoomOut = () => setZoomWithCompensation((z) => z - 0.25);
  const resetZoom = () => setZoomWithCompensation(() => 1);
  const toggleFollow = () => setFollowPlayhead((v) => !v);

  // Handle asset drop from library
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const data = e.dataTransfer.getData("application/json");
      if (!data) return;

      const dropData = JSON.parse(data);
      if (dropData.type === "asset" && onAssetDrop) {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left - timelineMetrics.leftOffsetPx;
        const pxPerMs =
          totalLengthMs > 0 ? timelineMetrics.widthPx / totalLengthMs : 0;
        const timelinePositionMs =
          pxPerMs > 0 ? Math.max(0, dropX / pxPerMs) : 0;

        // Determine which track was targeted based on Y position
        const dropY = e.clientY - rect.top;
        const trackHeight = TRACK_HEIGHT_PX;
        const rulerHeight = 40;
        const trackIndex = Math.floor((dropY - rulerHeight) / trackHeight);
        const targetTrackId =
          trackIndex >= 0 && trackIndex < tracks.length
            ? tracks[trackIndex]?.id
            : null;

        onAssetDrop(
          dropData.assetId,
          targetTrackId,
          timelinePositionMs,
          dropData.name
        );
      }
    } catch (err) {
      console.error("Error handling drop:", err);
    }
  };

  // Handle Ctrl/Cmd + drag to create cut range on segment
  const handleTracksMouseDown = (e) => {
    const modifierPressed = e.ctrlKey || e.metaKey;
    if (!(modifierPressed && e.button === 0)) return;

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

    // Find which track the mouse is over
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

    // Use waveform area for highlight positioning
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

    // Find start time and containing segment
    const rawStartMs = msFromClientX(e.clientX);
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

    if (segmentIndex === -1 || !seg) return;

    // Prevent background click after drag
    suppressBackgroundClickRef.current = true;

    const segStartMs =
      seg.startOnTimelineMs ?? Math.round((seg.startOnTimeline ?? 0) * 1000);
    const segDurMs = seg.durationMs ?? Math.round((seg.duration ?? 0) * 1000);
    const segEndMs = segStartMs + Math.max(0, segDurMs);
    const startMs = Math.max(segStartMs, Math.min(segEndMs, rawStartMs));

    // Update selection
    if (typeof setSelectedTrackId === "function") {
      setSelectedTrackId(track.id);
    }
    setSelectedSegment({
      trackId: track.id,
      segmentId: seg.id ?? null,
      segmentIndex,
    });

    // Create cut box
    setCutBox({
      trackId: track.id,
      segmentIndex,
      startMs,
      endMs: startMs,
      isDragging: true,
      topPx: highlightTopPx,
      heightPx: highlightHeightPx,
    });

    // Drag handlers for cut box
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

  // Handle background clicks (deselection)
  const handleScrollAreaClick = (e) => {
    if (suppressBackgroundClickRef.current) {
      suppressBackgroundClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handleBackgroundClick();
  };

  // Apply cut operation to selected segment range
  const handleCutBoxApply = useCallback(() => {
    if (!cutBox || !onCutSegmentRange) return;

    const {trackId, segmentIndex, startMs, endMs} = cutBox;
    if (trackId == null || segmentIndex == null) return;
    if (startMs === endMs) return;

    onCutSegmentRange(trackId, segmentIndex, startMs, endMs);
    setCutBox(null);
  }, [cutBox, onCutSegmentRange]);

  // Enable drag-and-drop for assets
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  // Close background context menu
  const closeBackgroundMenu = useCallback(() => {
    setBackgroundMenu((prev) => (prev.open ? {...prev, open: false} : prev));
  }, []);

  // Close menu on outside click or Escape key
  useEffect(() => {
    if (!backgroundMenu.open) return undefined;

    const handlePointerDown = (event) => {
      if (
        event.target instanceof Node &&
        event.target.closest(".tracklane-context-menu")
      ) {
        return;
      }
      closeBackgroundMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeBackgroundMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [backgroundMenu.open, closeBackgroundMenu]);

  // Show context menu on right-click background
  const handleBackgroundContextMenu = (e) => {
    const isOnTrack = e.target?.closest(".tracklane-root");
    if (isOnTrack) return;

    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 200;
    const menuHeight = 120;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight);

    setBackgroundMenu({open: true, x, y});
  };

  // Create portal for context menu (outside React tree)
  const backgroundMenuPortal =
    backgroundMenu.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="tracklane-context-menu"
            style={{
              top: `${backgroundMenu.y}px`,
              left: `${backgroundMenu.x}px`,
            }}
            role="menu"
          >
            <button
              className={`context-menu-item${
                hasClipboard ? "" : " context-menu-item--disabled"
              }`}
              onClick={() => {
                if (!hasClipboard || !onPasteTrack) return;
                onPasteTrack();
                closeBackgroundMenu();
              }}
              disabled={!hasClipboard || !onPasteTrack}
              role="menuitem"
            >
              Paste
            </button>
          </div>,
          document.body
        )
      : null;

  // Combined clear selection handler
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
      {/* Effects Menu Overlay */}
      {isEffectsMenuOpen && (
        <div className={styles.effectsMenuContainer}>
          <EffectsMenu />
        </div>
      )}

      {/* Main Timeline Scroll Area */}
      <div
        className="timeline-scroll-area"
        ref={scrollAreaRef}
        onClick={handleScrollAreaClick}
        onContextMenu={handleBackgroundContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {hasTracks ? (
          <div className="timeline-stack">
            {/* Timeline Ruler with time markers */}
            <TimelineRuler
              totalLengthMs={totalLengthMs}
              timelineWidth={timelineMetrics.widthPx}
              timelineLeftOffsetPx={timelineMetrics.leftOffsetPx}
            />

            {/* Scrollable Content Container */}
            <div
              className="timeline-scroll-content"
              style={{
                minWidth: `${timelineMetrics.rowWidthPx}px`,
                width: `${timelineMetrics.rowWidthPx}px`,
              }}
            >
              <div
                className="tracks-relative"
                ref={tracksRelativeRef}
                style={{
                  width: `${timelineMetrics.rowWidthPx}px`,
                  position: "relative",
                }}
              >
                {/* Cut Box Overlay (yellow selection) */}
                {cutBox &&
                  (() => {
                    const startX = msToTimelineX(cutBox.startMs);
                    const endX = msToTimelineX(cutBox.endMs);
                    const left = Math.min(startX, endX);
                    const width = Math.max(2, Math.abs(endX - startX));
                    const top = cutBox.topPx ?? 0;
                    const height = cutBox.heightPx ?? TRACK_HEIGHT_PX;

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
                          backgroundColor: "rgba(255, 255, 153, 0.6)",
                          boxSizing: "border-box",
                        }}
                      >
                        {/* Cut button when dragging finished */}
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

                {/* Tracks Container */}
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

            {/* Global Playhead Overlay */}
            <div
              className="global-playhead-overlay"
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
          </div>
        ) : (
          // Empty state when no tracks
          <div className="empty-state" role="status" aria-live="polite">
            Import an audio file
          </div>
        )}
      </div>

      {/* Context Menu Portal */}
      {backgroundMenuPortal}

      {/* Zoom Controls Bar */}
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
