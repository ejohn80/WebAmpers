import { logout } from '../Auth/AuthUtils';
import { useUserData } from '../../hooks/useUserData';
import { useNavigate } from 'react-router-dom';
import DropdownPortal from './DropdownPortal';
import './Header.css';

function Header({}) { 
  const navigate = useNavigate();
  const { userData, loading } = useUserData();

  return (
    <div className="header">
      <div className="container">
        {/* container for logo + dropdown */}
        <div className="leftContainer">
          <span className="webampText">Webamp</span>
          <DropdownPortal showMenuButtons={true} showGuestButton={false} />
        </div>
      
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

          {userData ? <button onClick={logout}>Log out</button> : <button onClick={() => navigate('/register')}>Login or Register</button>}
        </div>
      </div>
    </div>
  );
}

export default Header;