import React from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import TrackLane from "../../components/TrackLane/TrackLane";
import "./MainContent.css";

/**
 * MainContent component for the application layout.
 * Displays all audio tracks with proportional waveform sizing.
 */
function MainContent({ tracks = [], onMute, onSolo, onDelete, totalLengthMs = 0 }) {
  return (
    <DraggableDiv className="maincontent">
      {tracks && tracks.length > 0 ? (
        <div className="tracks-container">
          {tracks.map((track, index) => (
            <div key={track.id} className="track-wrapper">
              <TrackLane
                track={track}
                trackIndex={index}
                totalTracks={tracks.length}
                totalLengthMs={totalLengthMs}
                showTitle={true}
                onMute={onMute}
                onSolo={onSolo}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No Tracks Yet</h2>
          <p>Import an audio file or start recording to add tracks.</p>
        </div>
      )}
    </DraggableDiv>
  );
}

export default MainContent;