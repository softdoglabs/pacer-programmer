// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Chromium browsers say a page can be installed by firing `beforeinstallprompt`, once, early, and
 * only to a listener that's already there; calling the event's `prompt()` later shows their install
 * dialog. So this listens from the moment the app starts (main.tsx) and keeps the event for the
 * install button. Other browsers never fire it (MDN: not in Safari or Firefox), and the button says
 * how to install there instead.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pending: InstallPromptEvent | undefined;
let installedNow = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function listenForInstallPrompt(target: Pick<Window, "addEventListener"> = window) {
  target.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini-infobar out of the way: the app has a button for this.
    event.preventDefault();
    pending = event as InstallPromptEvent;
    changed();
  });
  target.addEventListener("appinstalled", () => {
    pending = undefined;
    installedNow = true;
    changed();
  });
}

/** Whether the browser will install it when asked, right now. */
export const canPromptInstall = () => pending !== undefined;
/** Installed during this visit (the page itself stays a tab until it's reopened from the app). */
export const installedThisVisit = () => installedNow;

export function onInstallPromptChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog. The event can only be used once. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = pending;
  if (!event) return "unavailable";
  pending = undefined;
  changed();
  await event.prompt();
  return (await event.userChoice).outcome;
}

/** Back to a visit where nothing has happened yet: for tests, which share this module. */
export function resetInstallPrompt() {
  pending = undefined;
  installedNow = false;
  changed();
}
