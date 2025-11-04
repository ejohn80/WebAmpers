let _ms = 0;
let _lengthMs = 0;
let _seeker = null; // function(ms)
let _scrubStart = null; // function()
let _scrubEnd = null; // function()
const listeners = new Set();

export const progressStore = {
  getState() {
    return { ms: _ms, lengthMs: _lengthMs };
  },
  setMs(ms) {
    _ms = ms || 0;
    listeners.forEach((fn) => {
      try { fn({ ms: _ms, lengthMs: _lengthMs }); } catch {}
    });
  },
  setLengthMs(len) {
    _lengthMs = Math.max(0, Number(len) || 0);
  },
  // Register the function to perform real seeking in the engine
  setSeeker(fn) {
    _seeker = typeof fn === 'function' ? fn : null;
  },
  // Request a seek to an absolute ms; updates state and calls engine
  requestSeek(ms) {
    const clamped = Math.max(0, Math.min(Number(ms) || 0, _lengthMs || Number.POSITIVE_INFINITY));
    if (_seeker) {
      try { _seeker(clamped); } catch {}
    }
    progressStore.setMs(clamped);
  },
  setScrubStart(fn) {
    _scrubStart = typeof fn === 'function' ? fn : null;
  },
  setScrubEnd(fn) {
    _scrubEnd = typeof fn === 'function' ? fn : null;
  },
  beginScrub() {
    if (_scrubStart) {
      try { _scrubStart(); } catch {}
    }
  },
  endScrub() {
    if (_scrubEnd) {
      try { _scrubEnd(); } catch {}
    }
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
