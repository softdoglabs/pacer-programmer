// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { listenForInstallPrompt, resetInstallPrompt } from "../../platform/installPrompt";
import { usePacerStore } from "../../store/pacerStore";
import { browserFacts, resetTestBrowser, setTestBrowser } from "../../test/fakeBrowser";

const store = () => usePacerStore.getState();
const notice = () => screen.queryByRole("dialog");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  listenForInstallPrompt(window);
});

beforeEach(() => {
  localStorage.clear();
  act(() => {
    for (const e of store().library.entries) store().deleteSavedConfig(e.id);
    store().openFactoryDefaults();
    store().setBrowserNotice(undefined);
    usePacerStore.setState({ midi: { status: "disconnected", outputs: [], inputs: [], sysexEnabled: false } });
  });
});

afterEach(() => {
  cleanup();
  resetTestBrowser();
  resetInstallPrompt();
  vi.restoreAllMocks();
});

/** Chromium saying it will install the page, as it does once it decides to. */
function offerInstall() {
  const prompt = vi.fn(async () => {});
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  act(() => void window.dispatchEvent(event));
  return { event, prompt };
}

describe("a Chromium browser, which has Web MIDI and keeps what it stores", () => {
  it("opens no notice, but always has the install button, saying where the browser's Install is", () => {
    render(<App />);
    expect(notice()).toBeNull();
    // Before the browser has said anything: the button is there regardless.
    fireEvent.click(screen.getByRole("button", { name: "Install Pacer Programmer" }));
    const dialog = screen.getByRole("dialog", { name: "Install Pacer Programmer" });
    expect(dialog.textContent).toContain("install icon at the right of the address bar");
    expect(dialog.textContent).not.toContain("Web MIDI");
    expect(dialog.textContent).not.toContain("starts empty"); // Chromium's installed app shares the storage
  });

  it("shows nothing once installed", () => {
    setTestBrowser(browserFacts("chromeMac", { installed: true }));
    render(<App />);
    expect(notice()).toBeNull();
    expect(screen.queryByRole("button", { name: "Install Pacer Programmer" })).toBeNull();
  });

  it("offers nothing in a browser that can't install and has nothing to warn about", () => {
    setTestBrowser(browserFacts("firefoxMac"));
    render(<App />);
    expect(screen.queryByRole("button", { name: "Install Pacer Programmer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "What this browser can't do" })).toBeNull();
  });

  it("pops up a quiet offer once the browser can install it, which installs through the browser", async () => {
    render(<App />);
    expect(screen.queryByRole("dialog", { name: "Install Pacer Programmer" })).toBeNull();
    const { event, prompt } = offerInstall();
    expect(event.defaultPrevented).toBe(true); // the app's offer, not the browser's infobar

    const toast = screen.getByRole("dialog", { name: "Install Pacer Programmer" });
    expect(toast.textContent).toContain("Install Pacer Programmer as an app?");
    await act(async () => fireEvent.click(within(toast).getByRole("button", { name: "Install" })));
    expect(prompt).toHaveBeenCalledOnce();

    // Installed: the offer and the button step aside.
    act(() => void window.dispatchEvent(new Event("appinstalled")));
    expect(screen.queryByRole("button", { name: "Install Pacer Programmer" })).toBeNull();
  });

  it("puts the offer away for good on Not now, leaving the button to install with later", async () => {
    const { unmount } = render(<App />);
    offerInstall();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    render(<App />);
    const { prompt } = offerInstall(); // the next visit's offer
    expect(screen.queryByRole("dialog")).toBeNull(); // declined before: no pop-up

    fireEvent.click(screen.getByRole("button", { name: "Install Pacer Programmer" }));
    const dialog = screen.getByRole("dialog", { name: "Install Pacer Programmer" });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Install Pacer Programmer" })));
    expect(prompt).toHaveBeenCalledOnce();
  });
});

describe("Safari on a Mac", () => {
  beforeEach(() => setTestBrowser(browserFacts("safariMac")));

  it("opens on start titled by the threat, leads with it, then how to keep things, then no MIDI", () => {
    act(() => store().importSyxFile("gig.syx", new Uint8Array(readFileSync("fixtures/factory-presets.syx"))));
    render(<App />);
    const dialog = screen.getByRole("dialog", { name: "Safari will delete your saved configurations" });
    const text = dialog.textContent!;
    const at = (phrase: string) => {
      expect(text).toContain(phrase);
      return text.indexOf(phrase);
    };
    // Losing your work first, then the fix in steps, then MIDI in a line.
    expect(
      at("Safari will delete all your saved configuration data after 7 days of not using this site."),
    ).toBeLessThan(at("Install the app to stop Safari from deleting your configurations."));
    expect(at("File › Add to Dock…")).toBeLessThan(at("Open it from your Dock."));
    expect(at("Open it from your Dock.")).toBeLessThan(at("Safari has no Web MIDI"));
    // Nothing about moving configurations: zips, importing or exporting.
    expect(text).not.toMatch(/zip|import|export/i);
    // On a Mac, Chrome fixes both, so it's named.
    expect(at("Safari has no Web MIDI")).toBeLessThan(at("Or switch to Google Chrome, which fixes both"));
    expect(within(dialog).getByRole("link", { name: "Google Chrome" }).getAttribute("href")).toBe(
      "https://www.google.com/chrome/",
    );
    // The rest is folded away.
    expect(dialog.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(within(dialog).getByRole("link", { name: "Browsers and Installing" }).getAttribute("href")).toMatch(
      /guide\/browsers-and-installing$/,
    );
  });

  it("leads with no MIDI when Connect MIDI opened it, keeping the deletion warning with its steps", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Connect MIDI" })[0]!));

    const dialog = screen.getByRole("dialog", { name: "Safari can't connect to your Pacer" });
    const text = dialog.textContent!;
    const at = (phrase: string) => {
      expect(text).toContain(phrase);
      return text.indexOf(phrase);
    };
    const order = [
      "Safari has no Web MIDI",
      "Safari will delete all your saved configuration data",
      "Install the app to stop Safari from deleting your configurations.",
      "File › Add to Dock…",
      "Or switch to Google Chrome, which fixes both",
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("goes into its header button when closed, stays closed next time, and comes back from the button", () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(notice()).toBeNull();
    const button = screen.getByRole("button", { name: "Install Pacer Programmer" });
    expect(button.closest("[title]")?.getAttribute("title")).toMatch(/Safari deletes saved configurations/);

    unmount();
    render(<App />);
    expect(notice()).toBeNull(); // already seen

    fireEvent.click(screen.getByRole("button", { name: "Install Pacer Programmer" }));
    expect(screen.getByRole("dialog").textContent).toContain("Add to Dock");
  });

  it("still says there's no MIDI once installed, but nothing about storage or installing", () => {
    setTestBrowser(browserFacts("safariMac", { installed: true }));
    render(<App />);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("dialog", { name: "Safari can't connect to your Pacer" })).toBe(dialog);
    expect(dialog.textContent).toContain("installed or not");
    expect(dialog.textContent).not.toContain("7 days");
    expect(dialog.textContent).toContain("You're using the installed app");
    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));
    expect(screen.getByRole("button", { name: "What this browser can't do" })).toBeTruthy();
  });

  it("opens again if what it has to say changes", () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    unmount();
    setTestBrowser(browserFacts("safariMac", { installed: true })); // storage no longer expires
    render(<App />);
    expect(notice()).not.toBeNull();
  });
});

describe("iPhone and iPad", () => {
  it("says no browser there has Web MIDI, that Chrome follows Safari's rule, and how to add it to the Home Screen", () => {
    setTestBrowser(browserFacts("chromeIphone"));
    render(<App />);
    const dialog = screen.getByRole("dialog", { name: "This browser will delete your saved configurations" });
    expect(dialog.textContent).toContain("Every iPhone and iPad browser lacks Web MIDI");
    expect(dialog.textContent).toContain("On iPhone and iPad every browser follows Safari's rules");
    expect(dialog.textContent).toContain("Tap Share, then Add to Home Screen");
    // Chrome on an iPhone is Safari underneath, so suggesting it would help nothing.
    expect(dialog.textContent).not.toContain("Google Chrome");
  });
});

describe("a browser without Web MIDI", () => {
  beforeEach(() => setTestBrowser(browserFacts("chromeMac", { hasWebMidi: false })));

  it("says so without naming a browser, and offers nothing about storage", () => {
    render(<App />);
    const dialog = screen.getByRole("dialog", { name: "This browser can't connect to your Pacer" });
    expect(dialog.textContent).toContain("This browser has no Web MIDI");
    // Chrome is suggested for the MIDI alone, since nothing here deletes your work.
    expect(dialog.textContent).toContain("To connect to your Pacer, use Google Chrome, which has Web MIDI.");
    expect(dialog.textContent).not.toContain("fixes both");
    expect(dialog.textContent).not.toContain("Safari");
    expect(dialog.textContent).not.toContain("seven days");
  });

  it("opens the notice when something asks for MIDI, even after it's been closed", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(notice()).toBeNull();

    // jsdom has no Web MIDI, so asking for it comes back unsupported, as it would in this browser.
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Connect MIDI" })[0]!));
    expect(screen.getByRole("dialog", { name: "This browser can't connect to your Pacer" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    // Where Connect MIDI was, a button that says why, and opens the notice again.
    const noMidi = screen.getAllByRole("button", { name: "No MIDI in this browser" });
    expect(noMidi.length).toBeGreaterThan(0);
    fireEvent.click(noMidi[0]!);
    expect(screen.getByRole("dialog", { name: "This browser can't connect to your Pacer" })).toBeTruthy();
  });
});
