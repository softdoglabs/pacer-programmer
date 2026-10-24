// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { BrowserFacts } from "../platform/browser";

/*
 * The browser the tests run in, as far as the app's browser checks know (src/test/setup.ts puts
 * this in place of platform/currentBrowser.ts). Desktop Chrome with Web MIDI unless a test says
 * otherwise, which is the browser nothing has to be said about, so the notice stays shut.
 *
 * The user agents are real ones, one per kind of browser browser.ts tells apart.
 */

export const USER_AGENTS = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
  firefoxAndroid: "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  safariMac16:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  /** An iPad asking for desktop sites, which is the default: it says it's a Mac. */
  safariIpad:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
} as const;

export type FakeBrowserName = keyof typeof USER_AGENTS;

/** A browser's facts as the real one would report them: Web MIDI where that browser has it. */
export function browserFacts(name: FakeBrowserName, overrides: Partial<BrowserFacts> = {}): BrowserFacts {
  const apple = name.startsWith("safari") || name.endsWith("Iphone");
  return {
    userAgent: USER_AGENTS[name],
    maxTouchPoints: name === "safariIpad" || name.endsWith("Iphone") || name.endsWith("Android") ? 5 : 0,
    hasWebMidi: !apple && name !== "firefoxAndroid",
    installed: false,
    ...overrides,
  };
}

let current: BrowserFacts = browserFacts("chromeMac");

/** Makes the app see this browser until `resetTestBrowser`. Set it before rendering. */
export function setTestBrowser(facts: BrowserFacts) {
  current = facts;
}

export function resetTestBrowser() {
  current = browserFacts("chromeMac");
}

export const testBrowserFacts = () => current;
