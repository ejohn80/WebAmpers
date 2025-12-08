/**
 * Footer Component
 *
 * Main application footer containing recording controls and transport/playback.
 * Fixed-position bar at bottom with two sections: recording and playback.
 *
 * @param {Object} props
 * @param {string} props.version - Application version for display
 * @param {function} props.onRecordComplete - Callback when recording finishes
 * @param {function} props.onRecordStart - Callback when recording starts
 * @param {function} props.onRecordStop - Callback when recording stops
 */

import React from "react";
import WebAmpPlayback from "../../playback/playback.jsx";
import RecorderButton from "../Recording/RecorderButton";
import "./Footer.css";

function Footer({version, onRecordComplete, onRecordStart, onRecordStop}) {
  return (
    <div className="footer">
      <div className="footer-container">
        {/* Left section: Recording controls with RecorderButton component */}
        <div className="footer-section footer-recording-section">
          <RecorderButton
            onComplete={onRecordComplete}
            onStart={onRecordStart}
            onStop={onRecordStop}
          />
        </div>

        {/* Right section: Playback transport controls with WebAmpPlayback */}
        <div className="footer-section footer-transport-section">
          <WebAmpPlayback version={version} />
        </div>
      </div>
    </div>
  );
}

export default Footer;
