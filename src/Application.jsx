// Application component for user authentication status display
//import styles from "./Application.module.css";
import {useNavigate} from "react-router-dom";
import {useUserData} from "./hooks/useUserData";
import {logout} from "./components/Auth/AuthUtils";

const Application = () => {
  const navigate = useNavigate();
  const {userData, loading} = useUserData();

  if (loading) return <p>Loading...</p>; // Show loading state

  return (
    <div>
      {/* Display personalized greeting if user is logged in */}
      <h3>
        {userData?.username ? `Hello, ${userData.username}!` : "Hello there!"}
      </h3>
      {/* Conditional rendering based on authentication status */}
      {userData ? (
        <button onClick={logout}>Log out</button> // Logout button for authenticated users
      ) : (
        <button onClick={() => navigate("/register")}>Login or Register</button> // Auth button for guests
      )}
      <br />
      <br />
      <br />
    </div>
  );
};

export default Application;
