import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import AudioImportButton from '../AudioImport/AudioImportButton';
import AudioExportButton from '../AudioExport/AudioExportButton';

/**
 * Header component for the application layout.
 * Displays the header section and includes audio import and export functionality.
 */
function Header({ onImportSuccess, onImportError, audioBuffer, onExportComplete }) {
  return (
    <DraggableDiv color="red">
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        width: '100%' 
      }}>
        <span>**Header** (Red Section)</span>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <AudioImportButton 
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
          />
          <AudioExportButton
            audioBuffer={audioBuffer}
            onExportComplete={onExportComplete}
          />
        </div>
      </div>
    </DraggableDiv>
  );
}

export default Header;