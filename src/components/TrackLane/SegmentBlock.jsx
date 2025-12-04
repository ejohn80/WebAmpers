import React, {useState, useRef, useEffect} from "react";
import Waveform from "../Waveform/Waveform";
import "./SegmentBlock.css";

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
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef(0);
  const originalPosition = useRef(0);
  const segmentRef = useRef(null);
  const pxPerMsRef = useRef(pxPerMs || 0);

  useEffect(() => {
    pxPerMsRef.current = pxPerMs || 0;
  }, [pxPerMs]);

  const audioBuffer = segment.buffer ?? segment.fileBuffer ?? null;
  const startOnTimelineMs = Math.max(0, segment.startOnTimelineMs || 0);
  const durationMs = Math.max(0, segment.durationMs || 0);

  const handleMouseMove = (e) => {
    const deltaX = e.clientX - dragStartX.current;
    setDragOffset(deltaX);
  };

  const handleMouseUp = (e) => {
    const deltaX = e.clientX - dragStartX.current;
    const currentPxPerMs = pxPerMsRef.current;
    const deltaMs = currentPxPerMs > 0 ? deltaX / currentPxPerMs : 0;
    const newPositionMs = Math.max(0, originalPosition.current + deltaMs);

    // Snap to 10ms grid for finer control
    const snapMs = 10;
    const snappedPositionMs = Math.round(newPositionMs / snapMs) * snapMs;

    if (onSegmentMove) {
      onSegmentMove(segmentIndex, snappedPositionMs);
    }

    setIsDragging(false);
    setDragOffset(0);

    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // Calculate position style
  let positionStyle;
  if (pxPerMs) {
    const leftPx = Math.round(startOnTimelineMs * pxPerMs) + (isDragging ? dragOffset : 0);
    const widthPx = Math.max(2, Math.round(durationMs * pxPerMs));
    positionStyle = {
      left: `${leftPx}px`,
      width: `${widthPx}px`,
    };
  } else {
    const leftPercent =
      totalLengthMs > 0
        ? (startOnTimelineMs / totalLengthMs) * 100
        : 0;
    const widthPercent =
      totalLengthMs > 0 ? (durationMs / totalLengthMs) * 100 : 100;
    positionStyle = {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  }

  const handleMouseDown = (e) => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    // Prevent default to avoid text selection
    e.preventDefault();
    e.stopPropagation();

    // Select this segment
    if (onSelect) {
      onSelect(segmentIndex);
    }

    // Start dragging
    setIsDragging(true);
    dragStartX.current = e.clientX;
    originalPosition.current = startOnTimelineMs;

    // Add global listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
    >
      <div className="tracklane-segment">
        <div className="segment-waveform">
          {audioBuffer ? (
            <Waveform
              audioBuffer={audioBuffer}
              color={trackColor}
              startOnTimelineMs={startOnTimelineMs}
              durationMs={durationMs}
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
