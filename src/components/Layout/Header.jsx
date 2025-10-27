import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import AudioImportButton from '../AudioImport/AudioImportButton';
import { logout } from '../Auth/AuthUtils';
import { useUserData } from '../../hooks/useUserData';
import { useNavigate } from 'react-router-dom';

/**
 * Header component for the application layout.
 * Displays the header section and includes the audio import functionality.
 * @param {object} props - The component props.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 */
function Header({ onImportSuccess, onImportError }) {
  const navigate = useNavigate();
  const { userData, loading } = useUserData();


  return (
    <DraggableDiv color="red">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: '0' }}>
        <span>**Header** (Red Section)</span>
        <AudioImportButton 
          onImportSuccess={onImportSuccess}
          onImportError={onImportError}
        />
        {userData ? <button onClick={logout}>Log out</button> : <button onClick={() => navigate('/register')}>Login or Register</button>}
      </div>
    </DraggableDiv>
  );
}

export default Header;
