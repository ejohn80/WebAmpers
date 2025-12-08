/**
 * LiveWaveform Component
 *
 * Displays a real-time audio waveform that fills left-to-right while recording.
 * Features:
 * - Shows amplitude waveform without looping during recording
 * - Red progress bar indicates current playback position
 * - Time-based scrolling (pixelsPerSecond controls horizontal scaling)
 * - Cleans up audio resources properly on unmount
 */
import React, {useEffect, useRef} from "react";

export default function LiveWaveform({stream, startTs, pixelsPerSecond = 120}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const nodesRef = useRef({audioCtx: null, source: null, analyser: null});
  const accRef = useRef({cols: [], lastX: -1}); // Accumulated waveform data

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream) return;

    // Size canvas to match CSS dimensions
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const ctx = canvas.getContext("2d");

    // Set up audio processing pipeline
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    nodesRef.current = {audioCtx, source, analyser};
    const data = new Uint8Array(analyser.frequencyBinCount);

    // Initialize column storage for waveform
    accRef.current = {cols: new Array(canvas.width).fill(null), lastX: -1};

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);

      // Calculate current x position based on elapsed time
      const elapsedSec = Math.max(
        0,
        (Date.now() - (startTs || Date.now())) / 1000
      );
      const x = Math.min(
        canvas.width - 1,
        Math.floor(elapsedSec * pixelsPerSecond)
      );

      // Find min/max amplitude in current audio frame
      let min = 255,
        max = 0;
      const step = Math.ceil(data.length / 32); // Performance optimization
      for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }

      // Store waveform column data
      const c = accRef.current;
      if (x !== c.lastX) {
        // Fill any skipped columns with current measurement
        for (let i = c.lastX + 1; i <= x; i++) {
          c.cols[i] = {min, max};
        }
        c.lastX = x;
      } else if (!c.cols[x]) {
        c.cols[x] = {min, max};
      }

      // Draw accumulated waveform up to current position
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mid = canvas.height / 2;
      ctx.strokeStyle = "#7fd3ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= x; i++) {
        const col = c.cols[i];
        if (!col) continue;
        const y1 = mid + ((col.min - 128) / 128) * (canvas.height / 2 - 2);
        const y2 = mid + ((col.max - 128) / 128) * (canvas.height / 2 - 2);
        ctx.moveTo(i + 0.5, y1);
        ctx.lineTo(i + 0.5, y2);
      }
      ctx.stroke();

      // Draw red progress bar
      ctx.fillStyle = "red";
      ctx.fillRect(x, 0, 2, canvas.height);
    };
    draw();

    // Cleanup function
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      // Disconnect audio nodes safely
      try {
        nodesRef.current.source?.disconnect?.();
      } catch {}
      try {
        nodesRef.current.analyser?.disconnect?.();
      } catch {}
      try {
        nodesRef.current.audioCtx?.close?.();
      } catch {}

      nodesRef.current = {audioCtx: null, source: null, analyser: null};
    };
  }, [stream, startTs, pixelsPerSecond]);

  return <canvas ref={canvasRef} style={{width: "100%", height: "100%"}} />;
}
