import {describe, it, expect} from "vitest";
import {
  resolveSegmentStart,
  insertSegmentWithSpacing,
} from "../utils/segmentPlacement";

describe("resolveSegmentStart", () => {
  it("keeps desired position when no overlap exists", () => {
    const segments = [
      {id: "a", startOnTimelineMs: 0, durationMs: 1000},
      {id: "b", startOnTimelineMs: 2000, durationMs: 500},
    ];

    const result = resolveSegmentStart(segments, 1500);
    expect(result).toBe(1500);
  });

  it("snaps to the end of overlapping segment", () => {
    const segments = [
      {id: "a", startOnTimelineMs: 0, durationMs: 1200},
      {id: "b", startOnTimelineMs: 2000, durationMs: 800},
    ];

    const result = resolveSegmentStart(segments, 600);
    expect(result).toBe(1200);
  });

  it("chooses the closest earlier gap when overlap occurs", () => {
    const segments = [
      {id: "lead", startOnTimelineMs: 60000, durationMs: 240000},
    ];

    const result = resolveSegmentStart(segments, 62000, 11000);
    expect(result).toBe(49000);
  });

  it("falls back to pushing forward when no gap can fit the duration", () => {
    const segments = [
      {id: "a", startOnTimelineMs: 0, durationMs: 1000},
      {id: "b", startOnTimelineMs: 1200, durationMs: 800},
    ];

    const result = resolveSegmentStart(segments, 500, 1500);
    expect(result).toBe(1000);
  });
});

describe("insertSegmentWithSpacing", () => {
  it("shifts subsequent segments to make room", () => {
    const base = [
      {id: "a", startOnTimelineMs: 0, durationMs: 1000},
      {id: "b", startOnTimelineMs: 1500, durationMs: 400},
    ];
    const newSegment = {
      id: "new",
      startOnTimelineMs: 800,
      durationMs: 700,
    };

    const result = insertSegmentWithSpacing(base, newSegment);

    const newEntry = result.find((seg) => seg.id === "new");
    const movedEntry = result.find((seg) => seg.id === "b");

    expect(newEntry.startOnTimelineMs).toBe(1000);
    expect(movedEntry.startOnTimelineMs).toBe(1700);
    expect(base[1].startOnTimelineMs).toBe(1500); // original untouched
  });

  it("returns original array copy when candidate missing", () => {
    const base = [{id: "a", startOnTimelineMs: 0, durationMs: 400}];
    const result = insertSegmentWithSpacing(base, null);
    expect(result).toHaveLength(1);
    expect(result).not.toBe(base);
  });

  it("prefers the nearest available gap even when dropping inside another segment", () => {
    const base = [
      {id: "first", startOnTimelineMs: 30000, durationMs: 20000},
      {id: "second", startOnTimelineMs: 60000, durationMs: 20000},
    ];

    const newSegment = {
      id: "tiny",
      startOnTimelineMs: 35000,
      durationMs: 5000,
    };

    const result = insertSegmentWithSpacing(base, newSegment);
    const inserted = result.find((seg) => seg.id === "tiny");

    expect(inserted.startOnTimelineMs).toBe(25000);
    expect(result.find((seg) => seg.id === "first").startOnTimelineMs).toBe(30000);
    expect(result).not.toBe(base);
  });
});
