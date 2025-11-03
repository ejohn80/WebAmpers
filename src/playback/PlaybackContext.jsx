import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PlaybackEngine } from './playback.jsx';

const PlaybackCtx = createContext(null);

export function PlaybackProvider({ version, children }) {
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  const [masterVol, setMasterVol] = useState(100);

  const engine = useMemo(() => new PlaybackEngine({
    onProgress: (v) => setMs(v),
    onTransport: ({ playing }) => setPlaying(playing),
    onError: (e) => console.error(e),
  }), []);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    if (!version) return;
    engine
      .load(version)
      .then(() => {
        // initialize master volume to 100%
        try { engine.master && (engine.master.gain.gain.value = 1); } catch {}
        setMasterVol(100);
      })
      .catch((e) => console.error('[PlaybackProvider] engine.load() failed:', e));
  }, [engine, version]);

  const play = async () => {
    try { await engine.play(); } catch (e) { console.error('[Playback] play failed', e); }
  };
  const pause = () => { try { engine.pause(); } catch (e) { console.error('[Playback] pause failed', e); } };
  const seekMs = (pos) => { try { engine.seekMs(pos); } catch (e) { console.error('[Playback] seek failed', e); } };
  const skipMs = (delta) => {
    const len = version?.lengthMs ?? Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min((ms || 0) + delta, len));
    seekMs(next);
  };
  const setMasterVolume = (v) => {
    setMasterVol(v);
    try { engine.master && (engine.master.gain.gain.value = Math.max(0, Math.min(1, v / 100))); } catch {}
  };

  const value = useMemo(() => ({
    engine,
    playing,
    ms,
    lengthMs: version?.lengthMs ?? 0,
    masterVol,
    actions: { play, pause, seekMs, skipMs, setMasterVolume },
  }), [engine, playing, ms, masterVol, version?.lengthMs]);

  return <PlaybackCtx.Provider value={value}>{children}</PlaybackCtx.Provider>;
}

export function usePlayback() {
  const ctx = useContext(PlaybackCtx);
  if (!ctx) throw new Error('usePlayback must be used within PlaybackProvider');
  return ctx;
}

