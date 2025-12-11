import React, {useState, useRef, useEffect, useCallback} from "react";
import Waveform from "../Waveform/Waveform";
import {progressStore} from "../../playback/progressStore";
import "./SegmentBlock.css";

// Minimum mouse movement required to start dragging (prevents accidental drags from clicks)
const DRAG_ACTIVATION_THRESHOLD_PX = 3;

/**
 * SegmentBlock - A draggable audio segment within a track lane
 * Displays audio waveform and allows repositioning via drag-and-drop
 */
const SegmentBlock = ({
  segment, // Audio segment data object
  trackColor, // Color for waveform display
  pxPerMs, // Pixels per millisecond for positioning
  totalLengthMs, // Total timeline length in ms
  onSegmentMove, // Callback when segment is moved
  segmentIndex, // Index of this segment in parent array
  isSelected = false, // Whether this segment is currently selected
  onSelect, // Callback when segment is clicked/selected
  onSegmentContextMenu = null, // Right-click context menu handler
}) => {
  // State for drag operation
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0); // Current drag offset in pixels

  // Refs for tracking drag state and values that need persistence
  const dragStartX = useRef(0); // Mouse X position when drag started
  const originalPosition = useRef(0); // Original timeline position in ms
  const segmentRef = useRef(null); // Reference to DOM element
  const pxPerMsRef = useRef(pxPerMs || 0); // Cached pxPerMs value
  const dragPlayheadMsRef = useRef(null); // Saved playhead position during drag
  const onSegmentMoveRef = useRef(onSegmentMove); // Cached move callback

  // Update the move callback ref when prop changes
  useEffect(() => {
    onSegmentMoveRef.current = onSegmentMove;
  }, [onSegmentMove]);

  // Update the pxPerMs ref when prop changes
  useEffect(() => {
    pxPerMsRef.current = pxPerMs || 0;
  }, [pxPerMs]);

  // Extract audio buffer from segment data (supports multiple property names)
  const audioBuffer = segment.buffer ?? segment.fileBuffer ?? null;

  // Calculate segment position and duration with safety bounds
  const startOnTimelineMs = Math.max(0, segment.startOnTimelineMs || 0);
  const durationMs = Math.max(0, segment.durationMs || 0);

  // Debug logging for segment data
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

  // Determine display name for the segment
  const segmentName =
    segment.name || segment.fileName || `Segment ${segmentIndex + 1}`;

  // Start scrub session for audio playback during drag
  const startDragSession = useCallback(() => {
    if (dragPlayheadMsRef.current !== null) return; // Already in drag session

    const savedMs = progressStore.getState().ms;
    dragPlayheadMsRef.current = savedMs; // Save current playhead position

    try {
      // Begin scrubbing mode to pause playback and enable seeking
      progressStore.beginScrub({pauseTransport: true});
      progressStore.setScrubLocked(true); // Lock scrub state
    } catch (err) {
      console.warn("[SegmentBlock] Failed to enter scrub mode:", err);
    }
    setIsDragging(true); // Set dragging flag
  }, []);

  // Handle mouse movement during drag operation
  const handleMouseMove = useCallback(
    (e) => {
      const deltaX = e.clientX - dragStartX.current;

      // Check if we're past the drag activation threshold
      if (dragPlayheadMsRef.current === null) {
        if (Math.abs(deltaX) < DRAG_ACTIVATION_THRESHOLD_PX) {
          return; // Not enough movement yet
        }
        startDragSession(); // Start drag session once threshold crossed
      }

      setDragOffset(deltaX); // Update visual drag offset
    },
    [startDragSession]
  );

  // Clean up scrub session after drag ends
  const finalizeDragPlaybackState = useCallback(() => {
    if (dragPlayheadMsRef.current === null) return;

    const savedMs = dragPlayheadMsRef.current;
    console.log(
      `[SegmentBlock] Finalizing drag, saved playhead was ${savedMs}ms`
    );

    // Restore normal playback state
    progressStore.setScrubLocked(false);
    progressStore.endScrub();
    dragPlayheadMsRef.current = null;

    console.log(`[SegmentBlock] Scrub lock released, endScrub called`);
  }, []);

  // Handle mouse up to finalize drag operation
  const handleMouseUp = useCallback(
    (e) => {
      // Clean up global event listeners
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // If no drag session was started (just a click)
      if (dragPlayheadMsRef.current === null) {
        setIsDragging(false);
        setDragOffset(0);
        return;
      }

      // Calculate new position based on drag distance
      const deltaX = e.clientX - dragStartX.current;
      const currentPxPerMs = pxPerMsRef.current;
      const deltaMs = currentPxPerMs > 0 ? deltaX / currentPxPerMs : 0;
      const newPositionMs = Math.max(0, originalPosition.current + deltaMs);

      // Snap to 10ms grid for finer control
      const snapMs = 10;
      const snappedPositionMs = Math.round(newPositionMs / snapMs) * snapMs;

      // Call move handler if provided
      let movePromise = null;
      const moveHandler = onSegmentMoveRef.current;
      if (moveHandler) {
        try {
          movePromise = moveHandler(segmentIndex, snappedPositionMs);
        } catch (err) {
          console.error("Segment move failed:", err);
        }
      }

      // Reset drag state
      setIsDragging(false);
      setDragOffset(0);

      // Finalize scrub session
      const finish = () => {
        finalizeDragPlaybackState();
      };

      // Handle promise if moveHandler returns one
      if (movePromise && typeof movePromise.finally === "function") {
        movePromise.finally(finish);
      } else {
        finish();
      }
    },
    [handleMouseMove, segmentIndex, finalizeDragPlaybackState]
  );

  // Calculate position style based on pxPerMs or percentage
  let positionStyle;
  let segmentWidthPx = 0;

  if (pxPerMs) {
    // Calculate pixel-based positioning
    const leftPx =
      Math.round(startOnTimelineMs * pxPerMs) + (isDragging ? dragOffset : 0);
    const widthPx = Math.max(2, Math.round(durationMs * pxPerMs));
    segmentWidthPx = widthPx;
    positionStyle = {
      left: `${leftPx}px`,
      width: `${widthPx}px`,
    };
  } else {
    // Fallback to percentage-based positioning
    const leftPercent =
      totalLengthMs > 0 ? (startOnTimelineMs / totalLengthMs) * 100 : 0;
    const widthPercent =
      totalLengthMs > 0 ? (durationMs / totalLengthMs) * 100 : 100;
    positionStyle = {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  }

  // Determine if overlay should be shown based on width
  const showOverlay = segmentWidthPx === 0 || segmentWidthPx >= 60;

  // Handle mouse down to start drag or select segment
  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return; // Only handle left mouse button

      e.preventDefault();
      e.stopPropagation();

      // Select segment if callback provided
      if (onSelect) {
        onSelect(segmentIndex);
      }

      // Initialize drag tracking
      dragStartX.current = e.clientX;
      originalPosition.current = startOnTimelineMs;
      dragPlayheadMsRef.current = null;

      // Add global event listeners for drag tracking
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [handleMouseMove, handleMouseUp, onSelect, segmentIndex, startOnTimelineMs]
  );

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      finalizeDragPlaybackState();
    };
  }, [handleMouseMove, handleMouseUp, finalizeDragPlaybackState]);

  // Build CSS class names based on state
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
        cursor: isDragging ? "grabbing" : "grab", // Change cursor based on drag state
        zIndex: isDragging ? 1000 : 1, // Bring to front when dragging
        opacity: isDragging ? 0.8 : 1, // Slightly transparent when dragging
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
        {/* Segment name overlay - only show if segment is wide enough */}
        {showOverlay && (
          <div
            className="segment-name-overlay"
            style={{
              // Shrink overlay content for narrower segments
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

        <div className="segment-waveform">
          {audioBuffer ? (
            <Waveform
              audioBuffer={audioBuffer}
              color={segment.color || trackColor}
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
