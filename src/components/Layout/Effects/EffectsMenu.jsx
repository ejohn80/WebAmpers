/**
 * EffectsMenu Component
 *
 * Menu for adding audio effects to the selected track.
 * Shows list of available effects, disabled effects already added.
 * Uses AppContext to manage effect state and menu visibility.
 */

import {useContext} from "react";
import {AppContext} from "../../../context/AppContext";
import styles from "./EffectsMenu.module.css";

function EffectsMenu() {
  // Access context for effect management and menu control
  const {closeEffectsMenu, addEffect, activeEffects} = useContext(AppContext);

  // Available audio effects with descriptions
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

  /**
   * Close menu when clicking outside the modal content
   * @param {Event} e - Click event
   */
  const handleBackgroundClick = (e) => {
    if (e.target === e.currentTarget) {
      closeEffectsMenu();
    }
  };

  /**
   * Check if an effect is already added to the track
   * @param {string} effectId - Effect identifier
   * @returns {boolean} True if effect is already active
   */
  const isEffectActive = (effectId) => activeEffects.includes(effectId);

  return (
    <div className={styles.effectsMenuOverlay} onClick={handleBackgroundClick}>
      <div className={styles.effectsMenu}>
        {/* Modal Header */}
        <div className={styles.header}>
          <h2>Add Audio Effects</h2>
          <p className={styles.subtitle}>
            Select effects to enhance your audio track
          </p>
        </div>

        {/* Effects Grid */}
        <div className={styles.effectsContent}>
          <div className={styles.effectsGrid}>
            {availableEffects.map((effect) => {
              const isActive = isEffectActive(effect.id);
              return (
                <button
                  key={effect.id}
                  className={`${styles.effectCard} ${
                    isActive ? styles.effectCardDisabled : ""
                  }`}
                  onClick={() => addEffect(effect.id)}
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

        {/* Footer with Close button */}
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={closeEffectsMenu}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default EffectsMenu;
