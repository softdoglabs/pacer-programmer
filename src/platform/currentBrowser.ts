// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { BrowserFacts } from "./browser";

/*
 * The facts browser.ts works from, read from the real browser. The tests replace this module
 * (src/test/setup.ts) with a browser of their choosing, so a fake Safari or a browser without Web
 * MIDI is a line in a test rather than a different jsdom.
 */

export function currentBrowserFacts(): BrowserFacts {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean; requestMIDIAccess?: unknown }) | undefined;
  const standalone = (() => {
    try {
      return globalThis.matchMedia?.("(display-mode: standalone)").matches ?? false;
    } catch {
      return false;
    }
  })();
  return {
    userAgent: nav?.userAgent ?? "",
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    hasWebMidi: typeof nav?.requestMIDIAccess === "function",
    installed: standalone || nav?.standalone === true,
  };
}
