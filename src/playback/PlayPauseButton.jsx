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
      title={disabled ? "No tracks loaded" : isPlaying ? "Pause" : "Play"}
      aria-label={disabled ? "No tracks loaded" : isPlaying ? "Pause" : "Play"}
    >
      <div className="play-pause-container">
        {/* Play Icon */}
        <div className={`play-icon ${isPlaying ? "hidden" : "visible"}`}>
          <FaPlay />
        </div>

        {/* Pause Icon */}
        <div className={`pause-icon ${isPlaying ? "visible" : "hidden"}`}>
          <FaPause />
        </div>
      </div>
    </button>
  );
};

export default PlayPauseButton;
