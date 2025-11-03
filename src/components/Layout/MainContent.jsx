import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import Waveform from '../Waveform/Waveform';
import LiveWaveform from '../Waveform/LiveWaveform';

/**
 * MainContent component for the application layout.
 * Displays the audio waveform or a placeholder message.
 * @param {object} props
 * @param {import('../../models/AudioTrack').AudioTrack} props.track - The currently active audio track.
 */
function MainContent({ track, recording }) {
  const audioBuffer = track && track.segments.length > 0 ? track.segments[0].buffer : null;

  return (
    <DraggableDiv color="purple">
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {audioBuffer ? (
          <Waveform audioBuffer={audioBuffer} />
        ) : (
          <div style={{ textAlign: 'center', alignSelf: 'center' }}>
            <h2>Main Content</h2>
            <p>Import an audio file to see its waveform here.</p>
          </div>
        )}
        {recording?.stream ? (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <LiveWaveform stream={recording.stream} startTs={recording.startTs} />
          </div>
        ) : null}
      </div>
    </DraggableDiv>
  );
}

export default MainContent;
