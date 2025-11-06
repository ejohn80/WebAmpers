import React, { useState, useRef, useEffect } from 'react';
import './TrackLane/TrackLane.css';

export default function Mock() {
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [positions, setPositions] = useState({
    'top-left': 0,
    'top-right': 220,
    'bottom': 0
  });
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [trackStates, setTrackStates] = useState({
    'track1': { muted: false, soloed: false },
    'track2': { muted: false, soloed: false }
  });
  const trackRefs = {
    'top': useRef(null),
    'bottom': useRef(null)
  };

  const generateContinuousWave = (numBars, seed = 0) => {
    const bars = [];
    for (let i = 0; i < numBars; i++) {
      const height = Math.abs(Math.sin((i + seed) * 0.5) * 0.8 + Math.sin((i + seed) * 0.13) * 0.2);
      bars.push(height);
    }
    return bars;
  };

  const generateIntervalWave = (numBars) => {
    const bars = [];
    const segmentSize = Math.floor(numBars / 6);
    for (let i = 0; i < numBars; i++) {
      const segment = Math.floor(i / segmentSize);
      if (segment % 2 === 0) {
        const height = Math.abs(Math.sin(i * 0.3) * 0.7 + Math.sin(i * 0.07) * 0.3);
        bars.push(height);
      } else {
        bars.push(0.05);
      }
    }
    return bars;
  };

  const WaveformBars = ({ bars, color }) => (
    <>
      {bars.map((height, i) => (
        <rect
          key={i}
          x={`${(i / bars.length) * 100}%`}
          y={`${50 - height * 50}%`}
          width={`${100 / bars.length}%`}
          height={`${height * 100}%`}
          fill={color}
        />
      ))}
    </>
  );

  const toggleMute = (trackId) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], muted: !prev[trackId].muted }
    }));
  };

  const toggleSolo = (trackId) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], soloed: !prev[trackId].soloed }
    }));
  };

  const handleMouseDown = (id, e, trackKey) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset(e.clientX - rect.left);
    setDragging({ id, trackKey });
    setSelectedContainer(id);
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const { id, trackKey } = dragging;
    const trackRect = trackRefs[trackKey].current?.getBoundingClientRect();
    if (!trackRect) return;
    
    const containerWidth = 200;
    const maxPosition = trackRect.width - containerWidth;

    let newPosition = e.clientX - trackRect.left - dragOffset;
    newPosition = Math.max(0, Math.min(newPosition, maxPosition));

    setPositions(prev => ({ ...prev, [id]: newPosition }));
  };

  const handleMouseUp = () => {
    setDragging(null);
    setDragOffset(0);
  };

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, dragOffset]);

  const containerStyle = (id) => ({
    cursor: dragging?.id === id ? 'grabbing' : 'grab',
    transition: dragging?.id === id ? 'none' : 'border 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease',
    border: selectedContainer === id ? '3px solid #3b82f6' : '2px solid #374151',
    position: 'absolute',
    left: `${positions[id]}px`,
    width: '200px',
    height: '100%',
    userSelect: 'none',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px'
  });

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Track 1 */}
      <div className="tracklane-root">
        <div className="tracklane-side">
          <div className="tracklane-title">Track 1</div>
          <div className="tracklane-controls-box">
            <div className="tracklane-controls">
              <button
                className={`tl-btn tl-btn-mute ${trackStates.track1.muted ? 'tl-btn--active' : ''}`}
                onClick={() => toggleMute('track1')}
                aria-pressed={trackStates.track1.muted}
                title={trackStates.track1.muted ? "Unmute track" : "Mute track"}
              >
                {trackStates.track1.muted ? 'Muted' : 'Mute'}
              </button>
              <button
                className={`tl-btn tl-btn-solo ${trackStates.track1.soloed ? 'tl-btn--active' : ''}`}
                onClick={() => toggleSolo('track1')}
                aria-pressed={trackStates.track1.soloed}
                title={trackStates.track1.soloed ? "Unsolo track" : "Solo track"}
              >
                {trackStates.track1.soloed ? 'Soloed' : 'Solo'}
              </button>
            </div>
          </div>
        </div>

        <div className="tracklane-main">
          <div className="tracklane-segment" style={{ height: '120px', padding: '8px' }}>
            <div
              ref={trackRefs.top}
              className="segment-waveform"
              style={{ height: '100%', position: 'relative', overflow: 'visible', display: 'flex', alignItems: 'center' }}
            >
              <div
                onMouseDown={(e) => handleMouseDown('top-left', e, 'top')}
                onClick={() => setSelectedContainer('top-left')}
                style={containerStyle('top-left')}
              >
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <WaveformBars bars={generateContinuousWave(150, 0)} color="#3b82f6" />
                </svg>
              </div>

              <div
                onMouseDown={(e) => handleMouseDown('top-right', e, 'top')}
                onClick={() => setSelectedContainer('top-right')}
                style={containerStyle('top-right')}
              >
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <WaveformBars bars={generateContinuousWave(150, 100)} color="#8b5cf6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Track 2 */}
      <div className="tracklane-root">
        <div className="tracklane-side">
          <div className="tracklane-title">Track 2</div>
          <div className="tracklane-controls-box">
            <div className="tracklane-controls">
              <button
                className={`tl-btn tl-btn-mute ${trackStates.track2.muted ? 'tl-btn--active' : ''}`}
                onClick={() => toggleMute('track2')}
                aria-pressed={trackStates.track2.muted}
                title={trackStates.track2.muted ? "Unmute track" : "Mute track"}
              >
                {trackStates.track2.muted ? 'Muted' : 'Mute'}
              </button>
              <button
                className={`tl-btn tl-btn-solo ${trackStates.track2.soloed ? 'tl-btn--active' : ''}`}
                onClick={() => toggleSolo('track2')}
                aria-pressed={trackStates.track2.soloed}
                title={trackStates.track2.soloed ? "Unsolo track" : "Solo track"}
              >
                {trackStates.track2.soloed ? 'Soloed' : 'Solo'}
              </button>
            </div>
          </div>
        </div>

        <div className="tracklane-main">
          <div className="tracklane-segment" style={{ height: '120px', padding: '8px' }}>
            <div
              ref={trackRefs.bottom}
              className="segment-waveform"
              style={{ height: '100%', position: 'relative', overflow: 'visible', display: 'flex', alignItems: 'center' }}
            >
              <div
                onMouseDown={(e) => handleMouseDown('bottom', e, 'bottom')}
                onClick={() => setSelectedContainer('bottom')}
                style={containerStyle('bottom')}
              >
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <WaveformBars bars={generateIntervalWave(200)} color="#10b981" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}