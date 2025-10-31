import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";

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
    this.version = null;           // current loaded version/project
    this.trackBuses = new Map();   // map of track IDs to their Tone buses
    this.master = null;            // master gain node
    this.playersBySegment = new Map(); // store all active audio players
    this.preloaded = new Set();    // store URLs already preloaded
    this.rafId = null;             // requestAnimationFrame ID for updating progress

    // playback timing parameters
    this.renderAheadSec = 0.2;     // small pre-buffer before playback starts
    this.jogLatencySec = 0.02;     // latency compensation for seeking
    this.defaultFadeMs = 5;        // default fade time in milliseconds
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
    const beats = msToBeats(ms, this.version.bpm || 120);
    const jog = this.jogLatencySec * ((this.version.bpm || 120) / 60);
    Tone.Transport.position = beats + jog;
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
      msToToneTime(endMs, this.version.bpm || 120)
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
    const urls = Array.from(new Set((version.segments || []).map((s) => s.fileUrl)));
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
      const startTT = msToToneTime(seg.startOnTimelineMs || 0, version.bpm || 120);
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
      .then(() => this.events.onBuffer && this.events.onBuffer({ url, ready: true }))
      .catch((e) => this.events.onBuffer && this.events.onBuffer({ url, ready: false, error: e }));
  }

  /** Start updating progress every animation frame */
  _startRaf() {
    const tick = () => {
      const ms = this.getPositionMs();
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
      } catch {}
    });
    this.playersBySegment.clear();

    this.trackBuses.forEach((b) => {
      try {
        (b.fxOut ?? b.pan).disconnect();
        (b.chain || []).forEach((n) => n.dispose?.());
        b.pan.dispose();
        b.gain.dispose();
      } catch {}
    });
    this.trackBuses.clear();

    if (this.master) {
      try {
        (this.master.fxOut ?? this.master.gain).disconnect();
        (this.master.chain || []).forEach((n) => n.dispose?.());
        this.master.gain.dispose();
      } catch {}
    }
  }
}

/** ---------- React wrapper component ----------
 * Provides UI controls (Play/Pause/Stop) and a progress bar for the PlaybackEngine.
 */
export default function WebAmpPlayback({ version, height = 120 }) {
  const engineRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  const [trackGains, setTrackGains] = useState({});

  // Seed sliders whenever a new version loads
  useEffect(() => {
    const map = {};
    (version?.tracks || []).forEach(t => {
      map[t.id] = 50; // visual 50% default
      // also set engine default to 0 dB (neutral)
      try { engine.setTrackGainDb(t.id, 0); } catch {}
    });
    setTrackGains(map);
  }, [version]);

  // Create and memoize the engine so it persists across re-renders
  const engine = useMemo(
    () =>
      new PlaybackEngine({
        onProgress: (v) => setMs(v),
        onTransport: ({ playing }) => setPlaying(playing),
        onError: (e) => console.error(e),
      }),
    []
  );

  // Attach and clean up engine
  useEffect(() => {
    engineRef.current = engine;
    return () => engine.dispose();
  }, [engine]);

  // Load engine when version changes
  useEffect(() => {
    if (!version) return;
    engine.load(version).catch((e) => console.error("[UI] engine.load() failed:", e));
  }, [engine, version]);

  // Control handlers for play, pause, stop
  const onPlay = async () => {
    try {
      await engine.play();
    } catch (e) {
      console.error("[UI] engine.play() failed:", e);
    }
  };
  const onPause = () => engine.pause();
  const onStop = () => engine.stop();

  // Seek slider handler
  const onSeek = (e) => {
    const val = Number(e.target.value) || 0;
    try {
      engine.seekMs(val);
    } catch (err) {
      console.warn("seek failed:", err);
    }
    setMs(val);
  };

  // Format time as mm:ss.mmm
  const fmt = (t) => {
    const s = Math.floor(t / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    const msPart = Math.floor(t % 1000).toString().padStart(3, "0");
    return `${m}:${r.toString().padStart(2, "0")}.${msPart}`;
  };

  // Render player UI
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 12, border: "1px solid #333", borderRadius: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button onClick={onPlay}>▶️ Play</button>
        <button onClick={onPause}>⏸ Pause</button>
        <button onClick={onStop}>⏹ Stop</button>
      </div>

      {/* Progress bar */}
      <div style={{ margin: "8px 0" }}>
        <input
          type="range"
          min={0}
          max={version?.lengthMs ?? 60000}
          value={ms}
          onChange={onSeek}
          style={{ width: "100%" }}
        />
      </div>

      {/* Track list */}
      <div style={{ marginTop: 10 }}>
        {(version?.tracks || []).map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
              justifyContent: "space-between",
            }}
          >
            {/* left side: dot + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: t.color || "#888",
                }}
              />
              <div>{t.name ?? "Imported"}</div>
            </div>

            {/* right side: Volume slider and readout */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 240 }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Volume</span>
              <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={trackGains[t.id] ?? 50}   // stays centered at 50 visually
                  onChange={(e) => {
                    const linearValue = Number(e.target.value); // 0–100
                    const db = (linearValue - 50) * 0.24;       // map to ±12 dB range

                    setTrackGains(prev => ({ ...prev, [t.id]: linearValue }));
                    try { engine.setTrackGainDb(t.id, db); } catch (err) {
                      console.warn("setTrackGainDb failed:", err);
                    }
                  }}
                  style={{ width: 160 }}
                  aria-label={`Volume for ${t.name ?? "Imported"}`}
                />
                <code style={{ fontSize: 12, opacity: 0.85 }}>
                  {(trackGains[t.id] ?? 50)}%
                </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
