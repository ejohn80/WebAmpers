import React, {useState, useEffect} from "react";
import Waveform from "../Waveform/Waveform";
import "./TrackLane.css";

/**
 * TrackLane
 * Renders a single track container and its segments. The visual waveform
 * drawing is delegated to the existing `Waveform` component.
 *
 * props:
 *  - track: AudioTrack object (expected to have `name` and `segments` array)
 *  - showTitle: boolean to control whether to display the track name
 *  - onMute: callback function for mute toggle events
 *  - onSolo: callback function for solo toggle events
 */
function TrackLane({track, showTitle = true, onMute, onSolo}) {
  if (!track) return null;

  const segments = Array.isArray(track.segments) ? track.segments : [];

  /**
   * Get initial state from localStorage with fallback to track props
   * This ensures mute/solo state persists across page refreshes
   */
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

  // Local UI state: keep mute/solo so the buttons reflect user actions
  const [muted, setMuted] = useState(getInitialState().muted);
  const [soloed, setSoloed] = useState(getInitialState().soloed);

  /**
   * Persist state to localStorage whenever mute/solo state changes
   * This ensures the state survives page refreshes
   */
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

  /**
   * Sync UI state with track props when they change externally
   * This handles cases where mute/solo is changed from other components
   */
  useEffect(() => {
    setMuted(!!track.mute);
  }, [track.mute, track.id]);

  useEffect(() => {
    setSoloed(!!track.solo);
  }, [track.solo, track.id]);

  /**
   * Handle mute toggle - updates both UI state and persists to storage
   */
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      onMute && onMute(track.id, next);
    } catch (e) {
      console.warn("Mute toggle failed:", e);
    }
  };

  /**
   * Handle solo toggle - updates both UI state and persists to storage
   */
  const toggleSolo = () => {
    const next = !soloed;
    setSoloed(next);
    try {
      onSolo && onSolo(track.id, next);
    } catch (e) {
      console.warn("Solo toggle failed:", e);
    }
  };

  return (
    <div className="tracklane-root">
      <div className="tracklane-side">
        {showTitle && (
          <div className="tracklane-title">
            {track.name ?? "Untitled Track"}
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
          </div>
        </div>
      </div>

      <div className="tracklane-main">
        <div className="tracklane-segments">
          {segments.length === 0 && (
            <div className="tracklane-empty">
              No segments — import audio to add one.
            </div>
          )}

          {segments.map((seg) => {
            // Prefer an explicit buffer on the segment. If not present, try
            // any buffer reference available on the segment object (many
            // importers attach different shapes). Waveform component is
            // tolerant of Tone/ToneAudioBuffer and native AudioBuffer.
            const audioBuffer = seg.buffer ?? seg.fileBuffer ?? null;

            return (
              <div
                className="tracklane-segment"
                key={seg.id || seg.fileUrl || Math.random()}
              >
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
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TrackLane;
