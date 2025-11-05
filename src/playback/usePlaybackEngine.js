import {useEffect, useMemo, useRef, useState} from "react";
import {PlaybackEngine} from "./playback.jsx";
import {progressStore} from "./progressStore";

// Hook that wraps PlaybackEngine and exposes state/actions for the UI
export default function usePlaybackEngine({
  version,
  onProgress,
  onTransport,
} = {}) {
  const engine = useMemo(
    () => new PlaybackEngine({onProgress, onTransport}),
    []
  );

  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  const [masterVol, setMasterVol] = useState(() => {
    try {
      const v = localStorage.getItem("webamp.masterVol");
      return v !== null ? Number(v) : 50;
    } catch (e) {
      return 50;
    }
  });
  const [muted, setMuted] = useState(() => {
    try {
      const m = localStorage.getItem("webamp.muted");
      return m !== null ? m === "1" : false;
    } catch (e) {
      return false;
    }
  });

  const prevMasterGainRef = useRef(0.5);
  const savedVolumeRef = useRef(0.5);
  const wasPlayingRef = useRef(false);
  const mutingDuringScrubRef = useRef(false);

  // sync engine events back into hook state
  useEffect(() => {
    const p = (v) => setMs(v);
    const t = ({playing}) => setPlaying(playing);
    engine.events.onProgress = onProgress ?? p;
    engine.events.onTransport = onTransport ?? t;
    // keep local copies too
    return () => {
      engine.events.onProgress = undefined;
      engine.events.onTransport = undefined;
    };
  }, [engine, onProgress, onTransport]);

  // publish ms to progressStore so waveform/red-timer updates
  useEffect(() => {
    try {
      progressStore.setMs(ms);
    } catch {}
  }, [ms]);

  // wire seeker / scrub handlers and length when version changes
  useEffect(() => {
    try {
      progressStore.setLengthMs(version?.lengthMs ?? 0);
      progressStore.setSeeker((absMs) => {
        try {
          engine.seekMs(absMs);
        } catch (e) {
          console.warn("seek request failed:", e);
        }
      });

      progressStore.setScrubStart(() => {
        wasPlayingRef.current = playing;
        if (playing && engine.master) {
          try {
            prevMasterGainRef.current = engine.master.gain.gain.value;
            engine.master.gain.gain.value = 0.0001; // virtually silent
            mutingDuringScrubRef.current = true;
          } catch {}
        }
      });

      progressStore.setScrubEnd(() => {
        if (mutingDuringScrubRef.current && engine.master) {
          try {
            engine.master.gain.gain.value = prevMasterGainRef.current ?? 1;
          } catch {}
        }
        mutingDuringScrubRef.current = false;
        if (wasPlayingRef.current) {
          engine.play().catch(() => {});
        }
      });
    } catch (e) {
      /* ignore */
    }

    return () => {
      try {
        progressStore.setSeeker(null);
        progressStore.setScrubStart(null);
        progressStore.setScrubEnd(null);
      } catch {}
    };
  }, [engine, version, playing]);

  // Load engine when version (segments/timeline) changes. Use signature to avoid reloads
  useEffect(() => {
    if (!version) return;
    const segSig = (version.segments || [])
      .map(
        (s) =>
          `${s.fileUrl}@${s.trackId}:${s.startOnTimelineMs || 0}-${s.durationMs || 0}`
      )
      .join("|");
    const sig = `${version.lengthMs || 0}::${segSig}`;

    // we can't declare useRef inside effect and read it next run; so instead store on engine
    if (!engine._prevSig) engine._prevSig = null;

    (async () => {
      if (engine._prevSig !== sig) {
        try {
          await engine.load(version);
          // restore persisted master volume/mute
          if (engine.master) {
            let initVol = 0.5;
            let initMuted = false;
            try {
              const v = localStorage.getItem("webamp.masterVol");
              if (v !== null)
                initVol = Math.max(0, Math.min(1, Number(v) / 100));
            } catch (e) {}
            try {
              const m = localStorage.getItem("webamp.muted");
              if (m !== null) initMuted = m === "1";
            } catch (e) {}

            prevMasterGainRef.current = initVol;
            savedVolumeRef.current = initVol;
            engine.master.gain.gain.value = initMuted ? 0 : initVol;
            setMasterVol(Math.round(initVol * 100));
            setMuted(initMuted);
          }
        } catch (e) {
          console.error("engine.load failed:", e);
        }
        engine._prevSig = sig;
      } else {
        // sync per-track mute/solo if only metadata changed
        try {
          const current = engine.version?.tracks || [];
          (version.tracks || []).forEach((t) => {
            const existing = current.find((x) => x.id === t.id);
            if (!existing) return;
            if (Boolean(existing.mute) !== Boolean(t.mute))
              engine.setTrackMute(t.id, !!t.mute);
            if (Boolean(existing.solo) !== Boolean(t.solo))
              engine.setTrackSolo(t.id, !!t.solo);
          });
        } catch (e) {
          engine._prevSig = null;
        }
      }
    })();
  }, [engine, version]);

  // scrub handling (muting during scrubs) isn't part of the hook's external API in this
  // minimal refactor — keep it internal if needed later.

  // Actions
  const play = async () => {
    try {
      await engine.play();
    } catch (e) {
      console.error("engine.play failed", e);
    }
  };
  const pause = () => engine.pause();
  const togglePlay = async () => {
    if (playing) pause();
    else await play();
  };

  const seekMs = (msVal) => {
    try {
      engine.seekMs(msVal);
    } catch (e) {
      console.warn("seek failed", e);
    }
  };

  const setMasterVolumePercent = (percent) => {
    const v = Math.max(0, Math.min(100, Number(percent) || 0));
    setMasterVol(v);
    try {
      const linear = Math.max(0, Math.min(1, v / 100));
      try {
        localStorage.setItem("webamp.masterVol", String(v));
      } catch (e) {}
      savedVolumeRef.current = linear;
      prevMasterGainRef.current = linear;
      if (engine.master && !muted) engine.master.gain.gain.value = linear;
    } catch (e) {
      console.warn("setMasterVolumePercent failed", e);
    }
  };

  const toggleMute = () => {
    try {
      if (!engine.master) return;
      if (muted) {
        const restore = Math.max(
          0,
          Math.min(1, savedVolumeRef.current ?? masterVol / 100)
        );
        engine.master.gain.gain.value = restore;
        prevMasterGainRef.current = restore;
        setMuted(false);
        try {
          localStorage.setItem("webamp.muted", "0");
        } catch (e) {}
      } else {
        savedVolumeRef.current = Math.max(0, Math.min(1, masterVol / 100));
        try {
          localStorage.setItem("webamp.muted", "1");
        } catch (e) {}
        engine.master.gain.gain.value = 0;
        prevMasterGainRef.current = 0;
        setMuted(true);
      }
    } catch (err) {
      console.warn("toggleMute failed:", err);
    }
  };

  const skipBy = (deltaMs) => {
    const len = version?.lengthMs ?? Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min((ms || 0) + deltaMs, len));
    try {
      engine.seekMs(next);
    } catch (err) {
      console.warn("skip failed:", err);
    }
    setMs(next);
  };

  const skipBack10 = () => skipBy(-10000);
  const skipFwd10 = () => skipBy(10000);
  const goToStart = () => {
    try {
      engine.seekMs(0);
    } catch (err) {
      console.warn("goToStart failed:", err);
    }
    setMs(0);
  };

  return {
    engine,
    playing,
    ms,
    masterVol,
    muted,
    play,
    pause,
    togglePlay,
    setMasterVolumePercent,
    toggleMute,
    skipBack10,
    skipFwd10,
    goToStart,
    seekMs,
  };
}
