// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * What this browser can and can't do for the app, from a few facts about it. Pure, so the tests can
 * hand it any browser; `currentBrowser.ts` reads the real one.
 *
 * Two things matter, both checked against MDN (browser compatibility data, and "Storage quotas
 * and eviction criteria"), October 2026:
 *
 * - **Web MIDI.** Detected by the API being there, never by name. It's in Chromium browsers and,
 *   behind a site-permission add-on, desktop Firefox. Safari has never shipped it, and on iPhone
 *   and iPad every browser is Safari's engine, so none of them have it either.
 * - **Storage that expires.** Safari, with its tracking prevention on (the default), deletes what a
 *   site stored from script once seven days of Safari use pass without the site being used. That's
 *   the whole library. On iPhone and iPad, tracking prevention applies in every browser. A web app
 *   added to the Home Screen or the Dock is exempt, and has storage of its own, separate from
 *   Safari's. Other browsers only evict under storage pressure, least recently used first, or when
 *   the user asks (clearing site data, private windows, clear-on-exit settings), none of which
 *   can be detected or is particular to one browser, so they're for the docs rather than a warning.
 *
 * Installing: Chromium browsers offer it themselves (`beforeinstallprompt`), Safari on the Mac has
 * File > Add to Dock from Safari 17, and on iPhone and iPad any browser has Share > Add to Home
 * Screen from iOS 16.4. Desktop Firefox can't install a web app (an experimental Windows feature
 * aside), and Firefox on Android only adds a shortcut that opens the browser, which changes nothing
 * here, so neither is offered.
 */

export interface BrowserFacts {
  userAgent: string;
  /** `navigator.maxTouchPoints`: an iPad asking for desktop sites calls itself a Mac. */
  maxTouchPoints: number;
  /** `navigator.requestMIDIAccess` exists. */
  hasWebMidi: boolean;
  /** Running as an installed app (display-mode standalone, or iOS's `navigator.standalone`). */
  installed: boolean;
}

export type InstallRoute =
  /** The browser installs it when asked (its own prompt, or its menu). */
  | "browser"
  /** iPhone and iPad: Share, then Add to Home Screen. */
  | "home-screen"
  /** Safari on a Mac: File, then Add to Dock. */
  | "dock";

export interface BrowserSituation {
  /** On an iPhone or iPad, whichever browser. */
  appleMobile: boolean;
  /** Safari itself (on a Mac, iPhone or iPad). */
  safari: boolean;
  midi: boolean;
  installed: boolean;
  /** What's saved here can be deleted after seven days of not using the app. */
  storageExpires: boolean;
  /** How it could be installed, if it isn't and can be. */
  install?: InstallRoute;
  /** Safari on a Mac older than 17, which has no Add to Dock. */
  oldMacSafari: boolean;
}

export function browserSituation(facts: BrowserFacts): BrowserSituation {
  const ua = facts.userAgent;
  const ipadAsMac = /Macintosh/.test(ua) && facts.maxTouchPoints > 1;
  const appleMobile = /iPhone|iPad|iPod/.test(ua) || ipadAsMac;
  const otherEngineName = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|OPT\/|Firefox|SamsungBrowser/.test(ua);
  const safari = /Safari\//.test(ua) && /Version\//.test(ua) && !otherEngineName;
  const macSafari = safari && !appleMobile && /Macintosh/.test(ua);
  const safariVersion = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
  const chromium = !appleMobile && /Chrome\/|Chromium\//.test(ua);
  // Tracking prevention's seven days: Safari, and every browser on iPhone and iPad.
  const storageExpires = (macSafari || appleMobile) && !facts.installed;

  let install: InstallRoute | undefined;
  if (!facts.installed) {
    if (appleMobile) install = "home-screen";
    else if (macSafari && safariVersion >= 17) install = "dock";
    else if (chromium) install = "browser";
  }
  return {
    appleMobile,
    safari,
    midi: facts.hasWebMidi,
    installed: facts.installed,
    storageExpires,
    install,
    oldMacSafari: macSafari && safariVersion > 0 && safariVersion < 17,
  };
}

/**
 * What the notice has to say, as a key: it's shown again when this changes (say, from "storage,
 * midi" in Safari to "midi" once installed), and not before.
 */
export function noticeTopics(s: BrowserSituation): string {
  return [s.storageExpires && "storage", !s.midi && "midi"].filter(Boolean).join(",");
}
