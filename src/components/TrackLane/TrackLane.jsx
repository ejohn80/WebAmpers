/**
 * TrackLane.jsx
 *
 * Main timeline track component that handles:
 * - Track controls (mute, solo, delete)
 * - Segment display and positioning
 * - Drag & drop for adding audio assets
 * - Context menus for track/segment actions
 * - Visual selection and drop previews
 *
 * Manages a single track row in the DAW timeline.
 */

import React, {useState, useEffect, memo, useCallback, useRef} from "react";
import {createPortal} from "react-dom";
import SegmentBlock from "./SegmentBlock";
import "./TrackLane.css";
import {resolveSegmentStart} from "../../utils/segmentPlacement";

// Helper to create context menu state
const createContextMenuState = (overrides = {}) => ({
  open: false,
  x: 0,
  y: 0,
  target: "track", // 'track' or 'segment'
  segmentIndex: null,
  segmentId: null,
  ...overrides,
});

/**
 * TrackLane - Single track row in the timeline
 */
const TrackLane = memo(function TrackLane({
  track,
  onMute,
  onSolo,
  onDelete,
  onSegmentMove,
  onAssetDrop,
  requestAssetPreview,
  onCutTrack,
  onCopyTrack,
  onPasteTrack,
  hasClipboard = false,
  trackIndex = 0,
  totalTracks = 1,
  totalLengthMs = 0,
  timelineWidth = 0,
  rowWidthPx = 0,
  isSelected = false,
  onSelect = () => {},
  selectedSegment = null,
  onSegmentSelected = () => {},
  onClearSegmentSelection = () => {},
  onSegmentDelete = () => {},
}) {
  // State
  const segments = Array.isArray(track.segments) ? track.segments : [];
  const [muted, setMuted] = useState(!!track.mute);
  const [soloed, setSoloed] = useState(!!track.solo);
  const [contextMenu, setContextMenu] = useState(createContextMenuState());
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
  const [dropPreview, setDropPreview] = useState(null); // Drag & drop preview

  // Refs
  const dragHoverDepthRef = useRef(0); // Track nested drag enters
  const pendingPreviewAssetRef = useRef(null); // Asset currently loading
  const segmentsRef = useRef(segments); // Current segments reference

  // Update ref when segments change
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // Persist mute/solo state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        `webamp.track.${track.id}`,
        JSON.stringify({muted, soloed})
      );
    } catch (e) {
      console.warn("Failed to persist track state:", e);
    }
  }, [muted, soloed, track.id]);

  // Sync with external track state changes
  useEffect(() => {
    setMuted(!!track.mute);
  }, [track.mute, track.id]);

  useEffect(() => {
    setSoloed(!!track.solo);
  }, [track.solo, track.id]);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(createContextMenuState());
  }, []);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu.open) return undefined;

    const handlePointerDown = (event) => {
      if (
        event.target instanceof Node &&
        event.target.closest(".tracklane-context-menu")
      ) {
        return;
      }
      closeContextMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu.open, closeContextMenu]);

  // Open context menu at position
  const openContextMenuAt = (event, overrides = {}) => {
    event.preventDefault();
    event.stopPropagation();

    // Select this track when opening menu
    onSelect?.(track.id);

    const menuWidth = 200;
    const menuHeight = 220;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight);

    setContextMenu(createContextMenuState({open: true, x, y, ...overrides}));
  };

  // Track context menu handler
  const handleContextMenu = (event) => {
    openContextMenuAt(event, {target: "track"});
  };

  // Segment context menu handler
  const handleSegmentContextMenu = (segmentIndex, event) => {
    const segment = segments[segmentIndex];
    if (!segment) return;

    // Select the segment
    if (typeof onSegmentSelected === "function") {
      onSegmentSelected(track.id, segment?.id ?? null, segmentIndex);
    }
    setSelectedSegmentIndex(segmentIndex);

    openContextMenuAt(event, {
      target: "segment",
      segmentIndex,
      segmentId: segment?.id ?? null,
    });
  };

  // Delete segment from context menu
  const handleSegmentDeleteAction = async () => {
    if (contextMenu.segmentIndex === null) return;

    try {
      await onSegmentDelete(
        track.id,
        contextMenu.segmentId,
        contextMenu.segmentIndex
      );
      setSelectedSegmentIndex(null);
      if (typeof onClearSegmentSelection === "function") {
        onClearSegmentSelection();
      }
    } catch (error) {
      console.warn("Segment delete failed:", error);
    } finally {
      closeContextMenu();
    }
  };

  // Mute toggle
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      onMute && onMute(track.id, next);
    } catch (e) {
      console.warn("Mute toggle failed:", e);
    }
  };

  // Solo toggle
  const toggleSolo = () => {
    const next = !soloed;
    setSoloed(next);
    try {
      onSolo && onSolo(track.id, next);
    } catch (e) {
      console.warn("Solo toggle failed:", e);
    }
  };

  // Delete track
  const handleDelete = () => {
    try {
      onDelete && onDelete(track.id);
    } catch (e) {
      console.warn("Delete failed:", e);
    }
  };

  // Handle menu item click
  const handleMenuAction = (action, disabled) => {
    if (disabled) return;
    if (typeof action === "function") {
      action();
    }
    closeContextMenu();
  };

  // Calculate pixel-per-millisecond ratio
  const parsedTimelineWidth =
    typeof timelineWidth === "number"
      ? timelineWidth
      : Number.parseFloat(timelineWidth ?? "");
  const numericTimelineWidth = Number.isFinite(parsedTimelineWidth)
    ? Math.max(0, parsedTimelineWidth)
    : 0;

  const pxPerMs =
    totalLengthMs > 0 && numericTimelineWidth > 0
      ? numericTimelineWidth / totalLengthMs
      : null;

  // CSS styles for sizing
  const tracklaneMainStyle =
    numericTimelineWidth > 0
      ? {
          width: `${numericTimelineWidth}px`,
          minWidth: `${numericTimelineWidth}px`,
        }
      : undefined;
  const tracklaneTimelineStyle =
    numericTimelineWidth > 0 ? {width: `${numericTimelineWidth}px`} : undefined;

  const rowWidthStyle =
    rowWidthPx > 0
      ? {minWidth: `${rowWidthPx}px`, width: `${rowWidthPx}px`}
      : undefined;

  // Track click handler
  const handleTrackClick = (e) => {
    e.stopPropagation();
    if (typeof onClearSegmentSelection === "function") {
      onClearSegmentSelection();
    }
    setSelectedSegmentIndex(null);
    onSelect(track.id);
  };

  // Visual selection style
  const selectionStyle = isSelected
    ? {
        outline: "2px solid #17E1FF",
        outlineOffset: "-2px",
        backgroundColor: "rgba(23, 225, 255, 0.05)",
      }
    : {};

  // Extract drag asset data from event
  const getDragAssetFromEvent = useCallback((event) => {
    if (event?.dataTransfer) {
      try {
        const payload = event.dataTransfer.getData("application/json");
        if (payload) {
          const parsed = JSON.parse(payload);
          if (parsed?.type === "asset") {
            return parsed;
          }
        }
      } catch {
        // Ignore malformed payloads
      }
    }

    if (typeof window !== "undefined" && window.__WEBAMP_DRAG_ASSET__) {
      return window.__WEBAMP_DRAG_ASSET__;
    }

    return null;
  }, []);

  // Load asset duration for drop preview
  const ensurePreviewDuration = useCallback(
    (assetId) => {
      if (!assetId || typeof requestAssetPreview !== "function") {
        return;
      }

      if (pendingPreviewAssetRef.current === assetId) {
        return;
      }

      pendingPreviewAssetRef.current = assetId;
      requestAssetPreview(assetId)
        .then((info) => {
          setDropPreview((prev) => {
            if (!prev || prev.assetId !== assetId) return prev;

            const safeDuration = Number.isFinite(info?.durationMs)
              ? Math.max(0, Math.round(info.durationMs))
              : 0;

            if (!safeDuration) {
              return {...prev, isLoadingDuration: false};
            }

            const rawStart =
              prev.rawStartOnTimelineMs ?? prev.startOnTimelineMs ?? 0;
            const latestSegments = segmentsRef.current ?? segments;
            const resolved = resolveSegmentStart(
              latestSegments,
              rawStart,
              safeDuration
            );
            const snapMs = 10;
            const snapped = Math.round(resolved / snapMs) * snapMs;

            return {
              ...prev,
              durationMs: safeDuration,
              isLoadingDuration: false,
              startOnTimelineMs: snapped,
            };
          });
        })
        .catch((error) => {
          console.error("Failed to fetch asset preview:", error);
          setDropPreview((prev) =>
            prev && prev.assetId === assetId
              ? {...prev, isLoadingDuration: false}
              : prev
          );
        })
        .finally(() => {
          if (pendingPreviewAssetRef.current === assetId) {
            pendingPreviewAssetRef.current = null;
          }
        });
    },
    [requestAssetPreview, segments]
  );

  // Format duration for display
  const formatDurationLabel = (ms) => {
    if (!ms) return "";
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  // Clear drop preview state
  const clearDropPreview = useCallback(() => {
    dragHoverDepthRef.current = 0;
    pendingPreviewAssetRef.current = null;
    setDropPreview(null);
  }, []);

  // Calculate timeline position from mouse event
  const getTimelinePositionFromEvent = (event) => {
    const timelineElement = event.currentTarget;
    if (!timelineElement) return 0;

    const rect = timelineElement.getBoundingClientRect();
    const dropX = event.clientX - rect.left;
    const pxPerMsValue = pxPerMs && Number.isFinite(pxPerMs) ? pxPerMs : 0;
    return pxPerMsValue > 0 ? Math.max(0, dropX / pxPerMsValue) : 0;
  };

  // Update drop preview during drag
  const updateDropPreview = useCallback(
    (event, assetData) => {
      if (!assetData) return;

      const rawMs = getTimelinePositionFromEvent(event);

      dragHoverDepthRef.current = Math.max(dragHoverDepthRef.current, 1);

      setDropPreview((prev) => {
        const sameAsset = prev && prev.assetId === assetData.assetId;
        const existingDuration =
          (sameAsset && prev.durationMs) || assetData.durationMs || 0;
        const durationMs = Number.isFinite(existingDuration)
          ? Math.max(0, Math.round(existingDuration))
          : 0;
        const resolvedMs = resolveSegmentStart(segments, rawMs, durationMs);
        const snapMs = 10;
        const snappedMs = Math.round(resolvedMs / snapMs) * snapMs;
        return {
          assetId: assetData.assetId,
          assetName: assetData.name,
          rawStartOnTimelineMs: rawMs,
          startOnTimelineMs: snappedMs,
          durationMs,
          isLoadingDuration: durationMs === 0,
        };
      });

      ensurePreviewDuration(assetData.assetId);
    },
    [segments, pxPerMs, ensurePreviewDuration]
  );

  // Clear drop preview when track changes
  useEffect(() => {
    clearDropPreview();
  }, [track.id, clearDropPreview]);

  // Move segment handler
  const handleSegmentMove = (segmentIndex, newPositionMs) => {
    console.log(`Moving segment ${segmentIndex} to ${newPositionMs}ms`);
    if (onSegmentMove) {
      return onSegmentMove(track.id, segmentIndex, newPositionMs);
    }
    return null;
  };

  // Segment selection handler
  const handleSegmentSelect = (segmentIndex) => {
    setSelectedSegmentIndex(segmentIndex);
    const segment = segments[segmentIndex];
    if (typeof onSegmentSelected === "function") {
      onSegmentSelected(track.id, segment?.id ?? null, segmentIndex);
    }
    onSelect(track.id);
  };

  // Sync selected segment with external state
  useEffect(() => {
    if (!selectedSegment || selectedSegment.trackId !== track.id) {
      if (selectedSegmentIndex !== null) {
        setSelectedSegmentIndex(null);
      }
      return;
    }

    const matchIndex = segments.findIndex((segment, index) => {
      if (!segment) return false;
      if (selectedSegment.segmentId) {
        return segment.id === selectedSegment.segmentId;
      }
      return selectedSegment.segmentIndex === index;
    });

    const nextIndex = matchIndex >= 0 ? matchIndex : null;
    if (nextIndex !== selectedSegmentIndex) {
      setSelectedSegmentIndex(nextIndex);
    }
  }, [selectedSegment, track.id, segments, selectedSegmentIndex]);

  // Drag & drop handlers
  const handleTimelineDragEnter = (e) => {
    if (!getDragAssetFromEvent(e)) return;
    dragHoverDepthRef.current += 1;
  };

  const handleTimelineDragLeave = () => {
    if (dragHoverDepthRef.current > 0) {
      dragHoverDepthRef.current -= 1;
    }
    if (dragHoverDepthRef.current <= 0) {
      clearDropPreview();
    }
  };

  const handleTimelineDragOver = (e) => {
    const assetData = getDragAssetFromEvent(e);
    if (!assetData) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";

    updateDropPreview(e, assetData);
  };

  const handleTimelineDrop = (e) => {
    const assetData = getDragAssetFromEvent(e);
    if (!assetData || typeof onAssetDrop !== "function") {
      clearDropPreview();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const snapMs = 10;
    const fallbackStart = resolveSegmentStart(
      segments,
      getTimelinePositionFromEvent(e),
      dropPreview && dropPreview.assetId === assetData.assetId
        ? dropPreview.durationMs
        : 0
    );
    const snappedFallback = Math.round(fallbackStart / snapMs) * snapMs;

    const startMs =
      dropPreview && dropPreview.assetId === assetData.assetId
        ? dropPreview.startOnTimelineMs
        : snappedFallback;

    console.log(`Asset dropped on track ${track.id} at ${startMs}ms`);

    onAssetDrop(
      assetData.assetId,
      track.id,
      Math.max(0, startMs),
      assetData.name
    );
    clearDropPreview();
  };

  // Context menu portal (renders outside component tree)
  const contextMenuPortal =
    contextMenu.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="tracklane-context-menu"
            style={{top: `${contextMenu.y}px`, left: `${contextMenu.x}px`}}
            role="menu"
          >
            {contextMenu.target === "segment" && (
              <>
                <div className="context-menu-section-title">Segment</div>
                <button
                  className="context-menu-item context-menu-item--danger"
                  onClick={handleSegmentDeleteAction}
                  role="menuitem"
                >
                  Delete Segment
                </button>
                <div className="context-menu-divider" />
              </>
            )}
            <div className="context-menu-section-title">Track</div>
            <div className="context-menu-stack">
              <button
                className="context-menu-item"
                onClick={() => handleMenuAction(toggleMute)}
                role="menuitem"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                className="context-menu-item"
                onClick={() => handleMenuAction(toggleSolo)}
                role="menuitem"
              >
                {soloed ? "Unsolo" : "Solo"}
              </button>
              <button
                className={`context-menu-item${
                  onCutTrack ? "" : " context-menu-item--disabled"
                }`}
                onClick={() => handleMenuAction(onCutTrack, !onCutTrack)}
                role="menuitem"
                disabled={!onCutTrack}
              >
                Cut
              </button>
              <button
                className={`context-menu-item${
                  onCopyTrack ? "" : " context-menu-item--disabled"
                }`}
                onClick={() => handleMenuAction(onCopyTrack, !onCopyTrack)}
                role="menuitem"
                disabled={!onCopyTrack}
              >
                Copy
              </button>
              <button
                className={`context-menu-item${
                  hasClipboard ? "" : " context-menu-item--disabled"
                }`}
                onClick={() => handleMenuAction(onPasteTrack, !hasClipboard)}
                role="menuitem"
                disabled={!hasClipboard}
              >
                Paste
              </button>
              <button
                className="context-menu-item context-menu-item--danger"
                onClick={() => handleMenuAction(handleDelete)}
                role="menuitem"
              >
                Delete Track
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        className="tracklane-root"
        style={{...rowWidthStyle, ...selectionStyle}}
        onClick={handleTrackClick}
        onContextMenu={handleContextMenu}
      >
        <div className="tracklane-side">
          <div className="tracklane-controls-box">
            <div className="tracklane-controls">
              <div className="tracklane-track-number">
                Track {trackIndex + 1} of {totalTracks}
              </div>
              <button
                className={`tl-btn tl-btn-audio ${muted ? "tl-btn--active" : ""}`}
                onClick={toggleMute}
                aria-pressed={muted}
                title={muted ? "Unmute track" : "Mute track"}
              >
                {"MUTE"}
              </button>

              <button
                className={`tl-btn tl-btn-audio ${soloed ? "tl-btn--active" : ""}`}
                onClick={toggleSolo}
                aria-pressed={soloed}
                title={soloed ? "Unsolo track" : "Solo track"}
              >
                {"SOLO"}
              </button>

              <button
                className="tl-btn tl-btn-delete"
                onClick={handleDelete}
                title="Delete track"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>

        <div className="tracklane-main" style={tracklaneMainStyle}>
          <div
            className={`tracklane-timeline ${dropPreview ? "tracklane-timeline--drop" : ""}`}
            style={tracklaneTimelineStyle}
            data-narrow={
              numericTimelineWidth > 0 && numericTimelineWidth < 200
                ? "true"
                : undefined
            }
            data-medium={
              numericTimelineWidth >= 200 && numericTimelineWidth < 400
                ? "true"
                : undefined
            }
            onDragEnter={handleTimelineDragEnter}
            onDragLeave={handleTimelineDragLeave}
            onDragOver={handleTimelineDragOver}
            onDrop={handleTimelineDrop}
          >
            {/* Empty state */}
            {segments.length === 0 && (
              <div className="tracklane-empty">
                No segments — import audio or drag assets here to add segments.
              </div>
            )}

            {/* Drop preview overlay */}
            {dropPreview && (
              <div
                className={`tracklane-drop-preview ${dropPreview.isLoadingDuration ? "loading" : ""}`}
                style={(() => {
                  const startPx = pxPerMs
                    ? Math.round(dropPreview.startOnTimelineMs * pxPerMs)
                    : totalLengthMs > 0
                      ? `${(dropPreview.startOnTimelineMs / totalLengthMs) * 100}%`
                      : 0;
                  const widthPx =
                    pxPerMs && dropPreview.durationMs
                      ? Math.max(
                          4,
                          Math.round(dropPreview.durationMs * pxPerMs)
                        )
                      : totalLengthMs > 0 && dropPreview.durationMs
                        ? `${(dropPreview.durationMs / totalLengthMs) * 100}%`
                        : 80;

                  if (
                    typeof startPx === "number" &&
                    typeof widthPx === "number"
                  ) {
                    return {left: `${startPx}px`, width: `${widthPx}px`};
                  }

                  return {
                    left: typeof startPx === "string" ? startPx : "0%",
                    width: typeof widthPx === "string" ? widthPx : "10%",
                  };
                })()}
              >
                <div className="drop-preview-label">
                  {dropPreview.assetName || "New segment"}
                </div>
                <div className="drop-preview-duration">
                  {dropPreview.isLoadingDuration
                    ? "Loading…"
                    : formatDurationLabel(dropPreview.durationMs)}
                </div>
              </div>
            )}

            {/* Render segments */}
            {segments.map((seg, index) => (
              <SegmentBlock
                key={seg.id || seg.fileUrl || `segment-${index}`}
                segment={seg}
                trackColor={track?.color}
                pxPerMs={pxPerMs}
                totalLengthMs={totalLengthMs}
                onSegmentMove={handleSegmentMove}
                segmentIndex={index}
                isSelected={selectedSegmentIndex === index}
                onSelect={handleSegmentSelect}
                onSegmentContextMenu={handleSegmentContextMenu}
              />
            ))}
          </div>
        </div>
      </div>
      {contextMenuPortal}
    </>
  );
});

export default TrackLane;
