let _ms = 0;
let _lengthMs = 0;
let _seeker = null; // function(ms)
let _scrubStart = null; // function()
let _scrubEnd = null; // function()
let _scrubLocked = false;
let _pendingSeek = null;
const listeners = new Set();

export const progressStore = {
  getState() {
    return {ms: _ms, lengthMs: _lengthMs};
  },

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

  setLengthMs(len) {
    _lengthMs = Math.max(0, Number(len) || 0);
  },

  setSeeker(fn) {
    _seeker = typeof fn === "function" ? fn : null;
    if (_seeker && Number.isFinite(_pendingSeek)) {
      try {
        _seeker(_pendingSeek);
      } catch (err) {
        console.warn("progressStore pending seek error:", err);
      }
      _pendingSeek = null;
    }
  },

  requestSeek(ms) {
    const clamped = Math.max(
      0,
      Math.min(Number(ms) || 0, _lengthMs || Number.POSITIVE_INFINITY)
    );

    if (_seeker) {
      try {
        _seeker(clamped);
      } catch (err) {
        console.warn("progressStore seeker error:", err);
      }
    } else {
      _pendingSeek = clamped;
    }

    this.setMs(clamped);
  },

  setScrubStart(fn) {
    _scrubStart = typeof fn === "function" ? fn : null;
  },

  setScrubEnd(fn) {
    _scrubEnd = typeof fn === "function" ? fn : null;
  },

  beginScrub() {
    if (_scrubStart) {
      try {
        _scrubStart();
      } catch (err) {
        console.warn("progressStore scrubStart error:", err);
      }
    }
  },

  endScrub() {
    if (_scrubEnd) {
      try {
        _scrubEnd();
      } catch (err) {
        console.warn("progressStore scrubEnd error:", err);
      }
    }
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setScrubLocked(lock) {
    _scrubLocked = !!lock;
  },

  isScrubLocked() {
    return _scrubLocked;
  },
};
