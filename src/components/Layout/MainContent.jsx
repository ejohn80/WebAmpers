import React from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import GlobalPlayhead from "../Generic/GlobalPlayhead";
import TrackLane from "../../components/TrackLane/TrackLane";
import "./MainContent.css";

/**
 * MainContent component for the application layout.
 * Displays all audio tracks or a placeholder message.
 * @param {object} props
 * @param {Array} props.tracks - Array of all audio tracks
 * @param {Function} props.onMute - Callback for mute toggle
 * @param {Function} props.onSolo - Callback for solo toggle
 * @param {Function} props.onDelete - Callback for track deletion
 * @param {number} props.totalLengthMs - Global timeline length in milliseconds for proportional sizing
 */
function MainContent({ tracks = [], onMute, onSolo, onDelete, totalLengthMs = 0 }) {
  return (
    <DraggableDiv className="maincontent">
      <div className="global-playhead-rail">
        <GlobalPlayhead totalLengthMs={totalLengthMs} />
      </div>
      {tracks && tracks.length > 0 ? (
        <div className="tracks-relative">
          <div className="tracks-container">
          {tracks.map((track, index) => (
            <div key={track.id} className="track-wrapper">
              <TrackLane
                track={track}
                trackIndex={index}
                totalTracks={tracks.length}
                showTitle={true}
                onMute={onMute}
                onSolo={onSolo}
                onDelete={onDelete}
                totalLengthMs={totalLengthMs}
              />
            </div>
          ))}
          </div>
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