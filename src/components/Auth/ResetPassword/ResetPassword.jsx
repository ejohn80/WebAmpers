import {useState} from "react";
import styles from "../AuthStyles.module.css";

import {BeatLoader} from "react-spinners";
import {useNavigate} from "react-router-dom";
import {getAuth, sendPasswordResetEmail} from "firebase/auth";
import {isValidEmail} from "../AuthUtils";
import {IoArrowBack} from "react-icons/io5";

const ResetPassword = () => {
  const navigate = useNavigate(); // Navigation hook for routing

  const [isSpinnerActive, setIsSpinnerActive] = useState(false); // Loading state
  const [error, setError] = useState(""); // Error message state

  const [formData, setFormData] = useState({
    email: "", // Single form field for email
  });

  // Handle input changes and update form state
  const handleChange = (e) => {
    setFormData((prev) => ({...prev, [e.target.name]: e.target.value}));
  };

  // Handle form submission - send password reset email
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSpinnerActive(true);
    const auth = getAuth(); // Get Firebase auth instance

    try {
      await sendPasswordResetEmail(auth, formData.email);
      alert("Password reset email sent");
      navigate("/login"); // Redirect to login after successful submission
    } catch {
      setError("Error, please try later");
    } finally {
      setIsSpinnerActive(false); // Always turn off spinner
    }
  };

  return (
    <div
      className={styles.wrapper}
      style={{backgroundImage: `url('/soundwave.jpg')`}} // Background image
    >
      <div className={styles.container}>
        {/* Back navigation button */}
        <button className={styles.backArrow} onClick={() => navigate(-1)}>
          <IoArrowBack />
        </button>
        {/* Logo commented out but available if needed */}
        {/* <img className={styles.logo} src="/logo.png" alt="Logo" /> */}
        <h1>Reset Password</h1>

        {/* Reset password form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            className={styles.input}
            onChange={handleChange}
            onBlur={(e) => {
              // Validate email on blur
              if (e.target.value && !isValidEmail(e.target.value)) {
                setError("Please enter a valid email address.");
              } else {
                setError("");
              }
            }}
            required
          />
          <button type="submit" className={styles.button}>
            {/* Show spinner during loading, otherwise show text */}
            {isSpinnerActive ? (
              <BeatLoader color="#f0f0f0" size={12} />
            ) : (
              "Submit"
            )}
          </button>
        </form>

        {/* Display error message if present */}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
};

export default ResetPassword;
