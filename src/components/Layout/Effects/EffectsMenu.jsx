import {useContext} from "react";
import {AppContext} from "../../../context/AppContext";
import styles from "./EffectsMenu.module.css";

function EffectsMenu() {
  const {closeEffectsMenu, addEffect, activeEffects} = useContext(AppContext);

  const availableEffects = [
    {
      id: "bass",
      name: "BASS BOOST",
      description: "Boost or cut low frequencies",
    },
    {
      id: "chorus",
      name: "CHORUS",
      description: "Add shimmer and width",
    },
    {
      id: "delay",
      name: "DELAY",
      description: "Add echo effect",
    },
    {
      id: "distortion",
      name: "DISTORTION",
      description: "Add grit and crunch",
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
      id: "pan",
      name: "PAN",
      description: "Left/right stereo position",
    },
    {
      id: "pitch",
      name: "PITCH",
      description: "Change the pitch of your audio",
    },
    {
      id: "reverb",
      name: "REVERB",
      description: "Add room ambience",
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
      id: "volume",
      name: "VOLUME",
      description: "Adjust volume levels",
    },
  ];

  const handleBackgroundClick = (e) => {
    // Close menu when clicking the background overlay
    if (e.target === e.currentTarget) {
      closeEffectsMenu();
    }
  };

  // Helper to check if effect is already added
  const isEffectActive = (effectId) => activeEffects.includes(effectId);

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
            {availableEffects.map((effect) => {
              const isActive = isEffectActive(effect.id);
              return (
                <button
                  key={effect.id}
                  // 2. Conditionally apply a disabled class
                  className={`${styles.effectCard} ${
                    isActive ? styles.effectCardDisabled : ""
                  }`}
                  onClick={() => addEffect(effect.id)}
                  // 3. Disable the button
                  disabled={isActive}
                >
                  <span className={styles.effectName}>{effect.name}</span>
                  <span className={styles.effectDescription}>
                    {effect.description}
                  </span>
                </button>
              );
            })}
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
