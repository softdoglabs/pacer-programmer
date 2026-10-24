// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useMemo, useSyncExternalStore } from "react";
import { browserSituation, noticeTopics, type BrowserSituation } from "../../platform/browser";
import { currentBrowserFacts } from "../../platform/currentBrowser";
import { canPromptInstall, installedThisVisit, onInstallPromptChange } from "../../platform/installPrompt";

export interface BrowserView extends BrowserSituation {
  /** What the notice has to say (`noticeTopics`); empty when nothing. */
  topics: string;
  /** The browser will show its install dialog if asked now. */
  canPrompt: boolean;
  /** Installed during this visit, so the install offer can step aside. */
  justInstalled: boolean;
}

/** This browser, as the notice and its header button see it. */
export function useBrowser(): BrowserView {
  const situation = useMemo(() => browserSituation(currentBrowserFacts()), []);
  const canPrompt = useSyncExternalStore(onInstallPromptChange, canPromptInstall, () => false);
  const justInstalled = useSyncExternalStore(onInstallPromptChange, installedThisVisit, () => false);
  return { ...situation, topics: noticeTopics(situation), canPrompt, justInstalled };
}

/**
 * Whether installing is something the app can offer here. In a Chromium browser that's whenever it
 * isn't installed, whether or not the browser has fired its prompt: the event comes once, when the
 * browser decides, and never in a tab of an app that's already installed, so the button can't
 * depend on it. Without it, the notice says where the browser's own Install is.
 */
export function installOffered(b: BrowserView): boolean {
  return !b.justInstalled && b.install !== undefined;
}

const SEEN_KEY = "pacer-programmer.browserNotice.seen";
const INSTALL_DECLINED_KEY = "pacer-programmer.installToast.declined";

/** "Not now" on the install pop-up, which then never comes back by itself (the header button stays). */
export function installDeclined(): boolean {
  try {
    return globalThis.localStorage?.getItem(INSTALL_DECLINED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberInstallDeclined() {
  try {
    globalThis.localStorage?.setItem(INSTALL_DECLINED_KEY, "1");
  } catch {
    // A convenience: without storage it just offers again next visit.
  }
}

/** The topics the notice was last closed on, so it opens by itself only when there's something new. */
export function noticeSeen(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(SEEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberNoticeSeen(topics: string) {
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, topics);
  } catch {
    // A convenience: without storage it just opens again next time.
  }
}
