import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import Waveform from '../Waveform/Waveform';

/**
 * MainContent component for the application layout.
 * Displays the audio waveform or a placeholder message.
 * @param {object} props
 * @param {import('../../models/AudioTrack').AudioTrack} props.track - The currently active audio track.
 */
function MainContent({ track }) {
  const audioBuffer = track && track.segments.length > 0 ? track.segments[0].buffer : null;

  return (
    <DraggableDiv color="purple">
      {audioBuffer ? (
        <Waveform audioBuffer={audioBuffer} />
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
