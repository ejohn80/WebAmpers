import {StrictMode, useEffect} from "react";
import {createRoot} from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import * as Tone from "tone";

export function Root() {
  useEffect(() => {
    const onFirstInteract = async () => {
      try {
        await Tone.start();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", onFirstInteract, {once: true});
    window.addEventListener("keydown", onFirstInteract, {once: true});
    return () => {
      window.removeEventListener("pointerdown", onFirstInteract);
      window.removeEventListener("keydown", onFirstInteract);
    };
  }, []);
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
