import {PlayIcon, PauseIcon} from "../components/Layout/Svgs.jsx";

const PlayPauseButton = ({isPlaying, onToggle, className = ""}) => {
  return (
    <button
      className={`transport-button play-pause-button ${className}`}
      onClick={onToggle}
      title={isPlaying ? "Pause" : "Play"}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      <div className="play-pause-container">
        {/* Play Icon */}
        <div className={`play-icon ${isPlaying ? "hidden" : "visible"}`}>
          <PlayIcon />
        </div>

        {/* Pause Icon */}
        <div className={`pause-icon ${isPlaying ? "visible" : "hidden"}`}>
          <PauseIcon />
        </div>
      </div>
    </button>
  );
};

export default PlayPauseButton;
