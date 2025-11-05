import React from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import WebAmpPlayback from "../../playback/playback.jsx";
import RecorderButton from "../Recording/RecorderButton";

/**
 * Footer component for the application layout.
 */
function Footer({version, onRecordComplete, onRecordStart, onRecordStop}) {
  return (
    <DraggableDiv color="lime">
      <div style={{display: "flex", alignItems: "center", width: "100%"}}>
        {/* Left: Recording control */}
        <div style={{width: 160, display: "flex", alignItems: "center"}}>
          <RecorderButton
            onComplete={onRecordComplete}
            onStart={onRecordStart}
            onStop={onRecordStop}
          />
        </div>
        {/* Center/Right: Transport and volume */}
        <div style={{flex: 1}}>
          <WebAmpPlayback version={version} />
        </div>
      </div>
    </DraggableDiv>
  );
}

export default Footer;
