import {useContext, useCallback, useState} from "react";
import {AppContext} from "../../../context/AppContext";
import styles from "../Layout.module.css";

function EffectsTab() {
  const {effects, updateEffect, resetEffect, resetAllEffects} =
    useContext(AppContext);

  const [draggingSlider, setDraggingSlider] = useState(null);

  const effectConfigs = [
    {
      name: "pitch",
      label: "Pitch Shift",
      min: -12,
      max: 12,
      step: 0.1,
      default: 0,
      unit: " semitones",
      description: "Shift pitch up or down",
    },
    {
      name: "volume",
      label: "Volume",
      min: 0,
      max: 200,
      step: 1,
      default: 100,
      unit: "%",
      description: "Adjust volume level",
    },
    {
      name: "reverb",
      label: "Reverb",
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: "%",
      description: "Add room ambience",
    },
  ];

  const handleChange = useCallback(
    (name) => (e) => {
      const raw = e.target.value;
      const num = Number(raw);
      updateEffect(name, num);
    },
    [updateEffect]
  );

  const getSliderFillPercentage = (config, value) => {
    const currentValue = value ?? config.default;
    return ((currentValue - config.min) / (config.max - config.min)) * 100;
  };

  return (
    <div className={styles.container}>
      {effectConfigs.map((config) => {
        const currentValue = effects[config.name] ?? config.default;
        const fillPercentage = getSliderFillPercentage(config, currentValue);

        return (
          <div key={config.name} className={styles.effectItem}>
            <div className={styles.header}>
              <span className={styles.label}>{config.label}</span>
              <span className={styles.value}>
                {currentValue}
                {config.unit}
              </span>
            </div>
            <div className={styles.description}>{config.description}</div>

            {/* Custom Universal Slider */}
            <div
              className={`${styles.sliderContainer} ${
                draggingSlider === config.name ? styles.dragging : ""
              }`}
            >
              <div className={styles.sliderTrack}></div>
              <div
                className={styles.sliderFill}
                style={{width: `${fillPercentage}%`}}
              ></div>
              <div
                className={`${styles.sliderKnobWrapper} ${
                  draggingSlider === config.name
                    ? styles.sliderKnobWrapperDragging
                    : ""
                }`}
                style={{left: `${fillPercentage}%`}}
              >
                <div className={styles.sliderKnob}></div>
              </div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={currentValue}
                onChange={handleChange(config.name)}
                onMouseDown={() => setDraggingSlider(config.name)}
                onMouseUp={() => setDraggingSlider(null)}
                onTouchStart={() => setDraggingSlider(config.name)}
                onTouchEnd={() => setDraggingSlider(null)}
                className={styles.sliderInput}
              />
            </div>

            <div className={styles.controls}>
              <button
                className={styles.button}
                onClick={() => resetEffect(config.name, config.default)}
              >
                Reset
              </button>
            </div>
          </div>
        );
      })}
      <button className={styles.resetAllButton} onClick={resetAllEffects}>
        Reset All Effects
      </button>
    </div>
  );
}

export default EffectsTab;
