/**
 * SegmentBlock Component
 *
 * Draggable audio segment block within a track lane.
 * Displays waveform, name overlay, and handles drag/resize operations.
 * Integrates with playback scrub mode for visual feedback during drag.
 */

import React, {useState, useRef, useEffect} from "react";
import Waveform from "../Waveform/Waveform";
import {progressStore} from "../../playback/progressStore";
import "./SegmentBlock.css";

// Minimum mouse movement to initiate drag (prevents accidental drags)
const DRAG_ACTIVATION_THRESHOLD_PX = 3;

const SegmentBlock = ({
  segment,
  trackColor,
  pxPerMs,
  totalLengthMs,
  onSegmentMove,
  segmentIndex,
  isSelected = false,
  onSelect,
  onSegmentContextMenu = null,
}) => {
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef(0);
  const originalPosition = useRef(0);
  const segmentRef = useRef(null);
  const pxPerMsRef = useRef(pxPerMs || 0);
  const dragPlayheadMsRef = useRef(null); // For playback scrubbing during drag

  // Update pixels-per-millisecond reference
  useEffect(() => {
    pxPerMsRef.current = pxPerMs || 0;
  }, [pxPerMs]);

  // Extract segment audio data
  const audioBuffer = segment.buffer ?? segment.fileBuffer ?? null;
  const startOnTimelineMs = Math.max(0, segment.startOnTimelineMs || 0);
  const durationMs = Math.max(0, segment.durationMs || 0);

  // Debug segment properties
  useEffect(() => {
    console.log(`[SegmentBlock ${segmentIndex}] Segment data:`, {
      id: segment.id,
      name: segment.name,
      fileName: segment.fileName,
      assetId: segment.assetId,
      hasName: !!segment.name,
      hasFileName: !!segment.fileName,
      allKeys: Object.keys(segment),
    });
  }, [segment, segmentIndex]);

  // Determine display name (prefer custom name, then filename, then generic)
  const segmentName =
    segment.name || segment.fileName || `Segment ${segmentIndex + 1}`;

  /**
   * Start drag session and enable playback scrubbing
   */
  const startDragSession = () => {
    if (dragPlayheadMsRef.current !== null) return;

    const savedMs = progressStore.getState().ms;
    dragPlayheadMsRef.current = savedMs;
    try {
      progressStore.beginScrub({pauseTransport: true});
      progressStore.setScrubLocked(true);
    } catch (err) {
      console.warn("[SegmentBlock] Failed to enter scrub mode:", err);
    }
    setIsDragging(true);
  };

  /**
   * Handle mouse movement during drag
   * Activates drag after threshold is crossed
   */
  const handleMouseMove = (e) => {
    const deltaX = e.clientX - dragStartX.current;

    // Check if we've crossed the activation threshold
    if (dragPlayheadMsRef.current === null) {
      if (Math.abs(deltaX) < DRAG_ACTIVATION_THRESHOLD_PX) {
        return;
      }
      startDragSession();
    }

    setDragOffset(deltaX);
  };

  /**
   * Restore playback state after drag completes
   */
  const finalizeDragPlaybackState = () => {
    if (dragPlayheadMsRef.current === null) return;

    const savedMs = dragPlayheadMsRef.current;
    console.log(
      `[SegmentBlock] Finalizing drag, saved playhead was ${savedMs}ms`
    );

    progressStore.setScrubLocked(false);
    progressStore.endScrub();
    dragPlayheadMsRef.current = null;

    console.log(`[SegmentBlock] Scrub lock released, endScrub called`);
  };

  /**
   * Handle mouse up - finalize drag position and apply movement
   */
  const handleMouseUp = (e) => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    // No drag session was started (click only)
    if (dragPlayheadMsRef.current === null) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    // Calculate new position in milliseconds
    const deltaX = e.clientX - dragStartX.current;
    const currentPxPerMs = pxPerMsRef.current;
    const deltaMs = currentPxPerMs > 0 ? deltaX / currentPxPerMs : 0;
    const newPositionMs = Math.max(0, originalPosition.current + deltaMs);

    // Snap to 10ms grid for cleaner positioning
    const snapMs = 10;
    const snappedPositionMs = Math.round(newPositionMs / snapMs) * snapMs;

    // Call parent handler for segment movement
    let movePromise = null;
    if (onSegmentMove) {
      try {
        movePromise = onSegmentMove(segmentIndex, snappedPositionMs);
      } catch (err) {
        console.error("Segment move failed:", err);
      }
    }

    // Reset drag state
    setIsDragging(false);
    setDragOffset(0);

    // Restore playback state
    const finish = () => {
      finalizeDragPlaybackState();
    };

    if (movePromise && typeof movePromise.finally === "function") {
      movePromise.finally(finish);
    } else {
      finish();
    }
  };

  /**
   * Calculate segment position and width based on timeline scale
   */
  let positionStyle;
  let segmentWidthPx = 0;

  if (pxPerMs) {
    const leftPx =
      Math.round(startOnTimelineMs * pxPerMs) + (isDragging ? dragOffset : 0);
    const widthPx = Math.max(2, Math.round(durationMs * pxPerMs));
    segmentWidthPx = widthPx;
    positionStyle = {
      left: `${leftPx}px`,
      width: `${widthPx}px`,
    };
  } else {
    const leftPercent =
      totalLengthMs > 0 ? (startOnTimelineMs / totalLengthMs) * 100 : 0;
    const widthPercent =
      totalLengthMs > 0 ? (durationMs / totalLengthMs) * 100 : 100;
    positionStyle = {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  }

  // Only show name overlay if segment is wide enough (>= 60px)
  const showOverlay = segmentWidthPx === 0 || segmentWidthPx >= 60;

  /**
   * Handle mouse down - start drag tracking
   */
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click

    e.preventDefault();
    e.stopPropagation();

    // Select segment
    if (onSelect) {
      onSelect(segmentIndex);
    }

    // Initialize drag state
    dragStartX.current = e.clientX;
    originalPosition.current = startOnTimelineMs;
    dragPlayheadMsRef.current = null;

    // Add global mouse listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Cleanup global listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      finalizeDragPlaybackState();
    };
  }, []);

  // Dynamic segment class names
  const segmentClassName = `tracklane-segment-positioned ${
    isDragging ? "dragging" : ""
  } ${isSelected ? "selected" : ""}`;

  return (
    <div
      ref={segmentRef}
      className={segmentClassName}
      style={{
        position: "absolute",
        height: "100%",
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: isDragging ? 1000 : 1,
        opacity: isDragging ? 0.8 : 1,
        ...positionStyle,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={
        onSegmentContextMenu
          ? (e) => onSegmentContextMenu(segmentIndex, e)
          : undefined
      }
    >
      <div className="tracklane-segment">
        {/* Segment name overlay (conditionally shown) */}
        {showOverlay && (
          <div
            className="segment-name-overlay"
            style={{
              // Adjust styling for narrow segments
              ...(segmentWidthPx > 0 && segmentWidthPx < 100
                ? {
                    padding: "3px 6px",
                    fontSize: "10px",
                  }
                : {}),
            }}
          >
            <div className="segment-name">{segmentName}</div>
          </div>
        )}

        {/* Waveform display */}
        <div className="segment-waveform">
          {audioBuffer ? (
            <Waveform
              audioBuffer={audioBuffer}
              color={trackColor}
              startOnTimelineMs={segment.startOnTimelineMs ?? 0}
              durationMs={
                segment.durationMs ?? Math.round((segment.duration || 0) * 1000)
              }
              startInFileMs={segment.startInFileMs ?? 0}
              showProgress={false}
            />
          ) : (
            <div className="waveform-placeholder">
              (No buffer available for this segment)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SegmentBlock;
