import React, {useState, useEffect, memo} from "react";
import {createPortal} from "react-dom";
import Waveform from "../Waveform/Waveform";
import "./TrackLane.css";

/**
 * TrackLane
 * Renders a single track container with proportional waveform sizing
 */
const TrackLane = memo(function TrackLane({
  track,
  showTitle = true,
  onMute,
  onSolo,
  onDelete,
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
}) {
  if (!track) return null;

  const segments = Array.isArray(track.segments) ? track.segments : [];

  const getInitialState = () => {
    try {
      const saved = localStorage.getItem(`webamp.track.${track.id}`);
      return saved
        ? JSON.parse(saved)
        : {muted: !!track.mute, soloed: !!track.solo};
    } catch (e) {
      return {muted: !!track.mute, soloed: !!track.solo};
    }
  };

  const [muted, setMuted] = useState(getInitialState().muted);
  const [soloed, setSoloed] = useState(getInitialState().soloed);
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });

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

  useEffect(() => {
    setMuted(!!track.mute);
  }, [track.mute, track.id]);

  useEffect(() => {
    setSoloed(!!track.solo);
  }, [track.solo, track.id]);

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
  }, [contextMenu.open]);

  const closeContextMenu = () => {
    setContextMenu({open: false, x: 0, y: 0});
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Select this track when opening the context menu
    onSelect?.(track.id);

    // Menu dimensions for boundary checking
    const menuWidth = 180;
    const menuHeight = 220;

    // Calculate position ensuring menu stays within viewport
    // Use clientX/Y which are viewport-relative coordinates
    const x = Math.max(
      10,
      Math.min(
        event.clientX,
        window.innerWidth - menuWidth - 10 // 10px margin
      )
    );
    const y = Math.max(
      10,
      Math.min(
        event.clientY,
        window.innerHeight - menuHeight - 10 // 10px margin
      )
    );

    setContextMenu({open: true, x, y});
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      onMute && onMute(track.id, next);
    } catch (e) {
      console.warn("Mute toggle failed:", e);
    }
  };

  const toggleSolo = () => {
    const next = !soloed;
    setSoloed(next);
    try {
      onSolo && onSolo(track.id, next);
    } catch (e) {
      console.warn("Solo toggle failed:", e);
    }
  };

  const handleDelete = () => {
    try {
      onDelete && onDelete(track.id);
    } catch (e) {
      console.warn("Delete failed:", e);
    }
  };

  const handleMenuAction = (action, disabled) => {
    if (disabled) return;
    if (typeof action === "function") {
      action();
    }
    closeContextMenu();
  };

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

  const handleTrackClick = (e) => {
    e.stopPropagation();
    onSelect(track.id);
  };

  const selectionStyle = isSelected
    ? {
        outline: "2px solid #17E1FF",
        outlineOffset: "-2px",
        backgroundColor: "rgba(23, 225, 255, 0.05)",
      }
    : {};

  // Render context menu using portal to avoid clipping issues
  const contextMenuPortal = contextMenu.open
    ? createPortal(
        <div
          className="tracklane-context-menu"
          style={{
            position: "fixed",
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          role="menu"
        >
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
          <div className="context-menu-divider" />
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
          <div className="context-menu-divider" />
          <button
            className="context-menu-item context-menu-item--danger"
            onClick={() => handleMenuAction(handleDelete)}
            role="menuitem"
          >
            Delete
          </button>
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
          {showTitle && (
            <div className="tracklane-header">
              <div className="tracklane-title">
                {track.name ?? "Untitled Track"}
              </div>
              <div className="tracklane-track-number">
                Track {trackIndex + 1} of {totalTracks}
              </div>
            </div>
          )}

          <div className="tracklane-controls-box">
            <div className="tracklane-controls">
              <button
                className={`tl-btn tl-btn-mute ${muted ? "tl-btn--active" : ""}`}
                onClick={toggleMute}
                aria-pressed={muted}
                title={muted ? "Unmute track" : "Mute track"}
              >
                {muted ? "Muted" : "Mute"}
              </button>

              <button
                className={`tl-btn tl-btn-solo ${soloed ? "tl-btn--active" : ""}`}
                onClick={toggleSolo}
                aria-pressed={soloed}
                title={soloed ? "Unsolo track" : "Solo track"}
              >
                {soloed ? "Soloed" : "Solo"}
              </button>

              <div className="tracklane-divider" />

              <button
                className="tl-btn tl-btn-delete"
                onClick={handleDelete}
                title="Delete track"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="tracklane-main" style={tracklaneMainStyle}>
          <div className="tracklane-timeline" style={tracklaneTimelineStyle}>
            {segments.length === 0 && (
              <div className="tracklane-empty">
                No segments – import audio to add one.
              </div>
            )}

            {segments.map((seg) => {
              const audioBuffer = seg.buffer ?? seg.fileBuffer ?? null;

              const startOnTimelineMs = Math.max(0, seg.startOnTimelineMs || 0);
              const durationMs = Math.max(0, seg.durationMs || 0);

              let positionStyle;
              if (pxPerMs) {
                const leftPx = Math.round(startOnTimelineMs * pxPerMs);
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

              return (
                <div
                  className="tracklane-segment-positioned"
                  key={seg.id || seg.fileUrl || Math.random()}
                  style={{
                    position: "absolute",
                    height: "100%",
                    ...positionStyle,
                  }}
                >
                  <div className="tracklane-segment">
                    <div className="segment-waveform">
                      {audioBuffer ? (
                        <Waveform
                          audioBuffer={audioBuffer}
                          color={track?.color}
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
            })}
          </div>
        </div>
      </div>

      {contextMenuPortal}
    </>
  );
});

export default TrackLane;
