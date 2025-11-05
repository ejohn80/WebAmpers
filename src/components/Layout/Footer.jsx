import React from "react";
import WebAmpPlayback from "../../playback/playback.jsx";
import RecorderButton from "../Recording/RecorderButton";
import "./Footer.css";

function Footer({version, onRecordComplete, onRecordStart, onRecordStop}) {
  return (
    <div className="footer">
      <div className="footer-container">
        {/* Left: Recording control */}
        <div className="footer-section footer-recording-section">
          <RecorderButton
            onComplete={onRecordComplete}
            onStart={onRecordStart}
            onStop={onRecordStop}
          />
        </div>

        {/* Center: Transport controls (includes volume) */}
        <div className="footer-section footer-transport-section">
          <WebAmpPlayback version={version} />
        </div>

        {/* Right: Empty or remove this section since volume is in WebAmpPlayback */}
        <div className="footer-section footer-volume-section">
          {/* Volume controls are handled in WebAmpPlayback component */}
        </div>
      </div>
    </div>
  );
}

export default Footer;
