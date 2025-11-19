import React from "react";
import {describe, it, expect, beforeEach, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import MainContent from "../components/Layout/MainContent.jsx";

const {trackLaneMock} = vi.hoisted(() => ({
  trackLaneMock: vi.fn(({track}) => (
    <div data-testid="mock-tracklane">{track?.name || track?.id}</div>
  )),
}));

vi.mock("../components/TrackLane/TrackLane", () => ({
  __esModule: true,
  default: trackLaneMock,
}));

vi.mock("../components/Generic/DraggableDiv", () => ({
  __esModule: true,
  default: ({children, ...rest}) => (
    <div data-testid="mock-draggable" {...rest}>
      {children}
    </div>
  ),
}));

vi.mock("../components/Generic/GlobalPlayhead", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-playhead" />,
}));

vi.mock("../components/Layout/TimelineRuler", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-timeline" />,
}));

class ResizeObserverStub {
  static width = 1024;
  static target = null;
  static callback = null;

  constructor(callback) {
    this.callback = () => callback();
    ResizeObserverStub.callback = this.callback;
  }

  observe(target) {
    ResizeObserverStub.target = target;
    Object.defineProperty(target, "clientWidth", {
      value: ResizeObserverStub.width,
      configurable: true,
    });
    this.callback();
  }

  disconnect() {
    /* noop */
  }
}

globalThis.ResizeObserver = ResizeObserverStub;

const setScrollAreaWidth = (width) => {
  ResizeObserverStub.width = width;
  if (ResizeObserverStub.target) {
    Object.defineProperty(ResizeObserverStub.target, "clientWidth", {
      value: width,
      configurable: true,
    });
  }
  ResizeObserverStub.callback?.();
};

describe("MainContent multi-track layout", () => {
  beforeEach(() => {
    trackLaneMock.mockClear();
    setScrollAreaWidth(1024);
  });

  it("renders empty state when no tracks exist", () => {
    render(<MainContent tracks={[]} totalLengthMs={0} />);

    expect(screen.getByText(/Import an audio file/i)).toBeInTheDocument();
    expect(screen.queryByTestId("mock-tracklane")).not.toBeInTheDocument();
  });

  it("renders a TrackLane per track and stretches to the scroll width", async () => {
    setScrollAreaWidth(900);
    const tracks = [
      {id: "t1", name: "Track 1"},
      {id: "t2", name: "Track 2"},
    ];

    render(<MainContent tracks={tracks} totalLengthMs={2000} />);

    await waitFor(() => {
      expect(trackLaneMock.mock.calls.length).toBeGreaterThanOrEqual(
        tracks.length
      );
    });

    const recentCalls = trackLaneMock.mock.calls.slice(-tracks.length);

    const rowWidths = recentCalls.map(([props]) => props.rowWidthPx);
    rowWidths.forEach((width) => expect(width).toBeCloseTo(900, 5));

    const timelineWidths = recentCalls.map(([props]) => props.timelineWidth);
    timelineWidths.forEach((width) =>
      expect(width).toBeCloseTo(900 - (180 + 12), 5)
    );

    expect(screen.getAllByTestId("mock-tracklane")).toHaveLength(2);
  });
});
