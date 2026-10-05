#!/usr/bin/env node
/*
 * Plays the AI in tutorial 4: builds the looper from the factory dump using nothing but
 * docs/reference/programming-the-pacer.md, and writes fixtures/ai-looper.syx.
 *
 *   node scripts/docs-ai-example.mjs
 *
 * It deliberately imports nothing from the app. The point is to check that the page is enough on
 * its own to write a dump the app (and so the Pacer) reads as intended — the job tutorial 4 hands
 * to an assistant. The walkthrough (docs-walkthrough.mjs) then imports the result and finishes
 * tutorial 4 on it. Every fact used here is one the page states:
 *
 * - framing: F0 00 01 77 7F cmd tgt idx obj fields… checksum F7
 * - fields are elm len value, with a 00 after every field but the last
 * - checksum = (128 − (sum of cmd…last field byte) mod 128) mod 128
 * - step n of a control: elements (n−1)×6+1 … +5 = channel, type, data 1–3, active
 * - light for step n: elements 0x40+(n−1)×4 … +3 = feedback, first colour, second colour, which light
 * - preset MIDI message n (obj 7E): elements (n−1)×6+1 … +4 = channel, type, data 1–3
 * - CC Trigger is 40, Preset Select 62 (target = idx + 2), Off 61; a preset's CC is 65
 * - colour for hue h (1–12): bright 2h − 1, dim 2h
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = `${ROOT}fixtures/factory-presets.syx`;
const TARGET = `${ROOT}fixtures/ai-looper.syx`;

function split(bytes) {
  const out = [];
  for (let i = 0; ;) {
    const start = bytes.indexOf(0xf0, i);
    if (start < 0) return out;
    const end = bytes.indexOf(0xf7, start);
    out.push(bytes.subarray(start, end + 1));
    i = end + 1;
  }
}

const checksum = (covered) => (128 - (covered.reduce((a, b) => a + b, 0) % 128)) % 128;

function build(idx, obj, fields) {
  const body = [0x01, 0x01, idx, obj];
  fields.forEach(([elm, value], k) => {
    body.push(elm, value.length, ...value);
    if (k < fields.length - 1) body.push(0x00);
  });
  return Uint8Array.from([0xf0, 0x00, 0x01, 0x77, 0x7f, ...body, checksum(body), 0xf7]);
}

const step = (n, channel, type, d1, d2, d3, active) => {
  const b = (n - 1) * 6 + 1;
  return [
    [b, [channel]],
    [b + 1, [type]],
    [b + 2, [d1]],
    [b + 3, [d2]],
    [b + 4, [d3]],
    [b + 5, [active]],
  ];
};
const light = (n, first, second) => {
  const b = 0x40 + (n - 1) * 4;
  return [
    [b, [0]],
    [b + 1, [first]],
    [b + 2, [second]],
    [b + 3, [0]],
  ];
};
const bright = (h) => 2 * h - 1;
const dim = (h) => 2 * h;

const A1 = 0x01;
const C1 = 0x0d;
const OFF = 0x61;

/** (idx, obj, first element) → the message that replaces the one at that address. */
const replace = new Map();
const put = (idx, obj, fields) => replace.set(`${idx}:${obj}:${fields[0][0]}`, build(idx, obj, fields));

// The looper on 1–6 and B, as tutorial 1 programs it: CC Trigger, 127 on press, 0 on release, global
// channel, each switch its own hue, bright when pressed and dim otherwise. Steps 2–6 emptied.
const LOOPER = [
  [0x0d, 53, 2], // 1: red
  [0x0e, 54, 7], // 2: green
  [0x0f, 56, 4], // 3: amber
  [0x10, 51, 9], // 4: blue
  [0x11, 55, 11], // 5: purple
  [0x12, 49, 8], // 6: teal
  [0x15, 52, 3], // B: orange
];
for (const [obj, cc, hue] of LOOPER) {
  put(C1, obj, step(1, 0, 0x40, cc, 127, 0, 1));
  for (let n = 2; n <= 6; n++) put(C1, obj, step(n, 0, OFF, 0, 0, 0, 0));
  put(C1, obj, light(1, bright(hue), dim(hue)));
}
// Switch A: on C1 back to A1, on A1 to C1 (target = idx + 2), white. The rest of A emptied, so
// nothing else on it fires first.
for (const [idx, target] of [
  [C1, A1],
  [A1, C1],
]) {
  put(idx, 0x14, step(1, 0, 0x62, target + 2, 0, 0, 1));
  for (let n = 2; n <= 6; n++) put(idx, 0x14, step(n, 0, OFF, 0, 0, 0, 0));
  put(idx, 0x14, light(1, bright(12), dim(12)));
}
put(C1, 0x01, [[0x01, [..."LOOPR"].map((c) => c.charCodeAt(0))]]);
// Load-time MIDI, standing in for "whatever CCs put the Quad Cortex into its looper view": C1 sends
// CC 48 = 0 when it loads, A1 sends CC 48 = 127.
put(C1, 0x7e, [
  [1, [0]],
  [2, [0x65]],
  [3, [48]],
  [4, [0]],
  [5, [0]],
]);
put(A1, 0x7e, [
  [1, [0]],
  [2, [0x65]],
  [3, [48]],
  [4, [127]],
  [5, [0]],
]);

const messages = split(readFileSync(SOURCE));
const used = new Set();
const out = messages.map((m) => {
  const key = m[6] === 0x01 && m.length > 11 ? `${m[7]}:${m[8]}:${m[9]}` : undefined;
  if (key === undefined || !replace.has(key)) return m;
  used.add(key);
  return replace.get(key);
});
const missing = [...replace.keys()].filter((k) => !used.has(k));
if (missing.length > 0) throw new Error(`No message at ${missing.join(", ")} to replace`);

// Check the output, as the page asks: every checksum right, and as many messages as before.
for (const m of out) {
  if (m[m.length - 2] !== checksum([...m.subarray(5, m.length - 2)])) throw new Error("bad checksum");
}
if (out.length !== messages.length) throw new Error(`${out.length} messages, expected ${messages.length}`);

writeFileSync(TARGET, Buffer.concat(out));
console.log(`${out.length} messages, ${replace.size} replaced → fixtures/ai-looper.syx`);
