import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import { progressStore } from './progressStore';
import {
  PlayIcon, PauseIcon, RewindIcon, ForwardIcon, GoToStartIcon,
  SoundOnIcon, SoundOffIcon, VolumeKnob
} from "../components/Layout/Svgs.jsx";

import './playback.css';

// === Utility functions ===

// Convert decibels to linear gain value (used for volume control)
const dbToGain = (db) => (typeof db === "number" ? Math.pow(10, db / 20) : 1);

// Clamp a value between two bounds (for panning range)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Convert milliseconds to beats given a BPM (used for time alignment)
const msToBeats = (ms, bpm) => (ms / 1000) * (bpm / 60);

// Convert milliseconds to Tone.js "transport time" string format
const msToToneTime = (ms, bpm) => `${msToBeats(ms, bpm)}i`; // i = immutable numeric time

/** ---------- PlaybackEngine----------
 * Core class responsible for handling all playback logic using Tone.js.
 * It manages audio transport, tracks, master bus, and segment playback.
 */
class PlaybackEngine {
  constructor(events = {}) {
    // Events callbacks passed from React (e.g. onProgress, onTransport)
    this.events = events;

    // Tone.js runtime data
    this.version = null; // current loaded version/project
    this.trackBuses = new Map(); // map of track IDs to their Tone buses
    this.master = null; // master gain node
    this.playersBySegment = new Map(); // store all active audio players
    this.preloaded = new Set(); // store URLs already preloaded
    this.rafId = null; // requestAnimationFrame ID for updating progress
    this.ended = false; // whether we've reached the end of the timeline

    // playback timing parameters
    this.renderAheadSec = 0.2; // small pre-buffer before playback starts
    this.jogLatencySec = 0.02; // latency compensation for seeking
    this.defaultFadeMs = 5; // default fade time in milliseconds
  }

  /** Ensure Tone.js AudioContext is running (required by browsers for playback) */
  async ensureAudioUnlocked() {
    if (Tone.context.state !== "running") {
      await Tone.start();
    }
  }

  /** Load a new project ("version") into the playback engine */
  async load(version) {
    await this.ensureAudioUnlocked();

    // Reset Tone.Transport and clear previous state
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    this._cancelRaf();
    this._disposeAll();

    // Save the version reference
    this.version = version;
    this.ended = false;

    // Configure transport tempo and time signature
    Tone.Transport.bpm.value = version.bpm || 120;
    const ts = Array.isArray(version.timeSig) ? version.timeSig : [4, 4];
    Tone.Transport.timeSignature = ts;

    // Create master bus
    this.master = this._makeMaster(version.masterChain);

    // Create all track buses and connect them to master
    (version.tracks || []).forEach((t) => {
      const bus = this._makeTrackBus(t);
      this.trackBuses.set(t.id, bus);
      (bus.fxOut ?? bus.pan).connect(this.master.fxIn ?? this.master.gain);
    });

    // Prepare all audio segments (Tone.Player instances)
    await this._prepareSegments(version);

    // Enable or clear looping if defined
    if (version.loop && version.loop.enabled) {
      this.setLoop(version.loop.startMs, version.loop.endMs);
    } else {
      this.clearLoop();
    }

    // Start updating progress via requestAnimationFrame
    this._startRaf();
  }

  /** Start playback of the Tone.Transport */
  async play() {
    await this.ensureAudioUnlocked();
    Tone.Transport.start("+" + this.renderAheadSec);
    this._emitTransport(true);
    this.ended = false;
  }

  /** Pause playback but keep position */
  pause() {
    Tone.Transport.pause();
    this._emitTransport(false);
  }

  /** Stop playback and reset position to start */
  stop() {
    Tone.Transport.stop();
    this.seekMs(0);
    this._emitTransport(false);
  }

  /** Seek to a specific time (in milliseconds) within the timeline */
  seekMs(ms) {
    if (!this.version) return;
    // Use seconds for absolute seeking; avoid mixing units with beats.
    const clampedMs = Math.max(0, Number(ms) || 0);
    if (this.version?.lengthMs && clampedMs < this.version.lengthMs) {
      this.ended = false;
    }
    const seconds = clampedMs / 1000 + (this.jogLatencySec || 0);
    Tone.Transport.seconds = seconds;
  }

  /** Get the current playback position in milliseconds */
  getPositionMs() {
    return Tone.Transport.seconds * 1000;
  }

  /** Define a loop range for the transport */
  setLoop(startMs, endMs) {
    if (!this.version) return;
    Tone.Transport.setLoopPoints(
      msToToneTime(startMs, this.version.bpm || 120),
      msToToneTime(endMs, this.version.bpm || 120),
    );
    Tone.Transport.loop = endMs > startMs;
  }

  /** Disable looping entirely */
  clearLoop() {
    Tone.Transport.loop = false;
  }

  /** Mute or unmute a specific track */
  setTrackMute(trackId, mute) {
    if (!this.version) return;
    const t = this.version.tracks.find((x) => x.id === trackId);
    if (t) t.mute = !!mute;
    this._applyMuteSolo();
  }

  /** Solo or unsolo a specific track */
  setTrackSolo(trackId, solo) {
    if (!this.version) return;
    const t = this.version.tracks.find((x) => x.id === trackId);
    if (t) t.solo = !!solo;
    this._applyMuteSolo();
  }

  /** Adjust the gain (volume) of a track in decibels */
  setTrackGainDb(trackId, db) {
    const bus = this.trackBuses.get(trackId);
    if (bus) bus.gain.gain.value = dbToGain(db);
    if (this.version) {
      const t = this.version.tracks.find((x) => x.id === trackId);
      if (t) t.gainDb = db;
    }
  }

  /** Adjust the stereo pan (-1 = left, +1 = right) of a track */
  setTrackPan(trackId, pan) {
    const bus = this.trackBuses.get(trackId);
    if (bus) bus.pan.pan.value = clamp(pan, -1, 1);
    if (this.version) {
      const t = this.version.tracks.find((x) => x.id === trackId);
      if (t) t.pan = pan;
    }
  }

  /** Replace the master chain (placeholder for future FX support) */
  replaceMasterChain(chain) {
    const newMaster = this._makeMaster(chain);
    const old = this.master;
    if (old) (old.fxOut ?? old.gain).disconnect();

    this.master = newMaster;
    this.trackBuses.forEach((bus) => {
      (bus.fxOut ?? bus.pan).disconnect();
      (bus.fxOut ?? bus.pan).connect(this.master.fxIn ?? this.master.gain);
    });
  }

  /** Dispose all audio resources */
  dispose() {
    this._cancelRaf();
    this._disposeAll();
  }

  // ---------- Internal methods ----------

  /** Prepare all segments (audio clips) and schedule them for playback */
  async _prepareSegments(version) {
    const urls = Array.from(
      new Set((version.segments || []).map((s) => s.fileUrl)),
    );
    urls.forEach((u) => this._preload(u));

    for (const seg of version.segments || []) {
      // Create a Tone.Player for each segment
      const player = new Tone.Player({
        url: seg.fileUrl,
        autostart: false,
        loop: false,
        fadeIn: (seg.fades?.inMs ?? this.defaultFadeMs) / 1000,
        fadeOut: (seg.fades?.outMs ?? this.defaultFadeMs) / 1000,
      });

      // Each segment has its own gain and pan
      const segGain = new Tone.Gain(dbToGain(seg.gainDb));
      const segPan = new Tone.Panner(0);

      // Connect chain: player → gain → pan → track bus
      player.connect(segGain);
      segGain.connect(segPan);

      const bus = this.trackBuses.get(seg.trackId);
      if (!bus) throw new Error(`Missing track bus for ${seg.trackId}`);
      segPan.connect(bus.fxIn ?? bus.gain);

      // Store player and disposers
      this.playersBySegment.set(seg.id, {
        player,
        gain: segGain,
        pan: segPan,
        disposers: [
          () => player.dispose(),
          () => segGain.dispose(),
          () => segPan.dispose(),
        ],
      });

      // Convert timeline positions to seconds
      const offsetSec = (seg.startInFileMs || 0) / 1000;
      const durSec = (seg.durationMs || 0) / 1000;

      // Sync player to Transport so pause/stop works correctly
      player.sync();

      // Schedule start time in the Transport
      const startTT = msToToneTime(
        seg.startOnTimelineMs || 0,
        version.bpm || 120,
      );
      player.start(startTT, offsetSec, durSec);
    }

    this._applyMuteSolo();
  }

  /** Create a simple Gain → Pan chain for one track */
  _makeTrackBus(t) {
    const gain = new Tone.Gain(dbToGain(t.gainDb));
    const pan = new Tone.Panner(clamp(t.pan ?? 0, -1, 1));
    gain.connect(pan);
    return { id: t.id, gain, pan, fxIn: null, fxOut: null, chain: [] };
  }

  /** Create a master bus and connect it to the audio output */
  _makeMaster() {
    const gain = new Tone.Gain(1);
    gain.connect(Tone.Destination);
    return { gain, chain: [], fxIn: null, fxOut: null };
  }

  /** Handle mute/solo logic and smoothly apply gain changes */
  _applyMuteSolo() {
    if (!this.version) return;
    const tracks = this.version.tracks || [];
    const anySolo = tracks.some((t) => t.solo);

    tracks.forEach((t) => {
      const bus = this.trackBuses.get(t.id);
      if (!bus) return;
      const shouldMute = anySolo ? !t.solo : !!t.mute;

      const now = Tone.now();
      bus.gain.gain.cancelAndHoldAtTime(now);
      const target = shouldMute ? 0.0001 : dbToGain(t.gainDb);
      bus.gain.gain.exponentialRampToValueAtTime(target, now + 0.01);
    });
  }

  /** Preload an audio file asynchronously */
  _preload(url) {
    if (this.preloaded.has(url)) return;
    this.preloaded.add(url);
    Tone.ToneAudioBuffer.load(url)
      .then(
        () =>
          this.events.onBuffer && this.events.onBuffer({ url, ready: true }),
      )
      .catch(
        (e) =>
          this.events.onBuffer &&
          this.events.onBuffer({ url, ready: false, error: e }),
      );
  }

  /** Start updating progress every animation frame */
  _startRaf() {
    const tick = () => {
      let ms = this.getPositionMs();
      const len = this.version?.lengthMs;
      if (typeof len === "number" && len > 0) {
        if (ms >= len) {
          // Clamp and auto-pause exactly at the end once
          ms = len;
          if (!this.ended) {
            try {
              Tone.Transport.pause();
            } catch {}
            this.seekMs(len);
            this._emitTransport(false);
            this.ended = true;
          }
        }
      }
      this.events.onProgress && this.events.onProgress(ms);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop the RAF loop */
  _cancelRaf() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** Emit transport event to React (e.g., when playing/paused) */
  _emitTransport(playing) {
    this.events.onTransport &&
      this.events.onTransport({
        playing,
        positionMs: this.getPositionMs(),
        bpm: this.version?.bpm || 120,
      });
  }

  /** Dispose of all audio players and buses to free memory */
  _disposeAll() {
    this.playersBySegment.forEach((h) => {
      try {
        h.player.unsync?.();
        h.disposers.forEach((d) => d());
      } catch {
        /* To suppress linter warning */
      }
    });
    this.playersBySegment.clear();

    this.trackBuses.forEach((b) => {
      try {
        (b.fxOut ?? b.pan).disconnect();
        (b.chain || []).forEach((n) => n.dispose?.());
        b.pan.dispose();
        b.gain.dispose();
      } catch {
        /* To suppress linter warning */
      }
    });
    this.trackBuses.clear();

    if (this.master) {
      try {
        (this.master.fxOut ?? this.master.gain).disconnect();
        (this.master.chain || []).forEach((n) => n.dispose?.());
        this.master.gain.dispose();
      } catch {
        /* To suppress linter warning */
      }
    }
  }
}

/** ---------- React wrapper component ----------
 * Provides UI controls (Play/Pause/Stop) and a progress bar for the PlaybackEngine.
 */
export default function WebAmpPlayback({ version, onEngineReady }) {
  const engineRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  const [masterVol, setMasterVol] = useState(50);
  const [muted, setMuted] = useState(false);
  const [draggingVol, setDraggingVol] = useState(false);
  const wasPlayingRef = useRef(false);
  const prevMasterGainRef = useRef(0.5);
  const savedVolumeRef = useRef(0.5);
  const mutingDuringScrubRef = useRef(false);

  const engine = useMemo(
    () =>
      new PlaybackEngine({
        onProgress: (v) => setMs(v),
        onTransport: ({ playing }) => setPlaying(playing),
        onError: (e) => console.error(e),
      }),
    [],
  );

  useEffect(() => {
    engineRef.current = engine;
    try {
      onEngineReady && onEngineReady(engine);
    } catch (e) {
      // swallow
    }
    return () => engine.dispose();
  }, [engine, onEngineReady]);

  useEffect(() => {
    if (!version) return;
    progressStore.setLengthMs(version.lengthMs ?? 0);
    progressStore.setSeeker((absMs) => {
      try { engine.seekMs(absMs); } catch (e) { console.warn('seek request failed:', e); }
    });
    engine
      .load(version)
      .then(() => {
        try {
          if (engine.master) {
            engine.master.gain.gain.value = 0.5;
            prevMasterGainRef.current = 0.5;
            savedVolumeRef.current = 0.5;
            setMasterVol(50);
            setMuted(false);
          }
        } catch {}
      })
      .catch((e) => console.error("[UI] engine.load() failed:", e));
    return () => {
      progressStore.setSeeker(null);
    };
  }, [engine, version]);

  useEffect(() => {
    progressStore.setScrubStart(() => {
      wasPlayingRef.current = playing;
      if (playing && engine.master) {
        try {
          prevMasterGainRef.current = engine.master.gain.gain.value;
          engine.master.gain.gain.value = 0.0001;
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
    return () => {
      progressStore.setScrubStart(null);
      progressStore.setScrubEnd(null);
    };
  }, [playing, engine]);

  // Add all the missing functions
  const onPlay = async () => {
    try {
      await engine.play();
    } catch (e) {
      console.error("[UI] engine.play() failed:", e);
    }
  };

  const onPause = () => engine.pause();

  const skipMs = (delta) => {
    const len = version?.lengthMs ?? Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min((ms || 0) + delta, len));
    try {
      engine.seekMs(next);
    } catch (err) {
      console.warn("skip failed:", err);
    }
    setMs(next);
  };

  const skipBack10 = () => skipMs(-10000);
  const skipFwd10 = () => skipMs(10000);

  const goToStart = () => {
    try {
      engine.seekMs(0);
    } catch (err) {
      console.warn("goToStart failed:", err);
    }
    setMs(0);
    try { progressStore.setMs(0); } catch {}
  };

  useEffect(() => {
    progressStore.setMs(ms);
  }, [ms]);

  const onToggleMute = () => {
    try {
      if (!engine.master) return;
      if (muted) {
        engine.master.gain.gain.value = Math.max(0, Math.min(1, savedVolumeRef.current ?? masterVol / 100));
        setMuted(false);
      } else {
        savedVolumeRef.current = Math.max(0, Math.min(1, masterVol / 100));
        engine.master.gain.gain.value = 0;
        setMuted(true);
      }
    } catch (err) {
      console.warn("toggle mute failed:", err);
    }
  };

  const fmtTime = (tMs) => {
    const t = Math.max(0, Math.floor((tMs || 0) / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

// Render player UI with CSS classes
return ( 
  
  <div className="playback-container">
    {/* Left: Time display */}
    <div className="spacer"></div>
    <div className="time-section">
      <code className="time-display">
        {fmtTime(ms)}
        {typeof (version?.lengthMs) === 'number' && version.lengthMs > 0 ? ` / ${fmtTime(version.lengthMs)}` : ''}
      </code>
    </div>

    {/* Center: Transport controls */}
    <div className="transport-section">
      <button
        onClick={goToStart}
        title="Go to start"
        className="transport-button"
      >
        <GoToStartIcon />
      </button>
      <button
        onClick={skipBack10}
        title="Back 10s"
        className="transport-button"
      >
        <RewindIcon />
      </button>
      {playing ? (
        <button
          type="button"
          onClick={onPause}
          title="Pause"
          className="transport-button"
          aria-label="Pause"
        >
          <PauseIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={onPlay}
          title="Play"
          className="transport-button"
          aria-label="Play"
        >
          <PlayIcon />
        </button>
      )}
      <button
        onClick={skipFwd10}
        title="Forward 10s"
        className="transport-button"
      >
        <ForwardIcon />
      </button>
    </div>

    {/* Right: Volume controls */}
    <div className="volume-section">
      <button
        type="button"
        onClick={onToggleMute}
        title={muted ? "Unmute" : "Mute"}
        className="volume-button"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <SoundOffIcon /> : <SoundOnIcon />}
      </button>
      {/* Custom-styled slider wrapper */}
      <div className="volume-slider-container" aria-label="Master volume">
        {/* Track background */}
        <div className="volume-track" />
        {/* Filled portion */}
        <div 
          className="volume-fill" 
          style={{ width: `${masterVol}%` }}
        />
        {/* Knob wrapper */}
        <div
          className={`volume-knob-wrapper ${draggingVol ? 'dragging' : ''}`}
          style={{ left: `${masterVol}%` }}
        >
          <VolumeKnob />
        </div>
        {/* Native input for interactions (invisible) */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={masterVol}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setMasterVol(v);
            try {
              if (engine.master) {
                const linear = Math.max(0, Math.min(1, v / 100));
                savedVolumeRef.current = linear;
                if (!muted) {
                  engine.master.gain.gain.value = linear;
                }
              }
            } catch (err) {
              console.warn("master volume set failed:", err);
            }
          }}
          onMouseDown={() => setDraggingVol(true)}
          onMouseUp={() => setDraggingVol(false)}
          onMouseLeave={() => setDraggingVol(false)}
          onTouchStart={() => setDraggingVol(true)}
          onTouchEnd={() => setDraggingVol(false)}
          className="volume-input"
        />
      </div>
    </div>
  </div>
);
}