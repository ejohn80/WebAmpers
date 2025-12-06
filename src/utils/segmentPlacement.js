const clampMs = (value) => {
  if (!Number.isFinite(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  return Math.max(0, Math.round(value));
};

const cloneSegment = (segment) => {
  if (!segment) return null;

  // Create a deep copy that preserves all properties including assetId
  return {
    ...segment,
    // Explicitly preserve critical properties that must not be lost
    id: segment.id,
    assetId: segment.assetId,
    buffer: segment.buffer,
    offset: segment.offset,
    duration: segment.duration,
    durationMs: segment.durationMs,
    startOnTimelineMs: segment.startOnTimelineMs,
    startInFileMs: segment.startInFileMs,
    startOnTimeline: segment.startOnTimeline,
    // Preserve any other properties via spread
  };
};

const getStartMs = (segment) => {
  if (!segment) return 0;
  if (Number.isFinite(segment.startOnTimelineMs)) {
    return clampMs(segment.startOnTimelineMs);
  }
  if (Number.isFinite(segment.startOnTimeline)) {
    return clampMs(segment.startOnTimeline * 1000);
  }
  return 0;
};

const getDurationMs = (segment) => {
  if (!segment) return 0;
  if (Number.isFinite(segment.durationMs)) {
    return clampMs(segment.durationMs);
  }
  if (Number.isFinite(segment.duration)) {
    return clampMs(segment.duration * 1000);
  }
  return 0;
};

const applyStartTime = (segment, startMs) => {
  const safeStart = clampMs(startMs);
  segment.startOnTimelineMs = safeStart;
  segment.startOnTimeline = safeStart / 1000;
  return segment;
};

const buildMergedSegments = (segments) => {
  const bounds = [];

  segments.forEach((segment) => {
    if (!segment) return;
    const start = getStartMs(segment);
    const duration = getDurationMs(segment);
    if (duration <= 0) return;
    bounds.push({start, end: start + duration});
  });

  bounds.sort((a, b) => a.start - b.start);

  if (bounds.length === 0) {
    return bounds;
  }

  const merged = [bounds[0]];

  for (let i = 1; i < bounds.length; i += 1) {
    const current = bounds[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({...current});
    }
  }

  return merged;
};

const pushForwardPastOverlaps = (mergedSegments, desiredStart) => {
  let resolved = clampMs(desiredStart);

  mergedSegments.forEach(({start, end}) => {
    if (start <= resolved && end > resolved) {
      resolved = end;
    }
  });

  return clampMs(resolved);
};

const findNearestGapPlacement = (mergedSegments, desiredStart, durationMs) => {
  const safeDesired = clampMs(desiredStart);
  const safeDuration = clampMs(durationMs);

  if (mergedSegments.length === 0) {
    return safeDesired;
  }

  let cursor = 0;
  const gaps = [];

  mergedSegments.forEach(({start, end}) => {
    if (start > cursor) {
      gaps.push({start: cursor, end: start});
    }
    cursor = Math.max(cursor, end);
  });

  gaps.push({start: cursor, end: Number.POSITIVE_INFINITY});

  let bestStart = null;
  let smallestDelta = Number.POSITIVE_INFINITY;

  gaps.forEach(({start, end}) => {
    const isInfinite = end === Number.POSITIVE_INFINITY;
    const gapSpan = isInfinite ? Number.POSITIVE_INFINITY : end - start;
    if (!isInfinite && gapSpan < safeDuration) {
      return;
    }

    if (isInfinite && safeDesired < start) {
      return;
    }

    const maxStart = isInfinite ? Number.POSITIVE_INFINITY : end - safeDuration;
    let candidate = safeDesired;

    if (candidate < start) {
      candidate = start;
    } else if (candidate > maxStart) {
      candidate = maxStart;
    }

    if (!isInfinite && candidate < start) {
      return;
    }

    const delta = Math.abs(candidate - safeDesired);
    if (
      bestStart === null ||
      delta < smallestDelta ||
      (delta === smallestDelta && candidate < bestStart)
    ) {
      bestStart = candidate;
      smallestDelta = delta;
    }
  });

  return bestStart;
};

/**
 * Ensure a new segment does not overlap any earlier segments on the same track.
 * If the desired drop position falls inside an existing segment, the start point
 * is snapped to the end of that segment.
 */
export const resolveSegmentStart = (
  segments = [],
  desiredStartMs = 0,
  durationMs = 0
) => {
  const mergedSegments = buildMergedSegments(segments);
  const safeDesired = clampMs(desiredStartMs);
  const safeDuration = clampMs(durationMs);

  if (mergedSegments.length === 0) {
    return safeDesired;
  }

  if (safeDuration <= 0) {
    return pushForwardPastOverlaps(mergedSegments, safeDesired);
  }

  const nearestGap = findNearestGapPlacement(
    mergedSegments,
    safeDesired,
    safeDuration
  );

  if (nearestGap !== null && Number.isFinite(nearestGap)) {
    return clampMs(nearestGap);
  }

  return pushForwardPastOverlaps(mergedSegments, safeDesired);
};

/**
 * Insert a segment into the provided list while ensuring there are no overlaps.
 * Subsequent segments are shifted to the right if necessary to make room.
 * Returns a new array without mutating the original segment list.
 */
export const insertSegmentWithSpacing = (segments = [], candidateSegment) => {
  if (!candidateSegment) {
    return Array.isArray(segments) ? segments.slice() : [];
  }

  const working = Array.isArray(segments)
    ? segments.map((segment) => cloneSegment(segment))
    : [];

  const newSegment = cloneSegment(candidateSegment);

  // Preserve assetId explicitly
  if (candidateSegment.assetId && !newSegment.assetId) {
    newSegment.assetId = candidateSegment.assetId;
  }

  const segmentDuration = getDurationMs(newSegment);
  if (!Number.isFinite(newSegment.durationMs) && segmentDuration > 0) {
    newSegment.durationMs = segmentDuration;
  }
  if (!Number.isFinite(newSegment.duration) && segmentDuration > 0) {
    newSegment.duration = segmentDuration / 1000;
  }

  applyStartTime(
    newSegment,
    resolveSegmentStart(working, newSegment.startOnTimelineMs, segmentDuration)
  );

  working.push(newSegment);
  working.sort(
    (a, b) => clampMs(a.startOnTimelineMs) - clampMs(b.startOnTimelineMs)
  );

  const insertedIndex = working.findIndex((segment) => segment === newSegment);

  // Shift any subsequent segments that would overlap with the new placement
  for (let i = insertedIndex + 1; i < working.length; i += 1) {
    const prev = working[i - 1];
    const curr = working[i];
    const prevStart = clampMs(prev.startOnTimelineMs);
    const prevEnd = prevStart + clampMs(prev.durationMs);

    if (clampMs(curr.startOnTimelineMs) < prevEnd) {
      // Clone and apply new start time while preserving all properties
      const shifted = cloneSegment(curr);
      applyStartTime(shifted, prevEnd);
      working[i] = shifted;
    }
  }

  return working;
};

export const __private__ = {
  clampMs,
  applyStartTime,
  getStartMs,
  getDurationMs,
  buildMergedSegments,
};
