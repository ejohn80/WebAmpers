import React from "react";
import {describe, it, expect, beforeEach, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import MainContent from "../components/Layout/MainContent";
import {AppContext} from "../context/AppContext";

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
  default: ({children, disableSectionPadding, ...rest}) => (
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

  disconnect() {}
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

const TRACK_CONTROLS_WIDTH = 70;
const TRACK_CONTROLS_GAP = 37;
const TRACK_ROW_PADDING = 8; // Keep in sync with MainContent constants

const mockAppContextValue = {
  // MainContent needs this property to avoid the TypeError
  isEffectsMenuOpen: false,
};

// Wrapper function to ensure the component is rendered with the necessary context
const renderMainContent = (props) => {
  return render(
    <AppContext.Provider value={mockAppContextValue}>
      <MainContent {...props} />
    </AppContext.Provider>
  );
};
// --- End Mock Context Setup ---

describe("MainContent multi-track layout", () => {
  beforeEach(() => {
    trackLaneMock.mockClear();
    setScrollAreaWidth(1024);
  });

  it("renders empty state when no tracks exist", () => {
    renderMainContent({tracks: [], totalLengthMs: 0});

    expect(screen.getByText(/Import an audio file/i)).toBeInTheDocument();
    expect(screen.queryByTestId("mock-tracklane")).not.toBeInTheDocument();
  });

  it("renders a TrackLane per track and stretches to the scroll width", async () => {
    setScrollAreaWidth(900);
    const tracks = [
      {id: "t1", name: "Track 1"},
      {id: "t2", name: "Track 2"},
    ];

    renderMainContent({tracks, totalLengthMs: 2000});

    await waitFor(() => {
      expect(trackLaneMock.mock.calls.length).toBeGreaterThanOrEqual(
        tracks.length
      );
    });

    const recentCalls = trackLaneMock.mock.calls.slice(-tracks.length);

    const rowWidths = recentCalls.map(([props]) => props.rowWidthPx);
    rowWidths.forEach((width) => expect(width).toBeCloseTo(900, 5));

    const timelineWidths = recentCalls.map(([props]) => props.timelineWidth);
    const staticWidth =
      TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP + TRACK_ROW_PADDING * 2;
    timelineWidths.forEach((width) =>
      expect(width).toBeCloseTo(900 - staticWidth, 5)
    );

    expect(screen.getAllByTestId("mock-tracklane")).toHaveLength(2);
  });

  it("caps default zoom width to roughly one minute for long sessions", async () => {
    setScrollAreaWidth(900);
    const tracks = [{id: "long", name: "Long Track"}];

    renderMainContent({tracks, totalLengthMs: 600000}); // 10 minutes

    await waitFor(() => {
      expect(trackLaneMock).toHaveBeenCalled();
    });

    const [{timelineWidth, rowWidthPx}] = trackLaneMock.mock.calls.slice(-1)[0];

    const staticWidth =
      TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP + TRACK_ROW_PADDING * 2;
    const expectedTimelineWidth = (900 - staticWidth) * (600000 / 60000);
    expect(timelineWidth).toBeCloseTo(expectedTimelineWidth, 0);
    expect(rowWidthPx).toBeCloseTo(expectedTimelineWidth + staticWidth, 0);

    const leftOffset =
      TRACK_ROW_PADDING + TRACK_CONTROLS_WIDTH + TRACK_CONTROLS_GAP;
    const pxPerMs = timelineWidth / 600000;
    const availableWidth = 900 - (leftOffset + TRACK_ROW_PADDING);
    const visibleWindowMs = availableWidth / pxPerMs;
    expect(visibleWindowMs).toBeCloseTo(60000, -1); // viewport shows ~1 minute
  });
});
