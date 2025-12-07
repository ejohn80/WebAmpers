import React, {useState, useRef, useEffect, useCallback} from "react";
import Waveform from "../Waveform/Waveform";
import {progressStore} from "../../playback/progressStore";
import "./SegmentBlock.css";

const DRAG_ACTIVATION_THRESHOLD_PX = 3;

/**
 * SegmentBlock - A draggable audio segment within a track lane
 */
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef(0);
  const originalPosition = useRef(0);
  const segmentRef = useRef(null);
  const pxPerMsRef = useRef(pxPerMs || 0);
  const dragPlayheadMsRef = useRef(null);
  const onSegmentMoveRef = useRef(onSegmentMove);

  useEffect(() => {
    onSegmentMoveRef.current = onSegmentMove;
  }, [onSegmentMove]);

  useEffect(() => {
    pxPerMsRef.current = pxPerMs || 0;
  }, [pxPerMs]);

  const audioBuffer = segment.buffer ?? segment.fileBuffer ?? null;
  const startOnTimelineMs = Math.max(0, segment.startOnTimelineMs || 0);
  const durationMs = Math.max(0, segment.durationMs || 0);

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

  const segmentName =
    segment.name || segment.fileName || `Segment ${segmentIndex + 1}`;

  const startDragSession = useCallback(() => {
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
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      const deltaX = e.clientX - dragStartX.current;

      if (dragPlayheadMsRef.current === null) {
        if (Math.abs(deltaX) < DRAG_ACTIVATION_THRESHOLD_PX) {
          return;
        }
        startDragSession();
      }

      setDragOffset(deltaX);
    },
    [startDragSession]
  );

  const finalizeDragPlaybackState = useCallback(() => {
    if (dragPlayheadMsRef.current === null) return;

    const savedMs = dragPlayheadMsRef.current;
    console.log(
      `[SegmentBlock] Finalizing drag, saved playhead was ${savedMs}ms`
    );

    progressStore.setScrubLocked(false);
    progressStore.endScrub();
    dragPlayheadMsRef.current = null;

    console.log(`[SegmentBlock] Scrub lock released, endScrub called`);
  }, []);

  const handleMouseUp = useCallback(
    (e) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (dragPlayheadMsRef.current === null) {
        // Click without dragging; no position change or scrub session
        setIsDragging(false);
        setDragOffset(0);
        return;
      }

      const deltaX = e.clientX - dragStartX.current;
      const currentPxPerMs = pxPerMsRef.current;
      const deltaMs = currentPxPerMs > 0 ? deltaX / currentPxPerMs : 0;
      const newPositionMs = Math.max(0, originalPosition.current + deltaMs);

      // Snap to 10ms grid for finer control
      const snapMs = 10;
      const snappedPositionMs = Math.round(newPositionMs / snapMs) * snapMs;

      let movePromise = null;
      const moveHandler = onSegmentMoveRef.current;
      if (moveHandler) {
        try {
          movePromise = moveHandler(segmentIndex, snappedPositionMs);
        } catch (err) {
          console.error("Segment move failed:", err);
        }
      }

      setIsDragging(false);
      setDragOffset(0);

      const finish = () => {
        finalizeDragPlaybackState();
      };

      if (movePromise && typeof movePromise.finally === "function") {
        movePromise.finally(finish);
      } else {
        finish();
      }
    },
    [handleMouseMove, segmentIndex, finalizeDragPlaybackState]
  );

  // Calculate position style
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

  // Determine if overlay should be shown based on width
  const showOverlay = segmentWidthPx === 0 || segmentWidthPx >= 60;

  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      if (onSelect) {
        onSelect(segmentIndex);
      }

      dragStartX.current = e.clientX;
      originalPosition.current = startOnTimelineMs;
      dragPlayheadMsRef.current = null;

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [handleMouseMove, handleMouseUp, onSelect, segmentIndex, startOnTimelineMs]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      finalizeDragPlaybackState();
    };
  }, [handleMouseMove, handleMouseUp, finalizeDragPlaybackState]);

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
