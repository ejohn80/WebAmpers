import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import AudioImportButton from '../AudioImport/AudioImportButton';
import { logout } from '../Auth/AuthUtils';
import { useUserData } from '../../hooks/useUserData';
import { useNavigate } from 'react-router-dom';
import DropdownPortal from './DropdownPortal';
import './Header.css';

function Header({ onImportSuccess, onImportError }) {
  const navigate = useNavigate();
  const { userData, loading } = useUserData();

  return (
    <div className="header">
      <div className="container">
        {/* container for logo + dropdown */}
        <div className="leftContainer">
          <span className="webampText">Webamp</span>
          <DropdownPortal />
        </div>
      
        <div style={{ display: 'flex', alignItems: 'right', gap: '15px' }}>
          <AudioImportButton 
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
          />
          {userData ? (
            <button onClick={logout}>Log out</button>
          ) : (
            <button onClick={() => navigate('/register')}>Login or Register</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Header;