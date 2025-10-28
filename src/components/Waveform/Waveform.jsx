import React, { useRef, useEffect } from 'react';
import './Waveform.css';

/**
 * A component that renders an audio buffer as a waveform on a canvas.
 * @param {object} props
 * @param {Tone.ToneAudioBuffer} props.audioBuffer - The audio buffer to visualize.
 */
const Waveform = ({ audioBuffer }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas dimensions to match its container size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Get audio data from the first channel
    const data = audioBuffer.getChannelData(0);
    
    // Drawing parameters
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    // Clear canvas and set styles
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffffff'; // White color for the waveform line
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Loop through canvas pixels to draw the waveform
    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0;
      let max = -1.0;

      // Find min/max values for the current segment of audio data
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) {
          min = datum;
        }
        if (datum > max) {
          max = datum;
        }
      }

      // Draw a vertical line from min to max amplitude for this pixel
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }

    ctx.stroke();

  }, [audioBuffer]); // Redraw when the audioBuffer prop changes

  return (
    <div className="waveform-container">
      <canvas ref={canvasRef} className="waveform-canvas" />
    </div>
  );
};

export default Waveform;