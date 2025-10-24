import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import Waveform from '../Waveform/Waveform';

/**
 * MainContent component for the application layout.
 * Displays the audio waveform or a placeholder message.
 * @param {object} props - The component props.
 * @param {object} props.audioData - The imported audio data object.
 */
function MainContent({ audioData }) {
  return (
    <DraggableDiv color="purple">
      {audioData ? (
        <Waveform audioBuffer={audioData.buffer} />
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

