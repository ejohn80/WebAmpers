import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import AudioImportButton from '../AudioImport/AudioImportButton';

/**
 * Header component for the application layout.
 * Displays the header section and includes the audio import functionality.
 * @param {object} props - The component props.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 */
function Header({ onImportSuccess, onImportError }) {
  return (
    <DraggableDiv color="red">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span>**Header** (Red Section)</span>
        <AudioImportButton 
          onImportSuccess={onImportSuccess}
          onImportError={onImportError}
        />
      </div>
    </DraggableDiv>
  );
}

export default Header;
