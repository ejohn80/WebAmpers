import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";

const dbToGain = (db) => (typeof db === "number" ? Math.pow(10, db / 20) : 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const msToBeats = (ms, bpm) => (ms / 1000) * (bpm / 60);
const msToToneTime = (ms, bpm) => `${msToBeats(ms, bpm)}i`; // immutable numeric time

/** ---------- PlaybackEngine---------- */
class PlaybackEngine {
  constructor(events = {}) {
    this.events = events;

    this.version = null;
    this.trackBuses = new Map();
    this.master = null;
    this.playersBySegment = new Map();
    this.preloaded = new Set();
    this.rafId = null;

    // timings
    this.renderAheadSec = 0.2;
    this.jogLatencySec = 0.02;
    this.defaultFadeMs = 5;
  }

  async ensureAudioUnlocked() {
    if (Tone.context.state !== "running") {
      await Tone.start();
    }
  }

  async load(version) {
    await this.ensureAudioUnlocked();

    Tone.Transport.stop();
    this._cancelRaf();
    this._disposeAll();

    this.version = version;

    // transport
    Tone.Transport.bpm.value = version.bpm || 120;
    const ts = Array.isArray(version.timeSig) ? version.timeSig : [4, 4];
    Tone.Transport.timeSignature = ts;

    // master bus
    this.master = this._makeMaster(version.masterChain);

    // track buses
    (version.tracks || []).forEach((t) => {
      const bus = this._makeTrackBus(t);
      this.trackBuses.set(t.id, bus);
      (bus.fxOut ?? bus.pan).connect(this.master.fxIn ?? this.master.gain);
    });

    // segments & scheduling
    await this._prepareSegments(version);

    // loop
    if (version.loop && version.loop.enabled) {
      this.setLoop(version.loop.startMs, version.loop.endMs);
    } else {
      this.clearLoop();
    }

    this._startRaf();
  }

  async play() {
    await this.ensureAudioUnlocked();
    Tone.Transport.start("+" + this.renderAheadSec);
    this._emitTransport(true);
  }

  pause() {
    Tone.Transport.pause();
    this._emitTransport(false);
  }

  stop() {
    Tone.Transport.stop();
    this.seekMs(0);
    this._emitTransport(false);
  }

  seekMs(ms) {
    if (!this.version) return;
    const beats = msToBeats(ms, this.version.bpm || 120);
    const jog = this.jogLatencySec * ((this.version.bpm || 120) / 60);
    Tone.Transport.position = beats + jog;
  }

  getPositionMs() {
    return Tone.Transport.seconds * 1000;
  }

  setLoop(startMs, endMs) {
    if (!this.version) return;
    Tone.Transport.setLoopPoints(
      msToToneTime(startMs, this.version.bpm || 120),
      msToToneTime(endMs, this.version.bpm || 120)
    );
    Tone.Transport.loop = endMs > startMs;
  }

  clearLoop() {
    Tone.Transport.loop = false;
  }

  setTrackMute(trackId, mute) {
    if (!this.version) return;
    const t = this.version.tracks.find((x) => x.id === trackId);
    if (t) t.mute = !!mute;
    this._applyMuteSolo();
  }

  setTrackSolo(trackId, solo) {
    if (!this.version) return;
    const t = this.version.tracks.find((x) => x.id === trackId);
    if (t) t.solo = !!solo;
    this._applyMuteSolo();
  }

  setTrackGainDb(trackId, db) {
    const bus = this.trackBuses.get(trackId);
    if (bus) bus.gain.gain.value = dbToGain(db);
    if (this.version) {
      const t = this.version.tracks.find((x) => x.id === trackId);
      if (t) t.gainDb = db;
    }
  }

  setTrackPan(trackId, pan) {
    const bus = this.trackBuses.get(trackId);
    if (bus) bus.pan.pan.value = clamp(pan, -1, 1);
    if (this.version) {
      const t = this.version.tracks.find((x) => x.id === trackId);
      if (t) t.pan = pan;
    }
  }

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

  dispose() {
    this._cancelRaf();
    this._disposeAll();
  }

  /** ------- internals ------- */
  async _prepareSegments(version) {
    const urls = Array.from(new Set((version.segments || []).map((s) => s.fileUrl)));
    urls.forEach((u) => this._preload(u));

    for (const seg of version.segments || []) {
      const player = new Tone.Player({
        url: seg.fileUrl,
        autostart: false,
        loop: false,
        fadeIn: (seg.fades?.inMs ?? this.defaultFadeMs) / 1000,
        fadeOut: (seg.fades?.outMs ?? this.defaultFadeMs) / 1000,
      });

      const segGain = new Tone.Gain(dbToGain(seg.gainDb));
      const segPan = new Tone.Panner(0);

      player.connect(segGain);
      segGain.connect(segPan);

      const bus = this.trackBuses.get(seg.trackId);
      if (!bus) throw new Error(`Missing track bus for ${seg.trackId}`);
      segPan.connect(bus.fxIn ?? bus.gain);

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

      const offsetSec = (seg.startInFileMs || 0) / 1000;
      const durSec = (seg.durationMs || 0) / 1000;

      const at = msToToneTime(seg.startOnTimelineMs || 0, version.bpm || 120);
      Tone.Transport.schedule((time) => {
        try {
          player.start(time, offsetSec, durSec);
        } catch (e) {
          this.events.onError && this.events.onError(e);
        }
      }, at);

      const stopAt = msToToneTime(
        (seg.startOnTimelineMs || 0) + (seg.durationMs || 0) + 1,
        version.bpm || 120
      );
      Tone.Transport.schedule((time) => {
        try {
          player.stop(time);
        } catch {}
      }, stopAt);
    }

    this._applyMuteSolo();
  }

  _makeTrackBus(t) {
    const gain = new Tone.Gain(dbToGain(t.gainDb));
    const pan = new Tone.Panner(clamp(t.pan ?? 0, -1, 1));
    gain.connect(pan);

    const { chain, fxIn, fxOut } = this._buildFxChain(t.effectsChain);

    if (chain.length > 0) {
      gain.disconnect();
      gain.connect(chain[0]);
      chain[chain.length - 1].connect(pan);
    }

    return { id: t.id, gain, pan, fxIn, fxOut, chain };
  }

  _makeMaster(chainDef) {
    const gain = new Tone.Gain(1);
    const { chain, fxIn, fxOut } = this._buildFxChain(chainDef);

    if (chain.length > 0) {
      gain.connect(chain[0]);
      chain[chain.length - 1].connect(Tone.Destination);
    } else {
      gain.connect(Tone.Destination);
    }

    return { gain, chain, fxIn, fxOut };
  }

  _buildFxChain(defs) {
    const chain = [];
    if (Array.isArray(defs)) {
      for (const d of defs) {
        const node = this._instantiateFx(d);
        if (chain.length > 0) chain[chain.length - 1].connect(node);
        chain.push(node);
      }
    }
    return { chain, fxIn: chain[0], fxOut: chain[chain.length - 1] };
  }

  _instantiateFx(def) {
    // def = { type: "reverb", options: {...} }
    const type = def?.type || "none";
    const opt = def?.options || {};
    switch (type) {
      case "reverb":
        return new Tone.Reverb({
          decay: isFinite(opt.decay) ? opt.decay : 2.5,
          preDelay: isFinite(opt.preDelay) ? opt.preDelay : 0,
          wet: isFinite(opt.wet) ? opt.wet : 0.3,
        });
      case "delay":
        return new Tone.FeedbackDelay({
          delayTime: isFinite(opt.delayTime) ? opt.delayTime : 0.25,
          feedback: isFinite(opt.feedback) ? opt.feedback : 0.3,
          wet: isFinite(opt.wet) ? opt.wet : 0.3,
        });
      case "distortion":
        return new Tone.Distortion(isFinite(opt.amount) ? opt.amount : 0.2);
      case "filter":
        return new Tone.Filter(
          isFinite(opt.frequency) ? opt.frequency : 1000,
          opt.type || "lowpass"
        );
      case "compressor":
        return new Tone.Compressor({
          threshold: isFinite(opt.threshold) ? opt.threshold : -24,
          ratio: isFinite(opt.ratio) ? opt.ratio : 12,
          attack: isFinite(opt.attack) ? opt.attack : 0.003,
          release: isFinite(opt.release) ? opt.release : 0.25,
        });
      case "limiter":
        return new Tone.Limiter(isFinite(opt.threshold) ? opt.threshold : -1);
      case "chorus":
        return new Tone.Chorus({
          frequency: isFinite(opt.frequency) ? opt.frequency : 1.5,
          delayTime: isFinite(opt.delayTime) ? opt.delayTime : 3.5,
          depth: isFinite(opt.depth) ? opt.depth : 0.7,
          wet: isFinite(opt.wet) ? opt.wet : 0.3,
        });
      default:
        return new Tone.Gain(1); // safe passthrough
    }
  }

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
      // short ramp to avoid zipper noise
      bus.gain.gain.exponentialRampToValueAtTime(target, now + 0.01);
    });
  }

  _preload(url) {
    if (this.preloaded.has(url)) return;
    this.preloaded.add(url);
    Tone.ToneAudioBuffer.load(url)
      .then(() => this.events.onBuffer && this.events.onBuffer({ url, ready: true }))
      .catch((e) => this.events.onBuffer && this.events.onBuffer({ url, ready: false, error: e }));
  }

  _startRaf() {
    const tick = () => {
      const ms = this.getPositionMs();
      this.events.onProgress && this.events.onProgress(ms);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _cancelRaf() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  _emitTransport(playing) {
    this.events.onTransport &&
      this.events.onTransport({
        playing,
        positionMs: this.getPositionMs(),
        bpm: this.version?.bpm || 120,
      });
  }

  _disposeAll() {
    this.playersBySegment.forEach((h) => {
      try {
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

/** ---------- React wrapper component ---------- */
/**
 * Props:
 * - version: { bpm, timeSig, tracks:[], segments:[], ... } (your project snapshot)
 * - height (optional): number for simple UI
 */
export default function WebAmpPlayback({ version, height = 120 }) {
  const engineRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);

  // keep a stable engine
  const engine = useMemo(
    () =>
      new PlaybackEngine({
        onProgress: (v) => setMs(v),
        onTransport: ({ playing }) => setPlaying(playing),
        onError: (e) => console.error(e),
      }),
    []
  );

  useEffect(() => {
    engineRef.current = engine;
    return () => engine.dispose();
  }, [engine]);

  // (re)load when version changes
  useEffect(() => {
    if (!version) return;
    engine.load(version);
  }, [engine, version]);

  const onPlay = async () => {
    await engine.play();
  };
  const onPause = () => engine.pause();
  const onStop = () => engine.stop();

  const onSeek = (e) => {
    const val = Number(e.target.value) || 0;
    engine.seekMs(val);
    setMs(val);
  };

  const loopToggle = () => {
    if (!version?.lengthMs) return;
    if (Tone.Transport.loop) {
      engine.clearLoop();
    } else {
      // demo: loop 2s window around current time
      const start = Math.max(0, ms - 1000);
      const end = Math.min(version.lengthMs, start + 2000);
      engine.setLoop(start, end);
    }
  };

  const fmt = (t) => {
    const s = Math.floor(t / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    const msPart = Math.floor(t % 1000)
      .toString()
      .padStart(3, "0");
    return `${m}:${r.toString().padStart(2, "0")}.${msPart}`;
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 12, border: "1px solid #333", borderRadius: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button onClick={onPlay}>▶️ Play</button>
        <button onClick={onPause}>⏸ Pause</button>
        <button onClick={onStop}>⏹ Stop</button>
        <button onClick={loopToggle}>{Tone.Transport.loop ? "🔁 Loop: ON" : "🔁 Loop: OFF"}</button>
        <div style={{ marginLeft: "auto" }}>
          BPM: <b>{version?.bpm ?? 120}</b> &nbsp; Pos: <b>{fmt(ms)}</b>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={version?.lengthMs ?? 60000}
        value={ms}
        onChange={onSeek}
        style={{ width: "100%" }}
      />

      {/* Optional: simple track list with mute/solo */}
      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        {(version?.tracks || []).map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: t.color || "#888" }} />
            <div style={{ minWidth: 120 }}>{t.name}</div>
            <label>
              <input
                type="checkbox"
                defaultChecked={!!t.mute}
                onChange={(e) => engine.setTrackMute(t.id, e.target.checked)}
              />{" "}
              Mute
            </label>
            <label>
              <input
                type="checkbox"
                defaultChecked={!!t.solo}
                onChange={(e) => engine.setTrackSolo(t.id, e.target.checked)}
              />{" "}
              Solo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Gain
              <input
                type="range"
                min={-24}
                max={6}
                defaultValue={t.gainDb ?? 0}
                onChange={(e) => engine.setTrackGainDb(t.id, Number(e.target.value))}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Pan
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                defaultValue={t.pan ?? 0}
                onChange={(e) => engine.setTrackPan(t.id, Number(e.target.value))}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
