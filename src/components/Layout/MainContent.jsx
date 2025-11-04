import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import TrackLane from '../../components/TrackLane/TrackLane';

/**
 * MainContent component for the application layout.
 * Displays the audio waveform or a placeholder message.
 * @param {object} props
 * @param {import('../../models/AudioTrack').AudioTrack} props.track - The currently active audio track.
 */
function MainContent({ track, onMute, onSolo }) {
  return (
    <DraggableDiv color="purple">
      {track ? (
        // Delegate rendering to the TrackLane which is responsible for
        // rendering track segments and waveform visualizations.
        // Hide the title when rendered inside MainContent so naming
        // doesn't appear in the central view.
        <TrackLane track={track} showTitle={false} onMute={onMute} onSolo={onSolo} />
      ) : (
        <div style={{ textAlign: 'center', alignSelf: 'center' }}>
          <h2>Main Content</h2>
          <p>Import an audio file to see its waveform here.</p>
        </div>
      )}
    </DraggableDiv>
  );
}

export default MainContent;
