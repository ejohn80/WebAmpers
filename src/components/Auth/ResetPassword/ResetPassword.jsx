import {useState} from "react";
import styles from "../AuthStyles.module.css";

import {BeatLoader} from "react-spinners";
import {useNavigate} from "react-router-dom";
import {getAuth, sendPasswordResetEmail} from "firebase/auth";
import {isValidEmail} from "../AuthUtils";
import {IoArrowBack} from "react-icons/io5";

const ResetPassword = () => {
  const navigate = useNavigate();

  const [isSpinnerActive, setIsSpinnerActive] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    email: "",
  });

  const handleChange = (e) => {
    setFormData((prev) => ({...prev, [e.target.name]: e.target.value}));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSpinnerActive(true);
    const auth = getAuth();

    try {
      await sendPasswordResetEmail(auth, formData.email);
      alert("Password reset email sent");
      navigate("/login");
    } catch {
      setError("Error, please try later");
    } finally {
      setIsSpinnerActive(false);
    }
  };

  return (
    <div
      className={styles.wrapper}
      style={{backgroundImage: `url('/soundwave.jpg')`}}
    >
      <div className={styles.container}>
        <button className={styles.backArrow} onClick={() => navigate(-1)}>
          <IoArrowBack />
        </button>
        {/* <img className={styles.logo} src="/logo.png" alt="Logo" /> */}
        <h1>Reset Password</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            className={styles.input}
            onChange={handleChange}
            onBlur={(e) => {
              if (e.target.value && !isValidEmail(e.target.value)) {
                setError("Please enter a valid email address.");
              } else {
                setError("");
              }
            }}
            required
          />
          <button type="submit" className={styles.button}>
            {isSpinnerActive ? (
              <BeatLoader color="#f0f0f0" size={12} />
            ) : (
              "Submit"
            )}
          </button>
        </form>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
};

export default ResetPassword;
