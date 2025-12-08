// Internal state variables - keep track of playback position and callbacks
let _ms = 0; // Current playback position in milliseconds
let _lengthMs = 0; // Total track length in milliseconds
let _seeker = null; // Function to request seek from audio engine
let _scrubStart = null; // Function called when scrub begins
let _scrubEnd = null; // Function called when scrub ends
let _scrubLocked = false; // Prevent scrub during certain operations
let _pendingSeek = null; // Seek request stored when no seeker available
let _scrubOptions = null; // Options passed during scrubbing
const listeners = new Set(); // Store UI components listening for changes

export const progressStore = {
  // Get current playback state
  getState() {
    return {ms: _ms, lengthMs: _lengthMs};
  },

  // Update playback position and notify listeners
  setMs(ms) {
    _ms = ms || 0;
    listeners.forEach((fn) => {
      try {
        fn({ms: _ms, lengthMs: _lengthMs});
      } catch (err) {
        // Suppress errors but satisfy ESLint
        console.warn("progressStore listener error:", err);
      }
    });
  },

  // Set total track length (clamp to minimum 0)
  setLengthMs(len) {
    _lengthMs = Math.max(0, Number(len) || 0);
  },

  // Register seek function from audio engine
  setSeeker(fn) {
    _seeker = typeof fn === "function" ? fn : null;
    // Execute any pending seek request now that seeker is available
    if (_seeker && Number.isFinite(_pendingSeek)) {
      try {
        _seeker(_pendingSeek);
      } catch (err) {
        console.warn("progressStore pending seek error:", err);
      }
      _pendingSeek = null;
    }
  },

  // Request seek to specific position (clamped to valid range)
  requestSeek(ms) {
    const clamped = Math.max(
      0,
      Math.min(Number(ms) || 0, _lengthMs || Number.POSITIVE_INFINITY)
    );

    // Execute seek immediately if seeker available, otherwise store for later
    if (_seeker) {
      try {
        _seeker(clamped);
      } catch (err) {
        console.warn("progressStore seeker error:", err);
      }
    } else {
      _pendingSeek = clamped;
    }

    // Update UI position state
    this.setMs(clamped);
  },

  // Register scrub start callback
  setScrubStart(fn) {
    _scrubStart = typeof fn === "function" ? fn : null;
  },

  // Register scrub end callback
  setScrubEnd(fn) {
    _scrubEnd = typeof fn === "function" ? fn : null;
  },

  // Begin scrubbing (e.g., user dragging playhead)
  beginScrub(options = {}) {
    _scrubOptions = options && typeof options === "object" ? options : {};
    if (_scrubStart) {
      try {
        _scrubStart(_scrubOptions);
      } catch (err) {
        console.warn("progressStore scrubStart error:", err);
      }
    }
  },

  // End scrubbing operation
  endScrub() {
    const opts = _scrubOptions || {};
    if (_scrubEnd) {
      try {
        _scrubEnd(opts);
      } catch (err) {
        console.warn("progressStore scrubEnd error:", err);
      }
    }
    _scrubOptions = null;
  },

  // Subscribe to progress updates (returns unsubscribe function)
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Lock/unlock scrubbing (e.g., during engine reload)
  setScrubLocked(lock) {
    _scrubLocked = !!lock;
  },

  // Check if scrubbing is currently locked
  isScrubLocked() {
    return _scrubLocked;
  },
};
