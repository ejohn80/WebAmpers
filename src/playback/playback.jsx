import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import * as Tone from "tone";
import {progressStore} from "./progressStore";
import {
  RewindIcon,
  ForwardIcon,
  GoToStartIcon,
  SoundOffIcon,
  VolumeKnob,
  GoToEndIcon,
  SoundOnLowIcon,
  SoundOnMediumIcon,
  SoundOnHighIcon,
} from "../components/Layout/Svgs.jsx";

import "./playback.css";
import {AppContext} from "../context/AppContext";
import PlayPauseButton from "./PlayPauseButton";

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

    // If we're at the end, restart from the beginning
    const len = this.version?.lengthMs;
    const currentMs = this.getPositionMs();
    if (typeof len === "number" && len > 0 && currentMs >= len) {
      this.seekMs(0);
      this.ended = false;
    }

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

  /**
   * Render audio buffer with effects applied using offline rendering
   * @param {Tone.ToneAudioBuffer} audioBuffer - The source audio buffer
   * @param {Object} effects - Effects object with pitch, reverb, volume
   * @returns {Promise<Tone.ToneAudioBuffer>} Rendered buffer with effects
   */
  async renderAudioWithEffects(audioBuffer, effects) {
    if (!audioBuffer) {
      throw new Error("No audio buffer provided for rendering");
    }

    const durationSeconds = audioBuffer.duration;

    // Any effects applied?
    const hasEffects =
      (effects?.pitch && effects.pitch !== 0) ||
      (effects?.reverb && effects.reverb > 0) ||
      (effects?.volume && effects.volume !== 100) ||
      (effects?.delay && effects.delay > 0) ||
      (effects?.bass && effects.bass !== 0) ||
      (effects?.distortion && effects.distortion > 0);

    // No effects --> don't do anything
    if (!hasEffects) {
      return audioBuffer;
    }

    console.log("Rendering audio with effects:", effects);

    // Render audio offline with effects applied
    const renderedBuffer = await Tone.Offline(async (context) => {
      // Original buffer
      const player = new Tone.Player({
        url: audioBuffer,
        context: context,
      });

      // Build and apply the effects chain
      const effectsChain = this._buildEffectsChain(effects, context);

      if (effectsChain.length > 0) {
        player.chain(...effectsChain, context.destination);
      } else {
        player.toDestination();
      }

      player.start(0);
    }, durationSeconds);

    console.log("Audio rendering complete");
    return renderedBuffer;
  }

  /**
   * Build Tone.js effects chain from effects object
   * @param {Object} effects - Effects configuration
   * @param {AudioContext} context - Audio context for offline rendering
   * @returns {Array} Array of Tone.js effect nodes
   */
  _buildEffectsChain(effects, context) {
    const chain = [];

    // Pitch
    if (effects?.pitch && effects.pitch !== 0) {
      try {
        const pitchShift = new Tone.PitchShift({
          pitch: effects.pitch,
          context: context,
        });
        chain.push(pitchShift);
      } catch (e) {
        console.warn("Failed to create pitch shift effect:", e);
      }
    }

    // Reverb
    if (effects?.reverb && effects.reverb > 0) {
      try {
        const wet = Math.max(0, Math.min(1, effects.reverb / 100));
        const roomSize = 0.1 + 0.85 * wet;
        const reverb = new Tone.Freeverb({
          roomSize: roomSize,
          dampening: 3000,
          wet: wet,
          context: context,
        });
        chain.push(reverb);
      } catch (e) {
        console.warn("Failed to create reverb effect:", e);
      }
    }

    // Delay
    if (effects?.delay && effects.delay > 0) {
      try {
        const wet = Math.max(0, Math.min(1, effects.delay / 100));
        const delay = new Tone.FeedbackDelay({
          delayTime: "8n", // eighth note delay
          feedback: 0.3 + 0.4 * wet, // more feedback = more repeats
          wet: wet,
          context: context,
        });
        chain.push(delay);
      } catch (e) {
        console.warn("Failed to create delay effect:", e);
      }
    }

    // Bass Boost
    if (effects?.bass && effects.bass !== 0) {
      try {
        const eq = new Tone.EQ3({
          low: effects.bass, // boost/cut in dB
          mid: 0,
          high: 0,
          context: context,
        });
        chain.push(eq);
      } catch (e) {
        console.warn("Failed to create bass boost effect:", e);
      }
    }

    // Distortion
    if (effects?.distortion && effects.distortion > 0) {
      try {
        const amount = Math.max(0, Math.min(1, effects.distortion / 100));
        const distortion = new Tone.Distortion({
          distortion: amount,
          wet: amount * 0.8,
          context: context,
        });
        chain.push(distortion);
      } catch (e) {
        console.warn("Failed to create distortion effect:", e);
      }
    }

    // Volume/Gain
    if (effects?.volume && effects.volume !== 100) {
      try {
        const gain = Math.max(0, Math.min(2, effects.volume / 100));
        const gainNode = new Tone.Gain({
          gain: gain,
          context: context,
        });
        chain.push(gainNode);
      } catch (e) {
        console.warn("Failed to create gain effect:", e);
      }
    }

    return chain;
  }

  /** Replace the master chain (placeholder for future FX support) */
  replaceMasterChain(chain) {
    const old = this.master;
    const prevLevel = (() => {
      try {
        return old?.gain?.gain?.value ?? 1;
      } catch {
        return 1;
      }
    })();

    const newMaster = this._makeMaster(chain);
    // preserve master output level (UI volume)
    try {
      newMaster.gain.gain.value = prevLevel;
    } catch {}

    // Reconnect buses to the new master head
    this.trackBuses.forEach((bus) => {
      try {
        (bus.fxOut ?? bus.pan).disconnect();
      } catch {}
      (bus.fxOut ?? bus.pan).connect(newMaster.fxIn ?? newMaster.gain);
    });

    // Swap master and dispose old safely
    this.master = newMaster;
    if (old) {
      try {
        (old.fxOut ?? old.gain).disconnect();
      } catch {}
      try {
        (old.chain || []).forEach((n) => n.dispose?.());
      } catch {}
      try {
        old.gain.dispose?.();
      } catch {}
    }
  }

  /** Set master effects from UI (pitch in semitones, reverb 0-100, volume 0-200) */
  setMasterEffects(effects) {
    const chain = [];
    // Pitch (semitones, can be negative)
    if (typeof effects?.pitch === "number" && effects.pitch !== 0) {
      chain.push({type: "pitch", semitones: effects.pitch});
    }
    // Reverb (map 0-100 -> wet 0-1, roomSize 0.1-0.95)
    if (typeof effects?.reverb === "number" && effects.reverb > 0) {
      const wet = Math.max(0, Math.min(1, effects.reverb / 100));
      const roomSize = 0.1 + 0.85 * wet;
      chain.push({type: "freeverb", wet, roomSize});
    }
    // Effect volume (0-200% -> 0.0-2.0 linear)
    if (typeof effects?.volume === "number" && effects.volume !== 100) {
      const linear = Math.max(0, Math.min(2, effects.volume / 100));
      chain.push({type: "gain", gain: linear});
    }
    // Delay
    if (typeof effects?.delay === "number" && effects.delay > 0) {
      const wet = Math.max(0, Math.min(1, effects.delay / 100));
      chain.push({
        type: "delay",
        wet,
        feedback: 0.3 + 0.4 * wet,
      });
    }
    // Bass Boost
    if (typeof effects?.bass === "number" && effects.bass !== 0) {
      chain.push({type: "eq3", low: effects.bass});
    }
    // Distortion
    if (typeof effects?.distortion === "number" && effects.distortion > 0) {
      const amount = Math.max(0, Math.min(1, effects.distortion / 100));
      chain.push({type: "distortion", amount});
    }
    // Effect volume (0-200% -> 0.0-2.0 linear)
    if (typeof effects?.volume === "number" && effects.volume !== 100) {
      const linear = Math.max(0, Math.min(2, effects.volume / 100));
      chain.push({type: "gain", gain: linear});
    }
    this.replaceMasterChain(chain);
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
      new Set((version.segments || []).map((s) => s.fileUrl))
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
        version.bpm || 120
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
    return {id: t.id, gain, pan, fxIn: null, fxOut: null, chain: []};
  }

  /** Create a master bus and connect it to the audio output */
  _makeMaster(chain) {
    const outGain = new Tone.Gain(1);

    // Build FX chain if provided
    const nodes = [];
    if (Array.isArray(chain)) {
      chain.forEach((cfg) => {
        try {
          switch (cfg?.type) {
            case "pitch": {
              const ps = new Tone.PitchShift(cfg.semitones ?? 0);
              nodes.push(ps);
              break;
            }
            case "freeverb": {
              const fv = new Tone.Freeverb({
                roomSize: Math.max(0, Math.min(1, cfg.roomSize ?? 0.8)),
                dampening: 3000,
                wet: Math.max(0, Math.min(1, cfg.wet ?? 0.5)),
              });
              nodes.push(fv);
              break;
            }
            case "delay": {
              const delay = new Tone.FeedbackDelay({
                delayTime: "8n",
                feedback: cfg.feedback ?? 0.5,
                wet: cfg.wet ?? 0.5,
              });
              nodes.push(delay);
              break;
            }
            case "eq3": {
              const eq = new Tone.EQ3({
                // THIS IS AN EQUALIZER --> (just for base)
                low: cfg.low ?? 0,
                mid: 0,
                high: 0,
              });
              nodes.push(eq);
              break;
            }
            case "distortion": {
              const dist = new Tone.Distortion({
                distortion: cfg.amount ?? 0.5,
                wet: (cfg.amount ?? 0.5) * 0.8,
              });
              nodes.push(dist);
              break;
            }
            case "gain": {
              const g = new Tone.Gain(Math.max(0, Math.min(2, cfg.gain ?? 1)));
              nodes.push(g);
              break;
            }
            default:
              break;
          }
        } catch {}
      });
    }

    // Wire: head -> ... -> tail -> outGain -> Destination
    let fxIn = null;
    let fxOut = null;
    if (nodes.length > 0) {
      fxIn = nodes[0];
      fxOut = nodes[nodes.length - 1];
      // connect nodes sequentially
      for (let i = 0; i < nodes.length - 1; i++) {
        try {
          nodes[i].connect(nodes[i + 1]);
        } catch {}
      }
      try {
        fxOut.connect(outGain);
      } catch {}
    }

    outGain.connect(Tone.Destination);
    return {gain: outGain, chain: nodes, fxIn, fxOut};
  }

  /** Handle mute/solo logic and smoothly apply gain changes */
  _applyMuteSolo() {
    if (!this.version) return;
    const tracks = this.version.tracks || [];
    const anySolo = tracks.some((t) => t.solo);

    tracks.forEach((t) => {
      const bus = this.trackBuses.get(t.id);
      if (!bus) return;
      // Mute should take precedence over solo. If a track is muted, it
      // remains effectively silent even when soloed. If any track is
      // soloed, non-soloed tracks are muted unless they are explicitly
      // unmuted.
      const shouldMute = !!t.mute || (anySolo && !t.solo);

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
        () => this.events.onBuffer && this.events.onBuffer({url, ready: true})
      )
      .catch(
        (e) =>
          this.events.onBuffer &&
          this.events.onBuffer({url, ready: false, error: e})
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

// Export the engine class so other modules (hooks/UI) can instantiate it
export {PlaybackEngine};

/** ---------- React wrapper component ----------
 * Provides UI controls (Play/Pause/Stop) and a progress bar for the PlaybackEngine.
 */
export default function WebAmpPlayback({version, onEngineReady}) {
  const engineRef = useRef(null);
  const appCtx = useContext(AppContext) || {};
  const {setEngineRef, effects} = appCtx;
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  // Restore persisted master volume / mute from localStorage when possible
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
  const [draggingVol, setDraggingVol] = useState(false);
  const wasPlayingRef = useRef(false);
  const prevMasterGainRef = useRef(0.5);
  const savedVolumeRef = useRef(0.5);
  const mutingDuringScrubRef = useRef(false);

  // Create and memoize the engine so it persists across re-renders
  const engine = useMemo(
    () =>
      new PlaybackEngine({
        onProgress: (v) => setMs(v),
        onTransport: ({playing}) => setPlaying(playing),
        onError: (e) => console.error(e),
      }),
    []
  );

  // Attach and clean up engine
  useEffect(() => {
    engineRef.current = engine;
    // expose engine to global app context so EffectsTab can control FX
    try {
      setEngineRef && setEngineRef(engineRef);
    } catch {}
    // Inform parent that the engine instance is available so it can call
    // control methods (setTrackMute, setTrackSolo, etc.).
    try {
      onEngineReady && onEngineReady(engine);
    } catch (e) {
      // swallow
    }
    return () => engine.dispose();
  }, [engine, setEngineRef, onEngineReady]);

  // Apply effects when they change from AppContext
  useEffect(() => {
    if (engine && effects) {
      try {
        engine.setMasterEffects(effects);
      } catch (error) {
        console.warn("Failed to apply effects to engine:", error);
      }
    }
  }, [engine, effects]);

  // Load engine when version changes (do not reload on play/pause)
  const prevLoadSigRef = React.useRef(null);
  useEffect(() => {
    if (!version) return;
    progressStore.setLengthMs(version.lengthMs ?? 0);
    progressStore.setSeeker((absMs) => {
      try {
        engine.seekMs(absMs);
      } catch (e) {
        console.warn("seek request failed:", e);
      }
    });

    const segSig = (version.segments || [])
      .map(
        (s) =>
          `${s.fileUrl}@${s.trackId}:${s.startOnTimelineMs || 0}-${s.durationMs || 0}`
      )
      .join("|");
    const sig = `${version.lengthMs || 0}::${segSig}`;

    if (prevLoadSigRef.current !== sig) {
      engine
        .load(version)
        .then(() => {
          try {
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

              // Apply any persisted effects after engine is loaded
              if (effects) {
                engine.setMasterEffects(effects);
              }
            }
          } catch {}
        })
        .catch((e) => console.error("[UI] engine.load() failed:", e));
      prevLoadSigRef.current = sig;
    } else {
      try {
        // Apply persisted track states to all tracks in the version
        // This ensures mute/solo states are restored after refresh
        (version.tracks || []).forEach((track) => {
          try {
            const saved = localStorage.getItem(`webamp.track.${track.id}`);
            if (saved) {
              const trackState = JSON.parse(saved);
              if (trackState.muted !== undefined) {
                engine.setTrackMute(track.id, trackState.muted);
              }
              if (trackState.soloed !== undefined) {
                engine.setTrackSolo(track.id, trackState.soloed);
              }
            }
          } catch (e) {
            console.warn(`Failed to restore state for track ${track.id}:`, e);
          }
        });
      } catch (e) {
        console.warn("Failed to apply persisted track states:", e);
      }
    }

    return () => {
      progressStore.setSeeker(null);
    };
  }, [engine, version]);

  // Keep effects application separate - this doesn't reload the engine
  useEffect(() => {
    if (engine && effects) {
      try {
        engine.setMasterEffects(effects);
      } catch (error) {
        console.warn("Failed to apply effects to engine:", error);
      }
    }
  }, [engine, effects]);

  // Keep scrub handlers updated with current playing state without reloading engine
  useEffect(() => {
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
      // if it was playing before scrub, resume playback
      if (wasPlayingRef.current) {
        engine.play().catch(() => {});
      }
    });
    return () => {
      progressStore.setScrubStart(null);
      progressStore.setScrubEnd(null);
    };
  }, [playing, engine]);

  // Control handlers for play, pause, stop
  const onPlay = async () => {
    try {
      await engine.play();
    } catch (e) {
      console.error("[UI] engine.play() failed:", e);
    }
  };
  const onPause = () => engine.pause();

  // Combined play/pause toggle
  const onTogglePlay = async () => {
    if (playing) {
      onPause();
    } else {
      await onPlay();
    }
  };

  // Skip helpers (±10s)
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

  // Jump to start (0:00)
  const goToStart = () => {
    try {
      engine.seekMs(0);
    } catch (err) {
      console.warn("goToStart failed:", err);
    }
    setMs(0);
    try {
      progressStore.setMs(0);
    } catch {}
  };

  // Jump to end of timeline
  const goToEnd = () => {
    const endMs = version?.lengthMs || 0;
    try {
      engine.seekMs(endMs);
      // Also pause if currently playing
      if (playing) {
        engine.pause();
      }
    } catch (err) {
      console.warn("goToEnd failed:", err);
    }
    setMs(endMs);
    try {
      progressStore.setMs(endMs);
    } catch {}
  };

  // Publish progress to store whenever local ms updates
  useEffect(() => {
    progressStore.setMs(ms);
  }, [ms]);

  // Global keyboard shortcuts for playback control
  useEffect(() => {
    const isEditableTarget = (el) => {
      if (!el || el === document.body) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select")
        return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute?.("role");
      if (role && role.toLowerCase() === "textbox") return true;
      if (tag === "input") {
        const type = (el.getAttribute?.("type") || "").toLowerCase();
        const textLike = [
          "text",
          "search",
          "password",
          "email",
          "number",
          "url",
          "tel",
          "date",
          "time",
          "datetime-local",
          "month",
          "week",
          "range",
        ];
        if (textLike.includes(type)) return true;
      }
      return false;
    };

    const onKeyDown = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const isSpace = e.code === "Space" || e.key === " ";
      const isLeft = e.code === "ArrowLeft" || e.key === "ArrowLeft";
      const isRight = e.code === "ArrowRight" || e.key === "ArrowRight";
      const isUp = e.code === "ArrowUp" || e.key === "ArrowUp";
      const isDown = e.code === "ArrowDown" || e.key === "ArrowDown";

      if (isSpace) {
        e.preventDefault();
        onTogglePlay();
      } else if (isLeft) {
        e.preventDefault();
        skipBack10();
      } else if (isRight) {
        e.preventDefault();
        skipFwd10();
      } else if (isUp || isDown) {
        e.preventDefault();

        // Volume control: Up increases, Down decreases
        const volumeStep = 5; // Change volume by 5% per keypress
        let newVolume = masterVol;

        if (isUp) {
          newVolume = Math.min(100, masterVol + volumeStep);
        } else if (isDown) {
          newVolume = Math.max(0, masterVol - volumeStep);
        }

        // Update volume state and engine
        setMasterVol(newVolume);

        try {
          const linear = Math.max(0, Math.min(1, newVolume / 100));

          // Update refs
          savedVolumeRef.current = linear;
          prevMasterGainRef.current = linear;

          // AUTO-UNMUTE LOGIC: Unmute immediately when increasing volume
          if (muted && newVolume > 0) {
            setMuted(false);
          }

          // AUTO-MUTE LOGIC: Mute when volume reaches 0
          if (newVolume === 0 && !muted) {
            setMuted(true);
          }

          // Apply volume to engine (respect mute state)
          if (engine.master) {
            engine.master.gain.gain.value = muted ? 0 : linear;
          }
        } catch (err) {
          console.warn("master volume set failed:", err);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onTogglePlay, skipBack10, skipFwd10, masterVol, muted, engine]);

  // Toggle mute while preserving slider value
  const onToggleMute = () => {
    try {
      if (!engine.master) return;
      if (muted) {
        // unmute to last saved volume
        const restore = Math.max(
          0,
          Math.min(1, savedVolumeRef.current ?? masterVol / 100)
        );
        const restorePercent = Math.round(restore * 100);

        engine.master.gain.gain.value = restore;
        prevMasterGainRef.current = restore;
        setMasterVol(restorePercent); // Update slider position
        setMuted(false);
        try {
          localStorage.setItem("webamp.muted", "0");
          localStorage.setItem("webamp.masterVol", String(restorePercent));
        } catch (e) {}
      } else {
        // save current volume and mute
        savedVolumeRef.current = Math.max(0, Math.min(1, masterVol / 100));
        try {
          localStorage.setItem("webamp.muted", "1");
        } catch (e) {}

        engine.master.gain.gain.value = 0;
        prevMasterGainRef.current = 0;
        setMasterVol(0); // Set slider to 0 when muting
        setMuted(true);
      }
    } catch (err) {
      console.warn("toggle mute failed:", err);
    }
  };

  // Determines the appropriate volume icon based on volume level and mute state
  const getVolumeIcon = (volume, muted) => {
    if (muted || volume === 0) {
      return <SoundOffIcon />;
    }

    if (volume <= 30) {
      return <SoundOnLowIcon />;
    } else if (volume <= 60) {
      return <SoundOnMediumIcon />;
    } else {
      return <SoundOnHighIcon />;
    }
  };

  // Format milliseconds as M:SS
  const fmtTime = (tMs) => {
    const t = Math.max(0, Math.floor((tMs || 0) / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Render player UI with CSS classes
  return (
    <div className="playback-container">
      {/* Combined transport + time section */}
      <div className="transport-time-container">
        <div className="time-section">
          <code className="time-display">
            {fmtTime(ms)}
            {typeof version?.lengthMs === "number" && version.lengthMs > 0
              ? ` / ${fmtTime(version.lengthMs)}`
              : ""}
          </code>
        </div>

        <div className="transport-section">
          <button onClick={goToStart} className="transport-button">
            <GoToStartIcon />
          </button>
          <button onClick={skipBack10} className="transport-button">
            <RewindIcon />
          </button>
          <PlayPauseButton isPlaying={playing} onToggle={onTogglePlay} />

          <button onClick={skipFwd10} className="transport-button">
            <ForwardIcon />
          </button>
          <button onClick={goToEnd} className="transport-button">
            <GoToEndIcon />
          </button>
        </div>
      </div>

      <div className="volume-section">
        <button
          type="button"
          onClick={onToggleMute}
          title={muted ? "Unmute" : `Volume: ${masterVol}%`}
          className="volume-button"
          aria-label={muted ? "Unmute" : `Volume: ${masterVol}%`}
        >
          {getVolumeIcon(masterVol, muted)}
        </button>
        <div className="volume-slider-container" aria-label="Master volume">
          <div className="volume-track" />
          <div className="volume-fill" style={{width: `${masterVol}%`}} />
          <div
            className={`volume-knob-wrapper ${draggingVol ? "dragging" : ""}`}
            style={{left: `${masterVol}%`}}
          >
            <VolumeKnob />
          </div>

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
                const linear = Math.max(0, Math.min(1, v / 100));

                // Update refs
                savedVolumeRef.current = linear;
                prevMasterGainRef.current = linear;

                // AUTO-UNMUTE LOGIC: Unmute immediately when slider is adjusted
                if (muted && v > 0) {
                  setMuted(false);
                }

                // Apply volume to engine (respect mute state)
                if (engine.master) {
                  engine.master.gain.gain.value = muted ? 0 : linear;
                }
              } catch (err) {
                console.warn("master volume set failed:", err);
              }
            }}
            onMouseDown={() => setDraggingVol(true)}
            onMouseUp={() => {
              setDraggingVol(false);
              // Persist state when dragging ends
              try {
                localStorage.setItem("webamp.masterVol", String(masterVol));
                localStorage.setItem("webamp.muted", muted ? "1" : "0");
              } catch (e) {}

              // Auto-mute if user explicitly sets volume to zero
              if (masterVol === 0 && !muted) {
                setMuted(true);
                if (engine.master) {
                  engine.master.gain.gain.value = 0;
                }
              }
            }}
            onMouseLeave={() => setDraggingVol(false)}
            onTouchStart={() => setDraggingVol(true)}
            onTouchEnd={() => {
              setDraggingVol(false);
              // Persist state when touch ends
              try {
                localStorage.setItem("webamp.masterVol", String(masterVol));
                localStorage.setItem("webamp.muted", muted ? "1" : "0");
              } catch (e) {}

              // Same auto-mute logic for touch devices
              if (masterVol === 0 && !muted) {
                setMuted(true);
              }
            }}
            className="volume-input"
          />
        </div>
      </div>
    </div>
  );
}
