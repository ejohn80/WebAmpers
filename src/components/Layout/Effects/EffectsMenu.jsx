import {useContext} from "react";
import {AppContext} from "../../../context/AppContext";
import styles from "./EffectsMenu.module.css";

function EffectsMenu() {
  const {closeEffectsMenu, addEffect} = useContext(AppContext);

  const availableEffects = [
    {
      id: "pitch",
      name: "PITCH",
      description: "Change the pitch of your audio",
    },
    {
      id: "volume",
      name: "VOLUME",
      description: "Adjust volume levels",
    },
    {
      id: "reverb",
      name: "REVERB",
      description: "Add room ambience",
    },
    {
      id: "delay",
      name: "DELAY",
      description: "Add echo effect",
    },
    {
      id: "bass",
      name: "BASS BOOST",
      description: "Boost or cut low frequencies",
    },
    {
      id: "distortion",
      name: "DISTORTION",
      description: "Add grit and crunch",
    },
    {
      id: "pan",
      name: "PAN",
      description: "Left/right stereo position",
    },
    {
      id: "tremolo",
      name: "TREMOLO",
      description: "Volume oscillation",
    },
    {
      id: "vibrato",
      name: "VIBRATO",
      description: "Pitch oscillation",
    },
    {
      id: "highpass",
      name: "HIGH-PASS FILTER",
      description: "Remove low frequencies",
    },
    {
      id: "lowpass",
      name: "LOW-PASS FILTER",
      description: "Remove high frequencies",
    },
    {
      id: "chorus",
      name: "CHORUS",
      description: "Add shimmer and width",
    },
  ];

  const handleBackgroundClick = (e) => {
    // Close menu when clicking the background overlay
    if (e.target === e.currentTarget) {
      closeEffectsMenu();
    }
  };

  return (
    <div className={styles.effectsMenuOverlay} onClick={handleBackgroundClick}>
      <div className={styles.effectsMenu}>
        <div className={styles.header}>
          <h2>Add Audio Effects</h2>
          <p className={styles.subtitle}>
            Select effects to enhance your audio track
          </p>
        </div>

        <div className={styles.effectsContent}>
          <div className={styles.effectsGrid}>
            {availableEffects.map((effect) => (
              <button
                key={effect.id}
                className={styles.effectCard}
                onClick={() => addEffect(effect.id)}
              >
                <span className={styles.effectName}>{effect.name}</span>
                <span className={styles.effectDescription}>
                  {effect.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={closeEffectsMenu}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default EffectsMenu;
