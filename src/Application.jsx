import styles from './Application.module.css';
import { useNavigate } from 'react-router-dom';
import { useUserData } from './hooks/useUserData';
import { logout } from './components/Auth/AuthUtils';

const Application = () => {
  const navigate = useNavigate();
  const { userData, loading } = useUserData();

  if (loading) return <p>Loading...</p>;

  return <div>
    <h3>{userData?.username ? `Hello, ${userData.username}!`: 'Hello there!'}</h3>
    {userData ? <button onClick={logout}>Log out</button> : <button onClick={() => navigate('/register')}>Login or Register</button>}<br /><br /><br />
  </div>;
};

export default Application;