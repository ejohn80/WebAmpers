import React, { useState, useEffect } from "react";
import Waveform from "../Waveform/Waveform";
import "./TrackLane.css";

/**
 * TrackLane
 * Renders a single track container with proportional waveform sizing
 */
function TrackLane({ 
  track, 
  showTitle = true, 
  onMute, 
  onSolo, 
  onDelete,
  trackIndex = 0,
  totalTracks = 1,
  totalLengthMs = 0 // Total timeline length for proportional sizing
}) {
  if (!track) return null;

  const segments = Array.isArray(track.segments) ? track.segments : [];

  const getInitialState = () => {
    try {
      const saved = localStorage.getItem(`webamp.track.${track.id}`);
      return saved
        ? JSON.parse(saved)
        : { muted: !!track.mute, soloed: !!track.solo };
    } catch (e) {
      return { muted: !!track.mute, soloed: !!track.solo };
    }
  };

  const [muted, setMuted] = useState(getInitialState().muted);
  const [soloed, setSoloed] = useState(getInitialState().soloed);

  useEffect(() => {
    try {
      localStorage.setItem(
        `webamp.track.${track.id}`,
        JSON.stringify({ muted, soloed })
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

  return (
    <div className="tracklane-root">
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

      <div className="tracklane-main">
        {/* Timeline ruler - shows full timeline length */}
        <div className="tracklane-timeline">
          {segments.length === 0 && (
            <div className="tracklane-empty">
              No segments — import audio to add one.
            </div>
          )}

          {segments.map((seg) => {
            const audioBuffer = seg.buffer ?? seg.fileBuffer ?? null;
            
            // Calculate positioning and sizing
            const startOnTimelineMs = seg.startOnTimelineMs || 0;
            const durationMs = seg.durationMs || 0;
            
            // Calculate percentage positions relative to total timeline
            const leftPercent = totalLengthMs > 0 
              ? (startOnTimelineMs / totalLengthMs) * 100 
              : 0;
            const widthPercent = totalLengthMs > 0 
              ? (durationMs / totalLengthMs) * 100 
              : 100;

            return (
              <div
                className="tracklane-segment-positioned"
                key={seg.id || seg.fileUrl || Math.random()}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                  height: '100%'
                }}
              >
                <div className="tracklane-segment">
                  <div className="segment-meta">
                    <div className="segment-name">
                      {seg.id ?? seg.fileUrl ?? "segment"}
                    </div>
                    <div className="segment-duration">
                      {seg.durationMs ? `${Math.round(seg.durationMs)} ms` : ""}
                    </div>
                  </div>

                  <div className="segment-waveform">
                    {audioBuffer ? (
                      <Waveform audioBuffer={audioBuffer} color={track?.color} />
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
  );
}

export default TrackLane;