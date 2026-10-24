// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
// The brand kit's palette, in a branded build; empty otherwise (src/brand/vitePlugin.ts).
import "virtual:brand-app.css";
import { browserSituation } from "./platform/browser";
import { currentBrowserFacts } from "./platform/currentBrowser";
import { listenForInstallPrompt } from "./platform/installPrompt";

// Before anything renders: the browser offers installing once, early (installPrompt.ts).
listenForInstallPrompt();
// Installed, ask for storage that isn't evicted under pressure. Chromium and Safari decide without
// asking the user; Firefox would ask, but it can't install, so it never gets here.
if (browserSituation(currentBrowserFacts()).installed) void navigator.storage?.persist?.();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
