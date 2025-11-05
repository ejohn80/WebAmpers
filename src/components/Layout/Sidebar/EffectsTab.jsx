import { useState } from 'react';
import styles from '../Layout.module.css';

function EffectsTab() {
  const [effects, setEffects] = useState({
    pitch: 0,
    volume: 100,
    reverb: 0,
  });

  const handleEffectChange = (effectName, value) => {
    setEffects(prev => ({
      ...prev,
      [effectName]: parseFloat(value)
    }));
  };

  const resetEffect = (effectName, defaultValue) => {
    setEffects(prev => ({
      ...prev,
      [effectName]: defaultValue
    }));
  };

  const resetAll = () => {
    setEffects({
      pitch: 0,
      volume: 100,
      reverb: 0,
    });
  };

  const effectConfigs = [
    {
      name: 'pitch',
      label: 'Pitch Shift',
      min: -12,
      max: 12,
      step: 0.1,
      default: 0,
      unit: ' semitones',
      description: 'Shift pitch up or down'
    },
    {
      name: 'volume',
      label: 'Volume',
      min: 0,
      max: 200,
      step: 1,
      default: 100,
      unit: '%',
      description: 'Adjust volume level'
    },
    {
      name: 'reverb',
      label: 'Reverb',
      min: 0,
      max: 100,
      step: 1,
      default: 0,
      unit: '%',
      description: 'Add room ambience'
    },
  ];

  return (
    <div className={styles.container}>
      {effectConfigs.map(config => (
        <div key={config.name} className={styles.effectItem}>
          <div className={styles.header}>
            <span className={styles.label}>{config.label}</span>
            <span className={styles.value}>
              {effects[config.name]}{config.unit}
            </span>
          </div>
          <div className={styles.description}>{config.description}</div>
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={effects[config.name]}
            onChange={(e) => handleEffectChange(config.name, e.target.value)}
            className={styles.slider}
          />
          <div className={styles.controls}>
            <button
              className={styles.button}
              onClick={() => resetEffect(config.name, config.default)}
            >
              Reset
            </button>
          </div>
        </div>
      ))}

      <button className={styles.resetAllButton} onClick={resetAll}>
        Reset All Effects
      </button>
    </div>
  );
}

export default EffectsTab;