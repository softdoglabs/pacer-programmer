// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useRef, useState } from "react";
import { HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptInstall } from "../../platform/installPrompt";
import { usePacerStore } from "../../store/pacerStore";
import { BROWSER_BUTTON_ID } from "./BrowserNotice";
import { flyTo } from "./flyTo";
import { installDeclined, rememberInstallDeclined, useBrowser } from "./useBrowser";

/**
 * The quiet offer to install, where the browser says it can (Chromium's `beforeinstallprompt`):
 * a card in the corner rather than a dialog, since nothing is wrong and nothing is in the way. Not
 * now puts it away for good, into the header button that still installs. Where the notice has
 * something to say, the notice offers installing instead, so this stays out of its way.
 */
export function InstallToast() {
  const browser = useBrowser();
  const noticeOpen = usePacerStore((s) => s.browserNotice !== undefined);
  const card = useRef<HTMLDivElement>(null);
  const [declined, setDeclined] = useState(installDeclined);
  if (!browser.canPrompt || browser.installed || browser.topics || noticeOpen || declined) return null;

  const notNow = () => {
    rememberInstallDeclined();
    // The prompt event is still kept, so the header button can install later.
    flyTo(card.current, document.getElementById(BROWSER_BUTTON_ID));
    setDeclined(true);
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-label="Install Pacer Programmer"
      className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-lg border bg-popover p-4 text-sm shadow-xl"
    >
      <p className="flex items-center gap-2 font-medium">
        <HardDriveDownload aria-hidden className="size-4" />
        Install Pacer Programmer as an app?
      </p>
      <p className="text-muted-foreground">It opens in a window of its own, from your Dock or Start menu.</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={notNow}>
          Not now
        </Button>
        <Button size="sm" onPress={() => void promptInstall()}>
          Install
        </Button>
      </div>
    </div>
  );
}
