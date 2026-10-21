#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Checks the app by touch alone, on a phone-sized screen, in the real app.
 *
 *   pnpm check:touch
 *
 * jsdom has no layout, scrolling or touch, so this drives headless Chrome with touch events, as a
 * finger would, on a 390px-wide phone. It fails if:
 * - a sideways swipe doesn't scroll the faceplate, which is wider than a phone;
 * - an upward swipe on the rear jacks doesn't scroll the page (on a phone they fill the width);
 * - a tap on a switch doesn't press it;
 * - holding [Preset] doesn't enter preset select.
 *
 * The first two are what `touch-action` decides: the faceplate was once touch-none, which made it
 * impossible to scroll by touch. The last two are what allowing panning mustn't break.
 */

import { wait, withApp } from "./docs-browser.mjs";

const failures = [];
function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
}

await withApp(async (page) => {
  const cdp = page.cdp;
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.app(`d.store.getState().setUiMode("simulate");`);
  await wait(800);

  const finger = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  async function swipe(from, to) {
    await finger("touchStart", [from]);
    for (let i = 1; i <= 10; i++) {
      await finger("touchMove", [{ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }]);
      await wait(16);
    }
    await finger("touchEnd", []);
    await wait(500);
  }
  async function press(at, ms) {
    await finger("touchStart", [at]);
    await wait(ms);
    await finger("touchEnd", []);
    await wait(400);
  }
  /** The middle of the first button whose label starts with `label`. */
  const buttonAt = (label) =>
    page.eval(`(() => {
      const b = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").startsWith(${JSON.stringify(label)}));
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);

  // The faceplate's own scroller, and a point on its upper row.
  const faceplateScroller = `document.querySelector('[aria-label^="Pacer faceplate"]').closest(".overflow-x-auto")`;
  const row = await page.eval(`(() => {
    const r = document.querySelector('[aria-label^="Pacer faceplate"]').getBoundingClientRect();
    return Math.round(r.top + r.height * 0.35);
  })()`);
  const room = await page.eval(`${faceplateScroller}.scrollWidth - ${faceplateScroller}.clientWidth`);
  check(room > 0, `the faceplate is wider than a 390px phone (${room}px to scroll)`);
  await swipe({ x: 330, y: row }, { x: 60, y: row });
  const scrolled = await page.eval(`${faceplateScroller}.scrollLeft`);
  check(scrolled > room / 2, `a sideways swipe scrolls the faceplate (moved ${scrolled}px)`);
  await page.eval(`${faceplateScroller}.scrollLeft = 0`);
  await wait(300);

  // The page scrolls in .app-scroll; swipe up on a rear jack, which on a phone fills the width.
  const jack = await buttonAt("Switch Footswitch 1");
  const pageTop = await page.eval(`document.querySelector(".app-scroll").scrollTop`);
  await swipe({ x: jack.x, y: jack.y }, { x: jack.x, y: jack.y - 300 });
  const pageMoved = (await page.eval(`document.querySelector(".app-scroll").scrollTop`)) - pageTop;
  check(pageMoved > 50, `an upward swipe on a rear jack scrolls the page (moved ${pageMoved}px)`);
  await page.eval(`document.querySelector(".app-scroll").scrollTop = 0`);
  await wait(300);

  const logged = await page.app(`return d.store.getState().log.length`);
  await press(await buttonAt("Switch 1:"), 80);
  const added = (await page.app(`return d.store.getState().log.length`)) - logged;
  check(added > 0, `a tap on switch 1 presses it (${added} log entries)`);

  await press(await buttonAt("Preset button"), 2400);
  const mode = await page.app(`return d.store.getState().deviceMode.mode`);
  check(mode === "presetSelect", `holding [Preset] enters preset select (mode: ${mode})`);
});

if (failures.length) {
  console.error(`\n${failures.length} touch check(s) failed.`);
  process.exit(1);
}
console.log("\nEverything works by touch.");
