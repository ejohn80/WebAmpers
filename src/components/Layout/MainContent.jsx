import React from "react";
import DraggableDiv from "../Generic/DraggableDiv";
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
 */
function MainContent({ tracks = [], onMute, onSolo, onDelete }) {
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