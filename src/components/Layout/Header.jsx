import DraggableDiv from '../Generic/DraggableDiv';
import { logout } from '../Auth/AuthUtils';
import { useUserData } from '../../hooks/useUserData';
import { useNavigate } from 'react-router-dom';

/**
 * Header component for the application layout.
 * Displays the header section and includes the audio import functionality.
 * @param {object} props - The component props.
 */
function Header({ onImportSuccess, onImportError }) {
  const navigate = useNavigate();
  const { userData, loading } = useUserData();


  return (
    <DraggableDiv color="red">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: '0' }}>
        <span>**Header** (Red Section)</span>
        {userData ? <button onClick={logout}>Log out</button> : <button onClick={() => navigate('/register')}>Login or Register</button>}
      </div>
    </DraggableDiv>
  );
}

export default Header;
