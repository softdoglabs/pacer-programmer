// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useEffect, useRef, type ReactNode } from "react";
import { PlugZap, Share, SquarePlus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import addToDockUrl from "@/assets/browser/safari-add-to-dock.png";
import { DOCS_URL } from "@/docsSite";
import { promptInstall } from "../../platform/installPrompt";
import { usePacerStore } from "../../store/pacerStore";
import { flyTo } from "./flyTo";
import { installOffered, noticeSeen, rememberNoticeSeen, useBrowser, type BrowserView } from "./useBrowser";

/*
 * What this browser means for the app, said once when it matters and on request after that.
 *
 * It opens by itself when the app starts in a browser it has something to say about (Safari's
 * seven days, no Web MIDI) that it hasn't said yet, and whenever something asks for MIDI where
 * there isn't any. Its header button (BrowserButton) reopens it, and offers installing where
 * that's possible. Closing it shrinks it into that button, so there's no wondering where it went.
 *
 * Safari is named because it's the one browser whose rule we can say for certain; elsewhere it
 * speaks of "this browser", since a list of browsers would be incomplete and go stale. The one
 * other name is Google Chrome, suggested to Safari on a Mac because it fixes both problems.
 *
 * Short on purpose (owner's call): the title is the threat, each problem is one sentence in an
 * alert, the fix is numbered steps with a picture of what to click, and everything else waits
 * under Details. A page can't open Safari's install itself (no `beforeinstallprompt` there, on
 * the Mac or iPhone), hence the pictures.
 */

export const BROWSER_DOCS_URL = `${DOCS_URL}guide/browsers-and-installing`;
/** The header button's id, which the closing animation flies to. */
export const BROWSER_BUTTON_ID = "browser-notice-button";

export function BrowserNotice() {
  const browser = useBrowser();
  const reason = usePacerStore((s) => s.browserNotice);
  const setBrowserNotice = usePacerStore((s) => s.setBrowserNotice);
  const body = useRef<HTMLDivElement>(null);

  // On start: open if there's something to say that hasn't been seen.
  useEffect(() => {
    if (browser.topics && noticeSeen() !== browser.topics) setBrowserNotice("start");
  }, [browser.topics, setBrowserNotice]);

  const close = () => {
    rememberNoticeSeen(browser.topics);
    flyTo(body.current?.closest(".bg-popover") ?? null, document.getElementById(BROWSER_BUTTON_ID));
    setBrowserNotice(undefined);
  };

  // Asked for MIDI: that's what it's about, so it leads. Otherwise losing your work does.
  const midiFirst = reason === "midi";
  const storage = browser.storageExpires && <StorageAlert browser={browser} />;
  const midi = !browser.midi && <MidiAlert browser={browser} />;

  return (
    <ModalDialog
      isOpen={reason !== undefined}
      onOpenChange={(open) => !open && close()}
      title={noticeTitle(browser, midiFirst)}
      wide
    >
      <div ref={body} className="space-y-3 text-sm">
        {reason === "midi" && browser.midi && (
          // Web MIDI is there, but asking for it came back with nothing: unusual enough to say plainly.
          <p className="text-muted-foreground">This browser didn't give the app MIDI access.</p>
        )}
        {/* The deletion warning and its install steps stay together, whichever leads. Chrome, which
            fixes both, comes after both. */}
        {midiFirst && midi}
        {storage}
        {browser.storageExpires && <KeepSteps browser={browser} />}
        {!midiFirst && midi}
        {!browser.midi && !browser.appleMobile && <TryChrome browser={browser} />}
        {!browser.storageExpires && <InstallSection browser={browser} />}
        <FinePrint browser={browser} />
        <div className="flex justify-end">
          <Button onPress={close}>Got it</Button>
        </div>
      </div>
    </ModalDialog>
  );
}

/** The browser, as a sentence's subject. */
const who = (b: BrowserView) =>
  b.safari ? "Safari" : b.appleMobile ? "Every iPhone and iPad browser" : "This browser";

export function noticeTitle(b: BrowserView, midiFirst: boolean): string {
  const noMidi = `${b.safari ? "Safari" : b.appleMobile ? "iPhone and iPad browsers" : "This browser"} can't connect to your Pacer`;
  if (midiFirst && !b.midi) return noMidi;
  if (b.storageExpires) return `${b.safari ? "Safari" : "This browser"} will delete your saved configurations`;
  if (!b.midi) return noMidi;
  if (midiFirst) return "MIDI access wasn't given";
  return b.installed ? "You're using the installed app" : "Install Pacer Programmer";
}

function Alert({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-md border border-warning/50 bg-warning/10 p-3 font-medium text-foreground">
      <span className="mt-0.5 shrink-0 text-warning">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function StorageAlert({ browser }: { browser: BrowserView }) {
  return (
    <Alert icon={<TriangleAlert aria-hidden className="size-5" />}>
      {browser.safari ? "Safari" : "This browser"} will delete all your saved configuration data after 7 days of not
      using this site.
    </Alert>
  );
}

function MidiAlert({ browser }: { browser: BrowserView }) {
  return (
    <Alert icon={<PlugZap aria-hidden className="size-5" />}>
      {who(browser)} {browser.appleMobile && !browser.safari ? "lacks" : "has no"} Web MIDI, so the app can't reach your
      Pacer or your gear{browser.safari && !browser.appleMobile ? ", installed or not" : ""}. Everything else works.
    </Alert>
  );
}

/** What to do about the seven days: install it. */
function KeepSteps({ browser }: { browser: BrowserView }) {
  // Nothing to install with (Safari before 17).
  if (!browser.install) return null;
  return (
    // Extra room below: the steps belong to the deletion warning, and what follows doesn't.
    <section className="space-y-2 pb-4">
      <h3 className="font-medium">
        Install the app to stop {browser.safari ? "Safari" : "this browser"} from deleting your configurations.
      </h3>
      <ol className="list-decimal space-y-3 pl-5 marker:font-semibold">
        <li className="space-y-1.5">
          <InstallHow browser={browser} />
        </li>
        <li>Open it from your {browser.install === "dock" ? "Dock" : "Home Screen"}.</li>
      </ol>
    </section>
  );
}

/** The browser's own install step, in words and a picture of what to click. */
function InstallHow({ browser }: { browser: BrowserView }) {
  if (browser.install === "dock")
    return (
      <>
        <p>
          In Safari's menu bar, choose <strong>File › Add to Dock…</strong>
        </p>
        <MacMenuPicture />
      </>
    );
  if (browser.install === "home-screen")
    return (
      <>
        <p>
          Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </p>
        <SharePicture />
      </>
    );
  return null;
}

/**
 * Safari's File menu, open at Add to Dock, as it really looks (a screenshot from macOS 27, Safari
 * 27, cropped and ringed in the app's teal). Hidden from screen readers: the step's words say it.
 */
function MacMenuPicture() {
  return <img src={addToDockUrl} alt="" className="w-96 max-w-full rounded-md border shadow" />;
}

/** The Share button, and the share sheet's Add to Home Screen. */
function SharePicture() {
  return (
    <figure aria-hidden className="flex items-center gap-3 text-[12px]">
      <span className="flex size-10 items-center justify-center rounded-lg border bg-muted text-primary shadow">
        <Share className="size-5" />
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="w-52 overflow-hidden rounded-lg border bg-muted shadow">
        <span className="flex justify-between border-b px-3 py-1.5">Add to Reading List</span>
        <span className="flex items-center justify-between bg-primary px-3 py-1.5 text-primary-foreground">
          Add to Home Screen <SquarePlus className="size-4" />
        </span>
      </span>
    </figure>
  );
}

/** Where Chrome is installed from (Google's own page, so it's always the current one). */
export const CHROME_URL = "https://www.google.com/chrome/";

/**
 * Any browser without Web MIDI, off iPhone and iPad (owner's call to name one here). For Safari on a
 * Mac, Chrome fixes both problems at once; elsewhere it's the MIDI. Never on iPhone or iPad, where
 * Chrome is Safari's engine underneath and fixes neither.
 */
function TryChrome({ browser }: { browser: BrowserView }) {
  const chrome = (
    <a className="underline underline-offset-2" href={CHROME_URL} target="_blank" rel="noopener">
      Google Chrome
    </a>
  );
  return browser.storageExpires ? (
    <p>Or switch to {chrome}, which fixes both: it has Web MIDI, and it doesn't delete your configurations.</p>
  ) : (
    <p>To connect to your Pacer, use {chrome}, which has Web MIDI.</p>
  );
}

/** Installing where nothing's at risk: offered, or done. */
function InstallSection({ browser }: { browser: BrowserView }) {
  if (browser.installed)
    return <p className="text-muted-foreground">You're using the installed app, so what you save stays here.</p>;
  if (!installOffered(browser)) return null;
  // Apple's routes only exist where storage expires, and KeepSteps has them.
  if (browser.install !== "browser") return null;
  return (
    <section className="space-y-2">
      <p>Install it to open it in a window of its own, from your Dock or Start menu.</p>
      {browser.canPrompt ? (
        <Button size="sm" onPress={() => void promptInstall()}>
          Install Pacer Programmer
        </Button>
      ) : (
        <p className="text-muted-foreground">
          Use the install icon at the right of the address bar, or <strong>Install</strong> in the browser's menu. If
          there isn't one, it may already be installed: look for Pacer Programmer among your apps.
        </p>
      )}
    </section>
  );
}

/** Everything that explains rather than warns. */
function FinePrint({ browser }: { browser: BrowserView }) {
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer select-none">Details</summary>
      <div className="mt-2 space-y-1.5">
        {browser.storageExpires && (
          <>
            <p>
              A web page isn't allowed to save files on your computer, so Pacer Programmer keeps your configurations
              inside {browser.safari ? "Safari" : "your browser"}.{" "}
              {browser.appleMobile && !browser.safari
                ? "On iPhone and iPad every browser follows Safari's rules, and those clear out"
                : "Safari clears out"}{" "}
              what a site has kept there once you've gone 7 days without visiting it, to stop websites keeping track of
              you.
            </p>
            <p>
              Adding Pacer Programmer to your {browser.install === "home-screen" ? "Home Screen" : "Dock"} makes it an
              app of its own, which Safari leaves alone. The app keeps its own copy of everything, separate from{" "}
              {browser.safari ? "Safari's" : "the browser's"}, so it starts empty.
            </p>
          </>
        )}
        {!browser.midi && (
          <p>
            Web MIDI is the part of a browser that lets a web page talk to music gear.{" "}
            {browser.appleMobile
              ? "No browser on iPhone or iPad has it"
              : browser.safari
                ? "Safari doesn't have it"
                : "This browser doesn't have it"}
            , so Pacer Programmer can't read your Pacer, send to it, or play your other gear from here. Everything on
            screen still works: trying presets, editing them, the preset map, and saving and sharing files. When it's
            time to send to the Pacer, open Pacer Programmer in a browser with Web MIDI on a computer, and bring your
            configurations across as a file.
          </p>
        )}
        <p>
          More in the docs:{" "}
          <a className="underline underline-offset-2" href={BROWSER_DOCS_URL} target="_blank" rel="noopener">
            Browsers and Installing
          </a>
          .
        </p>
      </div>
    </details>
  );
}
