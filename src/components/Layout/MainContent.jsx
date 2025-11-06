import React, { useContext } from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import TrackLane from "../../components/TrackLane/TrackLane";
import Mock from "../Mock.jsx";
import { AppContext } from "../../context/AppContext";

/**
 * MainContent component for the application layout.
 * Displays the audio waveform or a placeholder message.
 * @param {object} props
 * @param {import('../../models/AudioTrack').AudioTrack} props.track - The currently active audio track.
 */
function MainContent({track, onMute, onSolo}) {

  const { activeProject } = useContext(AppContext);
  console.log(activeProject)

  if (activeProject === "test3") {
    return (
      <Mock />
    );
  }

  return (
    <DraggableDiv className="maincontent">
      {track ? (
        <TrackLane
          track={track}
          showTitle={false}
          onMute={onMute}
          onSolo={onSolo}
        />
      ) : (
        <div style={{ textAlign: "center", alignSelf: "center" }}>
          <h2>Main Content</h2>
          <p>Import an audio file to see its waveform here.</p>
        </div>
      )}
    </DraggableDiv>
  );
}

export default MainContent;
