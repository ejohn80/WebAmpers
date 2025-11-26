import React, {useContext} from "react";
import {render, waitFor, act} from "@testing-library/react";
import {describe, it, beforeEach, expect, vi} from "vitest";
import AppContextProvider, {AppContext} from "../context/AppContext.jsx";

vi.mock("../hooks/useUserData", () => ({
  useUserData: () => ({userData: null, loading: false}),
}));

describe("AppContext session effect syncing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reapplies engine effects when active session changes", async () => {
    const defaults = {
      pitch: 0,
      volume: 100,
      reverb: 0,
      delay: 0,
      bass: 0,
      distortion: 0,
      pan: 0,
      tremolo: 0,
      vibrato: 0,
      highpass: 20,
      lowpass: 20000,
      chorus: 0,
    };

    const effectsBySession = {
      sessions: {
        1: {...defaults, pitch: 4},
        2: {...defaults, reverb: 65},
      },
    };

    localStorage.setItem(
      "webamp.effectsBySession",
      JSON.stringify(effectsBySession)
    );
    localStorage.setItem("webamp.activeSession", "1");

    let ctxValue;
    const Capture = () => {
      ctxValue = useContext(AppContext);
      return null;
    };

    render(
      <AppContextProvider>
        <Capture />
      </AppContextProvider>
    );

    await waitFor(() => {
      expect(ctxValue).toBeDefined();
    });

    const engineRef = {
      current: {
        applyEffects: vi.fn(),
        effects: {},
      },
    };

    await act(async () => {
      ctxValue.setEngineRef(engineRef);
    });

    await waitFor(() => {
      expect(engineRef.current.applyEffects).toHaveBeenCalledWith(
        expect.objectContaining({pitch: 4})
      );
    });

    engineRef.current.applyEffects.mockClear();

    await act(async () => {
      ctxValue.setActiveSession(2);
    });

    await waitFor(() => {
      expect(engineRef.current.applyEffects).toHaveBeenCalledWith(
        expect.objectContaining({reverb: 65})
      );
    });
  });
});
