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
  if (!audioBuffer || !canvasRef.current) return;

  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');

  // Use layout size for crisp rendering
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  // 🔧 Unwrap Tone.ToneAudioBuffer -> native AudioBuffer
  const native = (audioBuffer instanceof AudioBuffer)
    ? audioBuffer
    : (typeof audioBuffer.get === 'function'
        ? audioBuffer.get()        // ToneAudioBuffer.get() -> AudioBuffer
        : audioBuffer._buffer);    // fallback if Tone version exposes _buffer

  if (!native) return; // still nothing to draw

  const data = native.getChannelData(0);
  const step = Math.ceil(data.length / canvas.width);
  const amp  = canvas.height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < canvas.width; i++) {
    let min = 1.0, max = -1.0;
    for (let j = 0; j < step; j++) {
      const idx = i * step + j;
      if (idx >= data.length) break;
      const v = data[idx];
      if (v < min) min = v;
      if (v > max) max = v;
    }
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