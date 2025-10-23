import { useState, useEffect } from "react";
import styles from "../AuthStyles.module.css";

import { BeatLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
// import AuthRedirect from '../AuthRedirect';
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser,
  sendPasswordResetEmail,
} from "firebase/auth";
// import { db } from '../../../firebase/firebase';
// import { doc, getDoc } from 'firebase/firestore';
import { isValidEmail } from "../AuthUtils";
import { IoMdEye, IoMdEyeOff } from "react-icons/io";

const Login = () => {
  const navigate = useNavigate();

  const [isSpinnerActive, setIsSpinnerActive] = useState(false);
  const [error, setError] = useState("");

  const [inputWidth, setInputWidth] = useState("auto");
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Login button
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSpinnerActive(true);
    const auth = getAuth();

    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      setIsSpinnerActive(false);
      navigate("/");
    } catch (err) {
      setIsSpinnerActive(false);
      if (err.code === "auth/too-many-requests") {
        setError("Too many login attempts. Please try again later.");
      } else {
        setError("Invalid email or password.");
      }
    }
  };

  useEffect(() => {
    const updateWidth = () => {
      const el = document.querySelector(`.${styles.input}`);
      if (el) setInputWidth(`${el.offsetWidth}px`);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return (
    <div
      className={styles.wrapper}
      style={{ backgroundImage: `url('/soundwave.jpg')` }}
    >
      <div className={styles.container}>
        {/* <img className={styles.logo} src="/logo.png" alt=" Logo" /> */}
        <h1>WebAmp</h1>
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
          <div style={{ position: "relative" }}>
            <input
              className={`${styles.input} ${styles.passwordInput}`}
              style={{ width: inputWidth }}
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              onChange={handleChange}
              required
            />
            <span
              onClick={() => setShowPassword((prev) => !prev)}
              className={styles.passwordToggleIcon}
            >
              {showPassword ? (
                <IoMdEyeOff color="black" size={22} />
              ) : (
                <IoMdEye color="black" size={22} />
              )}
            </span>
          </div>
          <button type="submit" className={styles.button}>
            {isSpinnerActive ? (
              <BeatLoader color="#f0f0f0" size={12} />
            ) : (
              "Login"
            )}
          </button>
        </form>
        <div className={styles.signIn}>
          Don't have an account? Sign up{" "}
          <span onClick={() => navigate("/register")}>here</span>
          <br />
          <div style={{ marginTop: "5px" }}>
            Forgot password? Reset{" "}
            <span onClick={() => navigate("/reset-password")}>here</span>
          </div>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
};

export default Login;
