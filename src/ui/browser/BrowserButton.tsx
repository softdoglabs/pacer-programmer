// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { HardDriveDownload, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePacerStore } from "../../store/pacerStore";
import { BROWSER_BUTTON_ID } from "./BrowserNotice";
import { installOffered, useBrowser } from "./useBrowser";

/**
 * The browser notice's home in the header: where it goes when it's closed, and how to get it back
 * to install later. Only there when the notice has something to say, or installing is on offer;
 * a browser with Web MIDI that keeps what it stores, already installed, gets nothing.
 */
export function BrowserButton() {
  const browser = useBrowser();
  const setBrowserNotice = usePacerStore((s) => s.setBrowserNotice);
  const install = installOffered(browser);
  if (!browser.topics && !install) return null;

  const label = install ? "Install Pacer Programmer" : "What this browser can't do";
  return (
    <Button
      id={BROWSER_BUTTON_ID}
      size="icon"
      variant="subtle"
      aria-label={label}
      title={
        browser.storageExpires
          ? `${label}: ${browser.safari ? "Safari" : "this browser"} deletes saved configurations after seven days unused`
          : label
      }
      // Its tone only: amber while what you save here can be deleted. The shape is every button's.
      className={browser.storageExpires ? "text-warning" : undefined}
      onPress={() => setBrowserNotice("button")}
    >
      {install ? (
        <HardDriveDownload aria-hidden className="size-4" />
      ) : (
        <TriangleAlert aria-hidden className="size-4" />
      )}
    </Button>
  );
}
