/**
 * PlayPauseButton - A button component for audio playback control
 *
 * Toggles between play and pause states with appropriate icons and tooltips.
 * Used for controlling audio/music playback
 *
 */

import {FaPlay, FaPause} from "react-icons/fa";

const PlayPauseButton = ({
  isPlaying,
  onToggle,
  className = "",
  disabled = false,
}) => {
  return (
    <button
      className={`transport-button play-pause-button ${className}`}
      onClick={onToggle}
      disabled={disabled}
      // Tooltip text changes based on state
      title={disabled ? "No tracks loaded" : isPlaying ? "Pause" : "Play"}
      aria-label={disabled ? "No tracks loaded" : isPlaying ? "Pause" : "Play"}
    >
      <div className="play-pause-container">
        {/* Play Icon - shown when paused */}
        <div className={`play-icon ${isPlaying ? "hidden" : "visible"}`}>
          <FaPlay />
        </div>

        {/* Pause Icon - shown when playing */}
        <div className={`pause-icon ${isPlaying ? "visible" : "hidden"}`}>
          <FaPause />
        </div>
      </div>
    </button>
  );
};

export default PlayPauseButton;
