// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import { browserFacts } from "../../test/fakeBrowser";
import { browserSituation, noticeTopics } from "../browser";

const situation = (...args: Parameters<typeof browserFacts>) => browserSituation(browserFacts(...args));

describe("what a browser means for the app", () => {
  it("has nothing to say about a desktop Chromium browser, and installs through it", () => {
    for (const name of ["chromeMac", "edgeWindows"] as const) {
      const s = situation(name);
      expect(s).toMatchObject({
        safari: false,
        appleMobile: false,
        midi: true,
        storageExpires: false,
        install: "browser",
      });
      expect(noticeTopics(s)).toBe("");
    }
  });

  it("warns Safari on a Mac about both MIDI and its seven days, and installs with Add to Dock", () => {
    const s = situation("safariMac");
    expect(s).toMatchObject({ safari: true, appleMobile: false, midi: false, storageExpires: true, install: "dock" });
    expect(noticeTopics(s)).toBe("storage,midi");
  });

  it("offers no Add to Dock before Safari 17", () => {
    const s = situation("safariMac16");
    expect(s.install).toBeUndefined();
    expect(s.oldMacSafari).toBe(true);
  });

  it("keeps an installed Safari app's storage, but it still has no MIDI", () => {
    const s = situation("safariMac", { installed: true });
    expect(s).toMatchObject({ storageExpires: false, install: undefined, installed: true });
    expect(noticeTopics(s)).toBe("midi");
  });

  it("treats every browser on iPhone and iPad as Safari, an iPad asking for desktop sites included", () => {
    for (const name of ["safariIphone", "chromeIphone", "safariIpad"] as const) {
      const s = situation(name);
      expect(s, name).toMatchObject({ appleMobile: true, midi: false, storageExpires: true, install: "home-screen" });
    }
    expect(situation("chromeIphone").safari).toBe(false);
    expect(situation("safariIphone").safari).toBe(true);
  });

  it("goes by Web MIDI being there, never by the browser's name", () => {
    expect(situation("chromeMac", { hasWebMidi: false }).midi).toBe(false);
    expect(noticeTopics(situation("chromeMac", { hasWebMidi: false }))).toBe("midi");
    expect(situation("firefoxMac").midi).toBe(true);
  });

  it("offers no install where there's nothing worth installing", () => {
    // Desktop Firefox can't install a web app; Firefox on Android only adds a shortcut to the browser.
    expect(situation("firefoxMac").install).toBeUndefined();
    expect(situation("firefoxAndroid")).toMatchObject({ install: undefined, midi: false, storageExpires: false });
    // Samsung Internet is Chromium, and installs.
    expect(situation("samsungAndroid")).toMatchObject({ install: "browser", midi: true });
  });
});
