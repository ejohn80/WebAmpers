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

const EMPTY_TIMELINE_VERSION_TEMPLATE = Object.freeze({
  bpm: 120,
  timeSig: [4, 4],
  lengthMs: 0,
  tracks: [],
  segments: [],
  loop: {enabled: false},
  masterChain: [],
});

const createEmptyTimelineVersion = () => ({
  bpm: EMPTY_TIMELINE_VERSION_TEMPLATE.bpm,
  timeSig: [...EMPTY_TIMELINE_VERSION_TEMPLATE.timeSig],
  lengthMs: EMPTY_TIMELINE_VERSION_TEMPLATE.lengthMs,
  tracks: [],
  segments: [],
  loop: {...EMPTY_TIMELINE_VERSION_TEMPLATE.loop},
  masterChain: [...EMPTY_TIMELINE_VERSION_TEMPLATE.masterChain],
});

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
    this._disposeMaster();
    this._emitTransport(false);

    // Save the version reference
    this.version = version;
    this.ended = false;

    // Configure transport tempo and time signature
    Tone.Transport.bpm.value = version.bpm || 120;
    const ts = Array.isArray(version.timeSig) ? version.timeSig : [4, 4];
    Tone.Transport.timeSignature = ts;

    // Create master bus using the effects defined in the project's masterChain
    this.master = this._createMasterChain(version.masterChain);

    // Create all track buses and connect them to master
    (version.tracks || []).forEach((t) => {
      const bus = this._makeTrackBus(t);
      this.trackBuses.set(t.id, bus);
      (bus.fxOut ?? bus.pan).connect(this.master.fxIn);
    });

    (version.tracks || []).forEach((t) => {
      // Apply pan if it exists in effects
      if (t.effects && t.effects.pan !== undefined && t.effects.pan !== 0) {
        this.setTrackPan(t.id, t.effects.pan);
      }

      // Apply other effects
      if (t.effects) {
        this.setTrackEffects(t.id, t.effects, true);
      }
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

  /**
   * Apply effects to a specific track by rebuilding its effects chain.
   * This method updates the track's audio processing nodes and reconnects the audio graph.
   *
   * @param {string} trackId - The unique identifier of the track
   * @param {Object} effectsMap - Effects configuration object containing effect parameters
   * @param {Object} enabledEffectsMap - Map of which effects are enabled (true/false for each effect)
   * @param {boolean} [silent=false] - If true, suppresses console logging
   * @param {number} [effectsMap.pitch] - Pitch shift in semitones (-12 to +12)
   * @param {number} [effectsMap.reverb] - Reverb amount (0-100)
   * @param {number} [effectsMap.delay] - Delay amount (0-100)
   * @param {number} [effectsMap.bass] - Bass boost in dB (-12 to +12)
   * @param {number} [effectsMap.distortion] - Distortion amount (0-100)
   * @param {number} [effectsMap.volume] - Volume percentage (0-200)
   * @param {number} [effectsMap.tremolo] - Tremolo amount (0-100)
   * @param {number} [effectsMap.vibrato] - Vibrato amount (0-100)
   * @param {number} [effectsMap.highpass] - High-pass filter frequency in Hz
   * @param {number} [effectsMap.lowpass] - Low-pass filter frequency in Hz
   * @param {number} [effectsMap.chorus] - Chorus amount (0-100)
   * @param {boolean} [silent=false] - If true, suppresses console logging
   */
  setTrackEffects(trackId, effectsMap, enabledEffectsMap = {}, silent = false) {
    if (!this.version) return;

    const bus = this.trackBuses.get(trackId);
    if (!bus) return;

    if (!silent)
      console.log(
        `[setTrackEffects] Track ${trackId}`,
        effectsMap,
        enabledEffectsMap
      );

    // Store the effects map
    const track = this.version.tracks.find((x) => x.id === trackId);
    if (track) {
      track.effects = effectsMap;
      track.enabledEffects = enabledEffectsMap; // Store enabled state
    }

    const canUpdateExisting = bus.fxNodes && bus.fxNodes.length > 0;

    if (canUpdateExisting) {
      // Try to update existing effect parameters smoothly
      this._updateExistingEffectNodes(
        bus.fxNodes,
        effectsMap,
        enabledEffectsMap
      );
    }

    // If we can't update smoothly, rebuild the chain
    // 1. SAFELY DISCONNECT
    const nextNode = this.master?.fxIn || this.master?.gain;

    if (bus.fxOut) {
      try {
        if (nextNode) bus.fxOut.disconnect(nextNode);
      } catch (e) {}
    } else {
      try {
        if (nextNode) bus.pan.disconnect(nextNode);
      } catch (e) {}
    }

    // 2. DISPOSE OLD NODES
    if (bus.fxNodes && Array.isArray(bus.fxNodes)) {
      bus.fxNodes.forEach((node) => {
        try {
          node.dispose();
        } catch (e) {}
      });
    }

    // 3. BUILD NEW CHAIN (excluding pan, and filtering by enabled state)
    const fxNodes = this._buildTrackEffectsChain(effectsMap, enabledEffectsMap);
    bus.fxNodes = fxNodes;

    // 4. RECONNECT
    try {
      bus.gain.disconnect();
    } catch (e) {}

    if (fxNodes.length > 0) {
      // Chain: Gain -> Effects -> Pan
      bus.gain.connect(fxNodes[0]);

      for (let i = 0; i < fxNodes.length - 1; i++) {
        fxNodes[i].connect(fxNodes[i + 1]);
      }

      fxNodes[fxNodes.length - 1].connect(bus.pan);
      bus.fxOut = bus.pan;
    } else {
      // No effects: Gain -> Pan
      bus.gain.connect(bus.pan);
      bus.fxOut = bus.pan;
    }

    // Connect Pan to Master
    const masterDest = this.master?.fxIn || this.master?.gain;
    if (masterDest) {
      try {
        bus.pan.disconnect();
      } catch (e) {}
      bus.pan.connect(masterDest);
    }

    // Apply pan effect (pan is always enabled as it's part of the track bus)
    const panValue = effectsMap?.pan
      ? Math.max(-1, Math.min(1, effectsMap.pan / 100))
      : 0;
    bus.pan.pan.value = panValue;
  }

  /**
   * Update parameters of existing effect nodes without rebuilding the entire chain.
   * This provides smoother transitions when adjusting effect parameters in real-time.
   *
   * @private
   * @param {Array<Tone.AudioNode>} fxNodes - Array of existing Tone.js effect nodes
   * @param {Object} effectsMap - New effect parameter values to apply
   * @param {Object} enabledEffectsMap - Map of which effects are enabled
   * @returns {boolean} True if update was successful, false if chain needs rebuilding
   */
  _updateExistingEffectNodes(fxNodes, effectsMap, enabledEffectsMap = {}) {
    if (!fxNodes || fxNodes.length === 0) return false;

    try {
      // We need to check if any effects have been enabled/disabled
      // If enabled state has changed, we need to rebuild the chain
      // For now, let's just update parameters for enabled effects
      fxNodes.forEach((node) => {
        // Update Pitch Shift
        if (node instanceof Tone.PitchShift && effectsMap.pitch !== undefined) {
          if (enabledEffectsMap.pitch !== false) {
            node.pitch = effectsMap.pitch;
          }
        }

        // Update Reverb
        if (node instanceof Tone.Freeverb && effectsMap.reverb !== undefined) {
          if (enabledEffectsMap.reverb !== false) {
            const wet = Math.max(0, Math.min(1, effectsMap.reverb / 100));
            const roomSize = 0.1 + 0.85 * wet;
            node.wet.value = wet;
            node.roomSize.value = roomSize;
          }
        }

        // Update Delay
        if (
          node instanceof Tone.FeedbackDelay &&
          effectsMap.delay !== undefined
        ) {
          if (enabledEffectsMap.delay !== false) {
            const wet = Math.max(0, Math.min(1, effectsMap.delay / 100));
            node.wet.value = wet;
            node.feedback.value = 0.3 + 0.4 * wet;
          }
        }

        // Update EQ3 (Bass)
        if (node instanceof Tone.EQ3 && effectsMap.bass !== undefined) {
          if (enabledEffectsMap.bass !== false) {
            node.low.value = effectsMap.bass;
          }
        }

        // Update Distortion
        if (
          node instanceof Tone.Distortion &&
          effectsMap.distortion !== undefined
        ) {
          if (enabledEffectsMap.distortion !== false) {
            const amount = Math.max(
              0,
              Math.min(1, effectsMap.distortion / 100)
            );
            node.distortion = amount;
            node.wet.value = amount * 0.8;
          }
        }

        // Update Volume (Gain)
        if (node instanceof Tone.Gain && effectsMap.volume !== undefined) {
          if (enabledEffectsMap.volume !== false) {
            let gain = Math.max(0, Math.min(2, effectsMap.volume / 100));
            if (gain < 0.001) gain = 0.0001;

            // Smooth ramp to avoid clicks
            const now = Tone.now();
            node.gain.cancelScheduledValues(now);
            node.gain.linearRampToValueAtTime(gain, now + 0.05);
          }
        }

        // Update Tremolo
        if (node instanceof Tone.Tremolo && effectsMap.tremolo !== undefined) {
          if (enabledEffectsMap.tremolo !== false) {
            const wet = Math.max(0, Math.min(1, effectsMap.tremolo / 100));
            node.frequency.value = 0.1 + wet * 19.9;
            node.depth.value = wet;
            node.wet.value = wet;
          }
        }

        // Update Vibrato
        if (node instanceof Tone.Vibrato && effectsMap.vibrato !== undefined) {
          if (enabledEffectsMap.vibrato !== false) {
            const wet = Math.max(0, Math.min(1, effectsMap.vibrato / 100));
            node.frequency.value = 0.1 + wet * 19.9;
            node.depth.value = wet;
          }
        }

        // Update High-pass Filter
        if (
          node instanceof Tone.Filter &&
          node.type === "highpass" &&
          effectsMap.highpass !== undefined
        ) {
          if (enabledEffectsMap.highpass !== false) {
            node.frequency.value = effectsMap.highpass;
          }
        }

        // Update Low-pass Filter
        if (
          node instanceof Tone.Filter &&
          node.type === "lowpass" &&
          effectsMap.lowpass !== undefined
        ) {
          if (enabledEffectsMap.lowpass !== false) {
            node.frequency.value = effectsMap.lowpass;
          }
        }

        // Update Chorus
        if (node instanceof Tone.Chorus && effectsMap.chorus !== undefined) {
          if (enabledEffectsMap.chorus !== false) {
            const wet = Math.max(0, Math.min(1, effectsMap.chorus / 100));
            node.wet.value = wet;
          }
        }
      });

      return true; // Successfully updated
    } catch (e) {
      console.warn("Failed to update existing nodes, will rebuild:", e);
      return false; // Failed, need to rebuild
    }
  }

  /**
   * Build a chain of Tone.js audio effect nodes for a track.
   * Creates and configures all effect processors based on the provided parameters.
   * Note: Pan is handled separately by the track bus and is not included in this chain.
   *
   * @private
   * @param {Object} effectsMap - Effects configuration object
   * @param {Object} enabledEffectsMap - Map of which effects are enabled (true/false)
   * @returns {Array<Tone.AudioNode>} Array of connected Tone.js effect nodes
   */
  _buildTrackEffectsChain(effectsMap, enabledEffectsMap = {}) {
    const nodes = [];

    if (!effectsMap || typeof effectsMap !== "object") {
      return nodes;
    }

    try {
      // Pitch Shift - only add if enabled
      if (
        effectsMap.pitch &&
        Math.abs(effectsMap.pitch) > 0.01 &&
        enabledEffectsMap.pitch !== false
      ) {
        const pitchShift = new Tone.PitchShift({
          pitch: effectsMap.pitch,
        });
        nodes.push(pitchShift);
        console.log("[Effects] Added PitchShift:", effectsMap.pitch);
      }

      // Reverb - only add if enabled
      if (
        effectsMap.reverb &&
        effectsMap.reverb > 0.01 &&
        enabledEffectsMap.reverb !== false
      ) {
        const wet = Math.max(0, Math.min(1, effectsMap.reverb / 100));
        const roomSize = 0.1 + 0.85 * wet;
        const reverb = new Tone.Freeverb({
          roomSize: roomSize,
          dampening: 3000,
          wet: wet,
        });
        nodes.push(reverb);
        console.log("[Effects] Added Reverb:", effectsMap.reverb);
      }

      // Delay - only add if enabled
      if (
        effectsMap.delay &&
        effectsMap.delay > 0.01 &&
        enabledEffectsMap.delay !== false
      ) {
        const wet = Math.max(0, Math.min(1, effectsMap.delay / 100));
        const delay = new Tone.FeedbackDelay({
          delayTime: "8n",
          feedback: 0.3 + 0.4 * wet,
          wet: wet,
        });
        nodes.push(delay);
        console.log("[Effects] Added Delay:", effectsMap.delay);
      }

      // Bass Boost (EQ) - only add if enabled
      if (
        effectsMap.bass &&
        Math.abs(effectsMap.bass) > 0.01 &&
        enabledEffectsMap.bass !== false
      ) {
        const eq = new Tone.EQ3({
          low: effectsMap.bass,
          mid: 0,
          high: 0,
        });
        nodes.push(eq);
        console.log("[Effects] Added Bass:", effectsMap.bass);
      }

      // Distortion - only add if enabled
      if (
        effectsMap.distortion &&
        effectsMap.distortion > 0.01 &&
        enabledEffectsMap.distortion !== false
      ) {
        const amount = Math.max(0, Math.min(1, effectsMap.distortion / 100));
        const distortion = new Tone.Distortion({
          distortion: amount,
          wet: amount * 0.8,
        });
        nodes.push(distortion);
        console.log("[Effects] Added Distortion:", effectsMap.distortion);
      }

      // CRITICAL FIX: Volume - Always add if not exactly 100 and enabled
      if (
        effectsMap.volume !== undefined &&
        Math.abs(effectsMap.volume - 100) > 0.01 &&
        enabledEffectsMap.volume !== false
      ) {
        let gain = Math.max(0, Math.min(2, effectsMap.volume / 100));
        if (gain < 0.001) {
          gain = 0.0001;
        }
        const gainNode = new Tone.Gain(gain);
        nodes.push(gainNode);
        console.log(
          "[Effects] Added Volume:",
          effectsMap.volume,
          "gain:",
          gain
        );
      }

      // Pan is NOT in the effects chain - it's handled by track bus

      // Tremolo - only add if enabled
      if (
        effectsMap.tremolo &&
        effectsMap.tremolo > 0.01 &&
        enabledEffectsMap.tremolo !== false
      ) {
        const wet = Math.max(0, Math.min(1, effectsMap.tremolo / 100));
        const tremolo = new Tone.Tremolo({
          frequency: 0.1 + wet * 19.9,
          depth: wet,
          wet: wet,
        }).start();
        nodes.push(tremolo);
        console.log("[Effects] Added Tremolo:", effectsMap.tremolo);
      }

      // Vibrato - only add if enabled
      if (
        effectsMap.vibrato &&
        effectsMap.vibrato > 0.01 &&
        enabledEffectsMap.vibrato !== false
      ) {
        const wet = Math.max(0, Math.min(1, effectsMap.vibrato / 100));
        const vibrato = new Tone.Vibrato({
          frequency: 0.1 + wet * 19.9,
          depth: wet,
        });
        nodes.push(vibrato);
        console.log("[Effects] Added Vibrato:", effectsMap.vibrato);
      }

      // High-pass Filter - only add if enabled
      if (
        effectsMap.highpass &&
        effectsMap.highpass > 20 &&
        enabledEffectsMap.highpass !== false
      ) {
        const highpass = new Tone.Filter({
          frequency: effectsMap.highpass,
          type: "highpass",
        });
        nodes.push(highpass);
        console.log("[Effects] Added Highpass:", effectsMap.highpass);
      }

      // Low-pass Filter - only add if enabled
      if (
        effectsMap.lowpass &&
        effectsMap.lowpass < 20000 &&
        enabledEffectsMap.lowpass !== false
      ) {
        const lowpass = new Tone.Filter({
          frequency: effectsMap.lowpass,
          type: "lowpass",
        });
        nodes.push(lowpass);
        console.log("[Effects] Added Lowpass:", effectsMap.lowpass);
      }

      // Chorus - only add if enabled
      if (
        effectsMap.chorus &&
        effectsMap.chorus > 0.01 &&
        enabledEffectsMap.chorus !== false
      ) {
        const wet = Math.max(0, Math.min(1, effectsMap.chorus / 100));
        const chorus = new Tone.Chorus({
          frequency: 1.5,
          delayTime: 3.5,
          depth: 0.7,
          type: "sine",
          spread: 180,
          wet: wet,
        }).start();
        nodes.push(chorus);
        console.log("[Effects] Added Chorus:", effectsMap.chorus);
      }

      console.log(
        `[Effects] Built chain with ${nodes.length} nodes (enabled map:`,
        enabledEffectsMap,
        ")"
      );
    } catch (e) {
      console.error("Error building track effects chain:", e);
    }

    return nodes;
  }

  /**
   * Create a track bus with gain and pan nodes.
   * The bus serves as the audio routing structure for a track: Gain → Effects → Pan → Master
   *
   * @private
   * @param {Object} t - Track configuration object
   * @param {string} t.id - Track identifier
   * @param {number} t.gainDb - Track gain in decibels
   * @param {number} [t.pan=0] - Stereo pan position (-1 to +1)
   * @returns {Object} Track bus object containing gain, pan, and effect routing nodes
   */
  _makeTrackBus(t) {
    const gain = new Tone.Gain(dbToGain(t.gainDb));
    const pan = new Tone.Panner(clamp(t.pan ?? 0, -1, 1));
    gain.connect(pan);
    return {
      id: t.id,
      gain,
      pan,
      fxIn: null,
      fxOut: null,
      fxNodes: [],
      chain: [],
    };
  }

  /**
   * Solo or unsolo a specific track.
   * When any track is soloed, all non-soloed tracks are muted.
   *
   * @param {string} trackId - The unique identifier of the track
   * @param {boolean} solo - True to solo the track, false to unsolo
   */
  setTrackSolo(trackId, solo) {
    if (!this.version) return;
    const t = this.version.tracks.find((x) => x.id === trackId);
    if (t) t.solo = !!solo;
    this._applyMuteSolo();
  }

  /**
   * Adjust the gain (volume) of a track in decibels.
   * Updates both the audio node and the track's stored gain value.
   *
   * @param {string} trackId - The unique identifier of the track
   * @param {number} db - Gain value in decibels (typically -60 to +12)
   */
  setTrackGainDb(trackId, db) {
    const bus = this.trackBuses.get(trackId);
    if (bus) bus.gain.gain.value = dbToGain(db);
    if (this.version) {
      const t = this.version.tracks.find((x) => x.id === trackId);
      if (t) t.gainDb = db;
    }
  }

  /**
   * Adjust the stereo pan position of a track.
   * Converts from percentage (-100 to +100) to normalized range (-1 to +1).
   *
   * @param {string} trackId - The unique identifier of the track
   * @param {number} pan - Pan position as percentage (-100=left, 0=center, +100=right)
   */
  setTrackPan(trackId, pan) {
    const bus = this.trackBuses.get(trackId);
    if (!bus) {
      console.warn(`[setTrackPan] No bus found for track ${trackId}`);
      return;
    }

    // Convert -100 to 100 range to -1 to 1
    const panValue = Math.max(-1, Math.min(1, pan / 100));

    console.log(`[setTrackPan] Track ${trackId} pan to ${pan} (${panValue})`);

    // Set immediately (we can add smooth ramping later if needed)
    try {
      bus.pan.pan.value = panValue;
    } catch (e) {
      console.error(`[setTrackPan] Failed:`, e);
    }

    // Update version data
    if (this.version) {
      const t = this.version.tracks.find((x) => x.id === trackId);
      if (t) {
        if (!t.effects) t.effects = {};
        t.effects.pan = pan;
      }
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
      (effects?.distortion && effects.distortion > 0) ||
      (effects?.pan && effects.pan !== 0) ||
      (effects?.tremolo && effects.tremolo > 0) ||
      (effects?.vibrato && effects.vibrato > 0) ||
      (effects?.chorus && effects.chorus > 0) ||
      (effects?.highpass && effects.highpass > 20) ||
      (effects?.lowpass && effects.lowpass < 20000);

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
    // Pan
    if (effects?.pan !== undefined && effects.pan !== 0) {
      try {
        const panValue = Math.max(-1, Math.min(1, effects.pan));
        const panner = new Tone.Panner({
          pan: panValue,
          context: context,
        });
        chain.push(panner);
      } catch (e) {
        console.warn("Failed to create pan effect:", e);
      }
    }
    // Tremolo
    if (effects?.tremolo && effects.tremolo > 0) {
      try {
        const wet = Math.max(0, Math.min(1, effects.tremolo / 100));
        const tremolo = new Tone.Tremolo({
          frequency: 0.1 + wet * 19.9,
          depth: wet,
          wet: wet,
          context: context,
        }).start();
        chain.push(tremolo);
      } catch (e) {
        console.warn("Failed to create tremolo effect:", e);
      }
    }
    // Vibrato
    if (effects?.vibrato && effects.vibrato > 0) {
      try {
        const wet = Math.max(0, Math.min(1, effects.vibrato / 100));
        const vibrato = new Tone.Vibrato({
          frequency: 0.1 + wet * 19.9,
          depth: wet,
          context: context,
        });
        chain.push(vibrato);
      } catch (e) {
        console.warn("Failed to create vibrato effect:", e);
      }
    }
    // High-pass Filter
    if (effects?.highpass && effects.highpass > 20) {
      try {
        const highpass = new Tone.Filter({
          frequency: effects.highpass,
          type: "highpass",
          context: context,
        });
        chain.push(highpass);
      } catch (e) {
        console.warn("Failed to create highpass filter:", e);
      }
    }
    // Low-pass Filter
    if (effects?.lowpass && effects.lowpass < 20000) {
      try {
        const lowpass = new Tone.Filter({
          frequency: effects.lowpass,
          type: "lowpass",
          context: context,
        });
        chain.push(lowpass);
      } catch (e) {
        console.warn("Failed to create lowpass filter:", e);
      }
    }
    // Chorus
    if (effects?.chorus && effects.chorus > 0) {
      try {
        const wet = Math.max(0, Math.min(1, effects.chorus / 100));
        const chorus = new Tone.Chorus({
          frequency: 1.5,
          delayTime: 3.5,
          depth: 0.7,
          type: "sine",
          spread: 180,
          wet: wet,
          context: context,
        }).start();
        chain.push(chorus);
      } catch (e) {
        console.warn("Failed to create chorus effect:", e);
      }
    }

    return chain;
  }

  /**
   * Replace the master effects chain with a new configuration.
   * Preserves master output level and reconnects all track buses to the new master.
   *
   * @param {Array<Object>} chain - Array of effect configuration objects
   * @param {string} chain[].type - Effect type (pitch, freeverb, delay, eq3, distortion, gain, etc.)
   */
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

  /**
   * Set master effects from UI parameters.
   * Converts UI-friendly parameter ranges to internal effect configuration and applies them.
   *
   * @param {Object} effects - Master effects configuration
   * @param {number} [effects.pitch] - Pitch shift in semitones
   * @param {number} [effects.reverb] - Reverb amount (0-100)
   * @param {number} [effects.volume] - Volume percentage (0-200)
   * @param {number} [effects.delay] - Delay amount (0-100)
   * @param {number} [effects.bass] - Bass boost in dB
   * @param {number} [effects.distortion] - Distortion amount (0-100)
   * @param {number} [effects.pan] - Pan position (-1 to +1)
   * @param {number} [effects.tremolo] - Tremolo amount (0-100)
   * @param {number} [effects.vibrato] - Vibrato amount (0-100)
   * @param {number} [effects.highpass] - High-pass filter frequency in Hz
   * @param {number} [effects.lowpass] - Low-pass filter frequency in Hz
   * @param {number} [effects.chorus] - Chorus amount (0-100)
   */
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
    // Pan
    if (typeof effects?.pan === "number" && effects.pan !== 0) {
      const panValue = Math.max(-1, Math.min(1, effects.pan));
      chain.push({type: "pan", pan: panValue});
    }
    // Tremolo
    if (typeof effects?.tremolo === "number" && effects.tremolo > 0) {
      const wet = Math.max(0, Math.min(1, effects.tremolo / 100));
      chain.push({
        type: "tremolo",
        frequency: 0.1 + wet * 19.9,
        depth: wet,
        wet: wet,
      });
    }
    // Vibrato
    if (typeof effects?.vibrato === "number" && effects.vibrato > 0) {
      const wet = Math.max(0, Math.min(1, effects.vibrato / 100));
      chain.push({
        type: "vibrato",
        frequency: 0.1 + wet * 19.9,
        depth: wet,
      });
    }
    // High-pass Filter
    if (typeof effects?.highpass === "number" && effects.highpass > 20) {
      chain.push({
        type: "highpass",
        frequency: effects.highpass,
      });
    }
    // Low-pass Filter
    if (typeof effects?.lowpass === "number" && effects.lowpass < 20000) {
      chain.push({
        type: "lowpass",
        frequency: effects.lowpass,
      });
    }
    // Chorus
    if (typeof effects?.chorus === "number" && effects.chorus > 0) {
      const wet = Math.max(0, Math.min(1, effects.chorus / 100));
      chain.push({
        type: "chorus",
        frequency: 1.5,
        delayTime: 3.5,
        depth: 0.7,
        wet: wet,
      });
    }
    this.replaceMasterChain(chain);
  }

  /**
   * Dispose all audio resources to free memory.
   * Cancels animation frame updates and disposes all players and buses.
   */
  dispose() {
    this._cancelRaf();
    this._disposeAll();
  }

  // ---------- Internal methods ----------

  /** Prepare all segments (audio clips) and schedule them for playback */
  async _prepareSegments(version) {
    // Preload only string URLs; skip objects (AudioBuffer/ToneAudioBuffer)
    const urls = Array.from(
      new Set(
        (version.segments || [])
          .map((s) => s.fileUrl)
          .filter((u) => typeof u === "string" && u.length > 0)
      )
    );
    urls.forEach((u) => this._preload(u));

    for (const seg of version.segments || []) {
      // Normalize file source: allow string URL, AudioBuffer, or Tone.ToneAudioBuffer
      let src = seg.fileUrl;
      try {
        if (src && typeof src.get === "function") {
          // Tone.ToneAudioBuffer -> native AudioBuffer
          src = src.get();
        } else if (
          src &&
          src._buffer &&
          typeof src._buffer.getChannelData === "function"
        ) {
          // Some Tone versions expose native buffer under _buffer
          src = src._buffer;
        }
      } catch {}

      // Create a Tone.Player for each segment
      const player = new Tone.Player({
        url: src,
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

  /**
   * Create a master bus with optional effects chain and connect to audio output.
   * The master bus is the final stage before audio reaches the speakers.
   *
   * @private
   * @param {Array<Object>} chain - Array of effect configurations to build
   * @returns {Object} Master bus object with gain node, effect nodes, and routing
   * @returns {Tone.Gain} returns.gain - Master output gain node
   * @returns {Array<Tone.AudioNode>} returns.chain - Array of effect nodes in the chain
   * @returns {Tone.AudioNode} returns.fxIn - First node in effects chain (input)
   * @returns {Tone.AudioNode} returns.fxOut - Last node in effects chain (output)
   */
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

            case "pan": {
              const panner = new Tone.Panner(cfg.pan ?? 0);
              nodes.push(panner);
              break;
            }
            case "tremolo": {
              const tremolo = new Tone.Tremolo({
                frequency: cfg.frequency ?? 10,
                depth: cfg.depth ?? 0.5,
                wet: cfg.wet ?? 1,
              }).start();
              nodes.push(tremolo);
              break;
            }
            case "vibrato": {
              const vibrato = new Tone.Vibrato({
                frequency: cfg.frequency ?? 5,
                depth: cfg.depth ?? 0.1,
              });
              nodes.push(vibrato);
              break;
            }
            case "highpass": {
              const highpass = new Tone.Filter({
                frequency: cfg.frequency ?? 20,
                type: "highpass",
              });
              nodes.push(highpass);
              break;
            }
            case "lowpass": {
              const lowpass = new Tone.Filter({
                frequency: cfg.frequency ?? 20000,
                type: "lowpass",
              });
              nodes.push(lowpass);
              break;
            }
            case "chorus": {
              const chorus = new Tone.Chorus({
                frequency: cfg.frequency ?? 1.5,
                delayTime: cfg.delayTime ?? 3.5,
                depth: cfg.depth ?? 0.7,
                type: "sine",
                spread: 180,
                wet: cfg.wet ?? 0.5,
              }).start(); // IMPORTANT: Must call .start()
              nodes.push(chorus);
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

  /**
   * Apply mute/solo logic across all tracks.
   * Mute takes precedence over solo. If any track is soloed, all non-soloed tracks are muted.
   * Uses exponential ramping to avoid audio clicks during gain changes.
   *
   * @private
   */
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

  /**
   * Preload an audio file asynchronously to reduce playback latency.
   * Only preloads network URLs and Blob URLs, skipping already-loaded files.
   *
   * @private
   * @param {string} url - URL of the audio file to preload
   */
  _preload(url) {
    if (typeof url !== "string") return; // only preload network/Blob URLs
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

  /**
   * Start the requestAnimationFrame loop for updating playback progress.
   * Monitors playback position and automatically pauses when reaching the end.
   *
   * @private
   */
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

  /**
   * Stop the requestAnimationFrame loop.
   * Called when stopping playback or disposing the engine.
   *
   * @private
   */
  _cancelRaf() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /**
   * Emit transport state change event to React components.
   * Notifies listeners of play/pause state and current position.
   *
   * @private
   * @param {boolean} playing - Whether transport is currently playing
   */
  _emitTransport(playing) {
    this.events.onTransport &&
      this.events.onTransport({
        playing,
        positionMs: this.getPositionMs(),
        bpm: this.version?.bpm || 120,
      });
  }

  /**
   * Dispose of all audio players and track buses to free memory.
   * Disconnects all nodes, disposes resources, and clears internal maps.
   *
   * @private
   */
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

  /**
   * Dispose of the current master bus chain.
   * Disconnects and disposes all master effects nodes and the master gain node.
   *
   * @private
   */
  _disposeMaster() {
    if (this.master) {
      // If there's an effects chain (fxIn != master gain), disconnect it
      if (this.master.fxIn && this.master.fxIn !== this.master.gain) {
        this.master.fxIn.disconnect();
        if (Array.isArray(this.master.effects)) {
          // Dispose of all individual effects nodes
          this.master.effects.forEach((e) => e.dispose());
        }
      }
      // Dispose of the final gain node
      this.master.gain.dispose();
      this.master = null;
    }
  }

  /**
   * Create the master audio chain with effects applied.
   * Uses offline rendering context for building the effects chain.
   *
   * @private
   * @param {Object} effects - Effects configuration object
   * @returns {Object} Master chain object
   * @returns {Tone.Gain} returns.gain - Master gain node connected to destination
   * @returns {Tone.AudioNode} returns.fxIn - Input node for the effects chain
   * @returns {Array<Tone.AudioNode>} returns.effects - Array of effect nodes
   */
  _createMasterChain(effects = {}) {
    // Create the final gain stage (Master Volume). Connected to master output.
    const masterGain = new Tone.Gain(1).toDestination();

    // Build the effects chain using the existing Tone.js logic
    const effectsChain = this._buildEffectsChain(effects, Tone.context);

    let fxIn = masterGain; // Default input is the masterGain itself (no effects)

    if (effectsChain.length > 0) {
      for (let i = 0; i < effectsChain.length - 1; i++) {
        effectsChain[i].connect(effectsChain[i + 1]);
      }
      fxIn = effectsChain[0];
      effectsChain[effectsChain.length - 1].connect(masterGain);
    }

    return {
      gain: masterGain,
      fxIn: fxIn,
      effects: effectsChain,
    };
  }

  /**
   * Apply a new set of master effects to the audio engine.
   * Replaces and reconnects the entire master bus chain to ensure live updates.
   * All track buses are reconnected to the new master input.
   *
   * @param {Object} effects - The effects configuration object
   */
  applyEffects(effects) {
    // 1. Create the new master chain with the new effects
    const newMaster = this._createMasterChain(effects);

    // 2. Reconnect all existing track buses to the new master input
    this.trackBuses.forEach((bus) => {
      // Find the old connection point and disconnect it
      const oldMasterIn = this.master?.fxIn ?? this.master?.gain;
      if (oldMasterIn) {
        (bus.fxOut ?? bus.pan).disconnect(oldMasterIn);
      }

      // Connect to the new master input
      (bus.fxOut ?? bus.pan).connect(newMaster.fxIn);
    });

    // 3. Dispose of the old master chain
    this._disposeMaster();

    // 4. Update the internal reference
    this.master = newMaster;

    console.log("Master effects applied.");
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
    const cleanup = () => {
      progressStore.setSeeker(null);
    };

    const versionHasTracks = !!(
      version &&
      Array.isArray(version.tracks) &&
      version.tracks.length > 0
    );

    if (!versionHasTracks) {
      progressStore.setLengthMs(0);
      progressStore.setMs(0);
      progressStore.setSeeker(null);

      try {
        engine.stop();
      } catch (err) {
        console.warn("Failed to stop engine for empty session:", err);
      }

      engine
        .load(createEmptyTimelineVersion())
        .catch((e) => console.error("[UI] engine.load(empty) failed:", e));
      prevLoadSigRef.current = null;
      return cleanup;
    }

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

    return cleanup;
  }, [engine, version]);

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

  const hasNoTracks =
    !version ||
    !version.tracks ||
    version.tracks.length === 0 ||
    version.lengthMs === 0;

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

      if (hasNoTracks && (isSpace || isLeft || isRight)) {
        e.preventDefault();
        return;
      }

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

        // Volume controls remain functional even with no tracks
        const volumeStep = 5;
        let newVolume = masterVol;

        if (isUp) {
          newVolume = Math.min(100, masterVol + volumeStep);
        } else if (isDown) {
          newVolume = Math.max(0, masterVol - volumeStep);
        }

        setMasterVol(newVolume);

        try {
          const linear = Math.max(0, Math.min(1, newVolume / 100));
          savedVolumeRef.current = linear;
          prevMasterGainRef.current = linear;

          if (muted && newVolume > 0) {
            setMuted(false);
          }

          if (newVolume === 0 && !muted) {
            setMuted(true);
          }

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
  }, [
    onTogglePlay,
    skipBack10,
    skipFwd10,
    masterVol,
    muted,
    engine,
    hasNoTracks,
  ]);

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

  return (
    <div className="playback-container">
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
          <button
            onClick={goToStart}
            className="transport-button"
            disabled={hasNoTracks}
            title={hasNoTracks ? "No tracks loaded" : "Go to start"}
          >
            <GoToStartIcon />
          </button>

          <button
            onClick={skipBack10}
            className="transport-button"
            disabled={hasNoTracks}
            title={hasNoTracks ? "No tracks loaded" : "Skip backward 10s"}
          >
            <RewindIcon />
          </button>

          <PlayPauseButton
            isPlaying={playing}
            onToggle={onTogglePlay}
            disabled={hasNoTracks}
          />

          <button
            onClick={skipFwd10}
            className="transport-button"
            disabled={hasNoTracks}
            title={hasNoTracks ? "No tracks loaded" : "Skip forward 10s"}
          >
            <ForwardIcon />
          </button>

          <button
            onClick={goToEnd}
            className="transport-button"
            disabled={hasNoTracks}
            title={hasNoTracks ? "No tracks loaded" : "Go to end"}
          >
            <GoToEndIcon />
          </button>
        </div>
      </div>

      {/* Volume section - unchanged, stays enabled */}
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
                savedVolumeRef.current = linear;
                prevMasterGainRef.current = linear;

                if (muted && v > 0) {
                  setMuted(false);
                }

                if (v === 0 && !muted) {
                  setMuted(true);
                }

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
              try {
                localStorage.setItem("webamp.masterVol", String(masterVol));
                localStorage.setItem("webamp.muted", muted ? "1" : "0");
              } catch (e) {}

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
              try {
                localStorage.setItem("webamp.masterVol", String(masterVol));
                localStorage.setItem("webamp.muted", muted ? "1" : "0");
              } catch (e) {}

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
