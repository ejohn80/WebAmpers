import React from "react";
import usePlaybackEngine from "../../playback/usePlaybackEngine";
import PlayIcon from "../../assets/footer/PlayButton.svg";
import PauseIcon from "../../assets/footer/PauseButton.svg";
import RewindIcon from "../../assets/footer/RewindButton.svg";
import ForwardIcon from "../../assets/footer/FastForwardButton.svg";
import GoToStartIcon from "../../assets/footer/GoToStartButton.svg";
import SoundOnIcon from "../../assets/footer/SoundOnButton.svg";
import SoundOffIcon from "../../assets/footer/SoundOffButton.svg";
import VolumeKnob from "../../assets/footer/VolumeKnob.svg";

export default function PlaybackUI({version}) {
  const {
    playing,
    ms,
    masterVol,
    muted,
    toggleMute,
    togglePlay,
    setMasterVolumePercent,
    skipBack10,
    skipFwd10,
    goToStart,
  } = usePlaybackEngine({version});

  // Global spacebar handler: toggle play/pause unless the user is typing
  React.useEffect(() => {
    const isEditableTarget = (el) => {
      if (!el || el === document.body) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      // Treat role="textbox" as editable as well
      const role = el.getAttribute?.("role");
      if (role && role.toLowerCase() === "textbox") return true;
      // Some inputs can be non-text; allow space for range to not toggle playback when focused
      if (tag === "input") {
        const type = (el.getAttribute?.("type") || "").toLowerCase();
        const textLike = [
          "text",
          "search",
          "password",
          "email",
          "number",
          "url",
          "tel",
          "date",
          "time",
          "datetime-local",
          "month",
          "week",
          "range",
        ];
        if (textLike.includes(type)) return true;
      }
      return false;
    };

    const onKeyDown = (e) => {
      // Ignore when modifiers are pressed or key is repeating
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      // If user is focused in an editable control, don't hijack keys
      if (isEditableTarget(e.target)) return;

      const isSpace = e.code === "Space" || e.key === " ";
      const isLeft = e.code === "ArrowLeft" || e.key === "ArrowLeft";
      const isRight = e.code === "ArrowRight" || e.key === "ArrowRight";

      if (isSpace) {
        e.preventDefault();
        togglePlay();
      } else if (isLeft) {
        e.preventDefault();
        skipBack10();
      } else if (isRight) {
        e.preventDefault();
        skipFwd10();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, skipBack10, skipFwd10]);

  const fmtTime = (tMs) => {
    const t = Math.max(0, Math.floor((tMs || 0) / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: "100%",
        width: "100%",
        gap: 12,
        boxSizing: "border-box",
      }}
    >
      <div style={{flex: 1}} />

      <div style={{display: "flex", alignItems: "center", gap: 12}}>
        <button
          onClick={goToStart}
          title="Go to start"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
          }}
        >
          <img
            src={GoToStartIcon}
            alt="Go to start"
            style={{height: 26, display: "block"}}
          />
        </button>
        <code
          style={{
            fontSize: 12,
            opacity: 0.85,
            minWidth: 80,
            textAlign: "right",
          }}
        >
          {fmtTime(ms)}
          {typeof version?.lengthMs === "number" && version.lengthMs > 0
            ? ` / ${fmtTime(version.lengthMs)}`
            : ""}
        </code>
        <button
          onClick={skipBack10}
          title="Back 10s"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
          }}
        >
          <img
            src={RewindIcon}
            alt="Rewind 10 seconds"
            style={{height: 26, display: "block"}}
          />
        </button>
        {playing ? (
          <button
            type="button"
            onClick={togglePlay}
            title="Pause"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
            }}
            aria-label="Pause"
          >
            <img
              src={PauseIcon}
              alt="Pause"
              style={{height: 26, display: "block"}}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={togglePlay}
            title="Play"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
            }}
            aria-label="Play"
          >
            <img
              src={PlayIcon}
              alt="Play"
              style={{height: 26, display: "block"}}
            />
          </button>
        )}
        <button
          onClick={skipFwd10}
          title="Forward 10s"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
          }}
        >
          <img
            src={ForwardIcon}
            alt="Forward 10 seconds"
            style={{height: 26, display: "block"}}
          />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
          }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <img
            src={muted ? SoundOffIcon : SoundOnIcon}
            alt={muted ? "Muted" : "Sound on"}
            style={{height: 26, display: "block"}}
          />
        </button>

        <div
          style={{
            position: "relative",
            width: 160,
            height: 28,
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Master volume"
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 10,
              background: "#CDF8FF",
              borderRadius: 100,
              transform: "translateY(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${masterVol}%`,
              top: "50%",
              height: 10,
              background: "#17E1FF",
              borderRadius: 100,
              transform: "translateY(-50%)",
            }}
          />
          <img
            src={VolumeKnob}
            alt="Volume knob"
            style={{
              position: "absolute",
              left: `${masterVol}%`,
              top: "50%",
              transform: `translate(-50%, -40%)`,
              height: 26,
              width: 26,
              pointerEvents: "none",
            }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={masterVol}
            onChange={(e) => setMasterVolumePercent(e.target.value)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: 28,
              opacity: 0,
              cursor: "pointer",
            }}
          />
        </div>
      </div>
    </div>
  );
}
