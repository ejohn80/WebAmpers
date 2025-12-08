import {StrictMode, useEffect} from "react";
import {createRoot} from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import * as Tone from "tone";

// Root wrapper component to handle Tone.js audio context initialization
export function Root() {
  useEffect(() => {
    // Function to start Tone.js audio context on first user interaction
    const onFirstInteract = async () => {
      try {
        await Tone.start(); // Required for audio playback in modern browsers
      } catch {
        /* ignore errors silently */
      }
    };
    // Attach event listeners for first interaction (pointer or keyboard)
    window.addEventListener("pointerdown", onFirstInteract, {once: true});
    window.addEventListener("keydown", onFirstInteract, {once: true});
    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("pointerdown", onFirstInteract);
      window.removeEventListener("keydown", onFirstInteract);
    };
  }, []);
  return <App />;
}

// Render application with React 18's createRoot API
createRoot(document.getElementById("root")).render(
  // StrictMode enables additional React development checks
  <StrictMode>
    <Root />
  </StrictMode>
);
