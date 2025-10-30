import { useContext } from 'react';

import DraggableDiv from '../Generic/DraggableDiv';
import { logout } from '../Auth/AuthUtils';
import { useNavigate } from 'react-router-dom';

import { AppContext } from '../../context/AppContext';

/**
 * Header component for the application layout.
 * Displays the header section and includes the audio import functionality.
 * @param {object} props - The component props.
 */
function Header({ onImportSuccess, onImportError }) {
  const navigate = useNavigate();

  const { userData, activeProject } = useContext(AppContext);



  return (
    <DraggableDiv color="red">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: '0' }}>
        <span>**Header** (Red Section)</span>
        <span>{activeProject}</span>
        {userData ? <button onClick={logout}>Log out</button> : <button onClick={() => navigate('/register')}>Login or Register</button>}
      </div>
    </DraggableDiv>
  );
}

export default Header;
