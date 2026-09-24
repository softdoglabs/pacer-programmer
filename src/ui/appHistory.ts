import { useEffect } from "react";
import type { UiMode } from "../store/editingSlice";
import { usePacerStore } from "../store/pacerStore";

/*
 * Browser navigation, without a router. The app has no URLs to speak of, but it does have places:
 * which mode you're in, which control you've opened to program, and whether the device panel is
 * showing. Going somewhere pushes a history entry, so Back returns to where you came from instead
 * of leaving the app — which is what it did, because nothing was ever pushed.
 *
 * What is deliberately *not* a place: which preset is loaded. The simulator changes it by itself —
 * a Preset Select step fires on a press — so putting it in history would fill the stack with
 * entries nobody navigated to, and Back would start undoing the simulation.
 */

export interface AppLocation {
  mode: UiMode;
  controlId?: number;
  drawer: boolean;
  /** Counts our own entries, so in-app Back knows there's one of ours to go back to. */
  n: number;
}

type Place = Omit<AppLocation, "n">;

function samePlace(a: Place | null | undefined, b: Place): boolean {
  return a?.mode === b.mode && a.controlId === b.controlId && a.drawer === b.drawer;
}

function entry(): AppLocation | null {
  return (window.history.state as AppLocation | null) ?? null;
}

/** Puts the store where a history entry says it should be. Order matters: entering Program mode clears the selected control. */
function applyPlace(place: Place) {
  const store = usePacerStore.getState();
  if (store.uiMode !== place.mode) store.setUiMode(place.mode);
  store.selectControl(place.controlId);
  store.setDeviceDrawerOpen(place.drawer);
}

/**
 * Goes back if the entry we're on is one of ours; otherwise runs `close`. The guard matters on a
 * fresh load, where going back would leave the app entirely rather than closing a panel.
 */
export function goBack(close: () => void) {
  if ((entry()?.n ?? 0) > 0) window.history.back();
  else close();
}

/** Called once, from the app root. */
export function useAppHistory() {
  const mode = usePacerStore((s) => s.uiMode);
  /*
   * Only in Program mode, where selecting a control opens its editor in place of the faceplate.
   * While simulating, the same field just remembers the last switch pressed — treating that as
   * navigation would push an entry per press and turn Back into an undo of the performance.
   */
  const controlId = usePacerStore((s) => (s.uiMode === "program" ? s.selectedControlId : undefined));
  const drawer = usePacerStore((s) => s.deviceDrawerOpen);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const place = (event.state as AppLocation | null) ?? { mode: "simulate" as const, drawer: false };
      applyPlace(place);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const here: Place = { mode, controlId, drawer };
    const state = entry();
    // Already where the current entry says: this render came *from* a Back, so pushing would
    // bury the entry we just returned to.
    if (samePlace(state, here)) return;
    if (!state)
      window.history.replaceState({ ...here, n: 0 }, ""); // first load adds no entry
    else window.history.pushState({ ...here, n: state.n + 1 }, "");
  }, [mode, controlId, drawer]);
}
