import {useCallback, useEffect, useRef} from "react";
import {progressStore} from "../playback/progressStore";

/**
 * Shared helper for pointer-based scrubbing interactions.
 * Handles sequencing begin/update/end calls and throttles seek requests
 * so consumers only need to provide pointer math.
 */
export function useScrubController({pauseTransport = false} = {}) {
  const activeRef = useRef(false);
  const rafRef = useRef(null);
  const pendingSeekRef = useRef(null);

  const cancelScheduledSeek = useCallback(() => {
    if (typeof window !== "undefined" && rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingSeekRef.current = null;
  }, []);

  const scheduleSeek = useCallback((ms) => {
    if (typeof ms !== "number") return;
    pendingSeekRef.current = ms;

    const scheduler =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : null;

    if (!scheduler) {
      const pending = pendingSeekRef.current;
      pendingSeekRef.current = null;
      if (typeof pending === "number") {
        try {
          progressStore.requestSeek(pending);
        } catch (err) {
          console.warn("useScrubController requestSeek error:", err);
        }
      }
      return;
    }

    if (rafRef.current !== null) return;
    rafRef.current = scheduler(() => {
      const pending = pendingSeekRef.current;
      pendingSeekRef.current = null;
      rafRef.current = null;
      if (typeof pending === "number") {
        try {
          progressStore.requestSeek(pending);
        } catch (err) {
          console.warn("useScrubController requestSeek error:", err);
        }
      }
    });
  }, []);

  const beginScrub = useCallback(
    (ms) => {
      if (!activeRef.current) {
        try {
          progressStore.beginScrub({pauseTransport});
        } catch (err) {
          console.warn("useScrubController beginScrub error:", err);
        }
        activeRef.current = true;
      }

      if (typeof ms === "number") {
        try {
          progressStore.setMs(ms);
        } catch (err) {
          console.warn("useScrubController setMs error:", err);
        }
        scheduleSeek(ms);
      }
    },
    [pauseTransport, scheduleSeek]
  );

  const updateScrub = useCallback(
    (ms) => {
      if (!activeRef.current || typeof ms !== "number") return;
      try {
        progressStore.setMs(ms);
      } catch (err) {
        console.warn("useScrubController setMs error:", err);
      }
      scheduleSeek(ms);
    },
    [scheduleSeek]
  );

  const endScrub = useCallback(
    (ms) => {
      if (!activeRef.current) {
        cancelScheduledSeek();
        return;
      }

      const finalValue =
        typeof ms === "number" ? ms : progressStore.getState().ms;

      try {
        progressStore.setMs(finalValue);
        progressStore.requestSeek(finalValue);
        progressStore.endScrub();
      } catch (err) {
        console.warn("useScrubController endScrub error:", err);
      }

      activeRef.current = false;
      cancelScheduledSeek();
    },
    [cancelScheduledSeek]
  );

  const cancelScrub = useCallback(() => {
    if (activeRef.current) {
      try {
        progressStore.endScrub();
      } catch (err) {
        console.warn("useScrubController cancelScrub error:", err);
      }
      activeRef.current = false;
    }
    cancelScheduledSeek();
  }, [cancelScheduledSeek]);

  useEffect(() => cancelScrub, [cancelScrub]);

  return {
    beginScrub,
    updateScrub,
    endScrub,
    cancelScrub,
    isScrubbing: () => activeRef.current,
  };
}

export default useScrubController;
