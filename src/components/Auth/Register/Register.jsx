import {useState, useEffect} from "react";
import {useNavigate, useLocation} from "react-router-dom";
import {BeatLoader} from "react-spinners";
import styles from "../AuthStyles.module.css";

import {auth, db} from "../../../firebase/firebase";
// import AuthRedirect from '../AuthRedirect';
import {createUserWithEmailAndPassword} from "firebase/auth";
import {isValidEmail} from "../AuthUtils";
import {doc, setDoc} from "firebase/firestore";
import {IoMdEye, IoMdEyeOff} from "react-icons/io";

const Register = () => {
  const navigate = useNavigate();
  // For transferring data from login (account not found)
  const location = useLocation();

  const [error, setError] = useState(location.state?.msg || "");
  const [isSpinnerActive, setIsSpinnerActive] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [inputWidth, setInputWidth] = useState("auto");

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    const {name, value} = e.target;
    setFormData((prev) => ({...prev, [name]: value}));

    if (name === "email") {
      if (value && isValidEmail(value)) {
        setError(""); // Clear error as soon as it's valid
      }
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsSpinnerActive(true);

    try {
      const {email, password, username} = formData;

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Store extra info in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        username,
        email,
        createdAt: new Date(),
      });

      navigate("/");
    } catch (err) {
      if (err.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (err.code === "auth/email-already-in-use") {
        setError("Email address already in use");
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters");
      } else {
        setError(err.message);
      }
    } finally {
      setIsSpinnerActive(false);
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
      style={{backgroundImage: `url('/soundwave.jpg')`}}
    >
      {/* <AuthRedirect /> */}
      <div className={styles.container}>
        {/* <img className={styles.logo} src="/Logo.png" alt="Logo" /> */}
        <h1>WebAmp</h1>
        <form className={styles.form} onSubmit={handleRegister}>
          <input
            name="username"
            type="text"
            placeholder="Username"
            maxLength={100}
            className={styles.input}
            onChange={handleChange}
            required
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            maxLength={100}
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
          <div style={{position: "relative"}}>
            <input
              className={`${styles.input} ${styles.passwordInput}`}
              style={{width: inputWidth}}
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
              "Register"
            )}
          </button>
        </form>
        <div className={styles.signIn}>
          Already have an account? Sign in{" "}
          <span onClick={() => navigate("/login", {replace: true})}>here</span>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
};

export default Register;
