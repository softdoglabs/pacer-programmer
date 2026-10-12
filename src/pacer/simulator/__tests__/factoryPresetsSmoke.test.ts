// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPRESSION_PEDAL_CONTROL_IDS, SWITCH_CONTROL_IDS } from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { applyBoardEvent, createBoardState } from "../engine";

const FIXTURE_PATH = fileURLToPath(new URL("../../../../fixtures/factory-presets.syx", import.meta.url));

function isValidMidiMessage(msg: { kind: string; [key: string]: unknown }): boolean {
  const inRange = (n: unknown) => typeof n === "number" && n >= 0 && n <= 127;
  switch (msg.kind) {
    case "noteOn":
    case "noteOff":
      return inRange(msg.note) && inRange(msg.velocity) && inRange(msg.channel) && (msg.channel as number) <= 15;
    case "controlChange":
      return inRange(msg.controller) && inRange(msg.value) && (msg.channel as number) <= 15;
    case "programChange":
      return inRange(msg.program) && (msg.channel as number) <= 15;
    case "pitchBend":
      return typeof msg.value14 === "number" && msg.value14 >= 0 && msg.value14 <= 16383;
    case "channelAftertouch":
      return inRange(msg.value) && (msg.channel as number) <= 15;
    case "mmc":
      return inRange(msg.deviceId) || msg.deviceId === 0x7f;
    default:
      return false;
  }
}

describe("simulator engine against the real factory-presets fixture", () => {
  it("presses and releases every switch/expression-pedal control on every preset without throwing", () => {
    const config = decodeSysex(new Uint8Array(readFileSync(FIXTURE_PATH)));
    const presetIndices = Object.keys(config.presets).map(Number);
    const allControlIds = [...SWITCH_CONTROL_IDS, ...EXPRESSION_PEDAL_CONTROL_IDS];

    for (const presetIndex of presetIndices) {
      let board = createBoardState(config, presetIndex);
      for (const controlId of allControlIds) {
        const pressResult = applyBoardEvent(board, { controlId, phase: "press" });
        for (const msg of pressResult.effect.messages) {
          expect(
            isValidMidiMessage(msg),
            `invalid message from preset ${presetIndex} control 0x${controlId.toString(16)}: ${JSON.stringify(msg)}`,
          ).toBe(true);
        }
        // Only release if the press didn't jump us to a different preset (see engine.ts / the plan's A13 note).
        if (pressResult.board.activePresetIndex === board.activePresetIndex) {
          const releaseResult = applyBoardEvent(pressResult.board, { controlId, phase: "release" });
          for (const msg of releaseResult.effect.messages) {
            expect(isValidMidiMessage(msg)).toBe(true);
          }
          board = releaseResult.board;
        } else {
          board = pressResult.board;
        }
      }
    }
  });
});
