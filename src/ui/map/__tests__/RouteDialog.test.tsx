// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoverMachine, type MachineState, type MachineTarget, type StateMachine } from "../../../pacer/analysis";
import { compileMachine } from "../../../test/compileMachine";
import {
  ControlId,
  SwitchMessageType,
  presetSelectTargetToIndex,
  userPresetIndex,
} from "../../../pacer/protocol/constants";
import { isSparePreset } from "../../../pacer/editing";
import type { Preset } from "../../../pacer/protocol/types";
import { usePacerStore } from "../../../store/pacerStore";
import { RouteDialog } from "../RouteDialog";

const store = () => usePacerStore.getState();

const body = (note: number): Preset["controls"] => ({
  [ControlId.Stompswitch1]: {
    steps: { 1: { channel: 0, msgType: SwitchMessageType.Note, data: [note, 127, 0], active: true } },
    led: {},
  },
});

/** Mains entering one looper that comes back, so the looper is several presets on the device. */
function looper(mains: number, back: MachineTarget = { kind: "return" }): StateMachine {
  const states: MachineState[] = Array.from({ length: mains }, (_, i) => ({
    id: `m${i}`,
    name: `MAIN${i}`,
    body: body(60 + i),
    // The third main is left out on purpose: somewhere to route from that isn't already in.
    transitions:
      i < 2 ? [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } }] : [],
  }));
  return {
    states: [
      ...states,
      {
        id: "loop",
        name: "LOOPR",
        body: body(99),
        transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: back }],
      },
    ],
  };
}

/** Opens a compiled machine as a configuration, the way a file or a pull would. */
function load(mains: number, back?: MachineTarget) {
  const compiled = compileMachine(looper(mains, back));
  if (!compiled.ok) throw new Error(compiled.error);
  act(() => store().loadConfig(compiled.config, "Looper"));
  const machine = recoverMachine(store().board.config);
  return {
    id: (name: string) => machine.states.find((s) => s.name?.trim() === name)!.id,
    members: (name: string) => machine.members[machine.states.find((s) => s.name?.trim() === name)!.id]!,
  };
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

describe("editing a route from the map", () => {
  it("writes the route into every preset the state is", () => {
    const machine = load(2);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("LOOPR"), toStateId: machine.id("MAIN0") }}
        onClose={onClose}
      />,
    );
    // Two presets, so the dialog says so before anything is written.
    expect(screen.getByText(/all 2 presets it is/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const home = machine.members("MAIN0")[0];
    const config = store().board.config;
    // Stomp 2: the first switch with nothing on it (stomp 1 carries the state's own note).
    for (const copy of machine.members("LOOPR")) {
      const step = config.presets[copy]?.controls[ControlId.Stompswitch2]?.steps[1];
      expect(step?.msgType).toBe(SwitchMessageType.PresetSelect);
      expect(presetSelectTargetToIndex(step!.data[0])).toBe(home);
    }
    expect(store().editHistory.past.length).toBe(1); // one edit, undoable as one
  });

  it("asks for a preset when the route needs a copy, and makes it there", () => {
    /*
     * LOOPR comes back to wherever it entered from, so a third way in is a third copy of it —
     * a preset, which the device has none spare of until something is cleared. The dialog says so
     * and asks which slot it takes.
     */
    const machine = load(3);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("MAIN2"), toStateId: machine.id("LOOPR") }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/needs another preset/)).toBeTruthy();
    expect(screen.getByLabelText("Copy of LOOPR for MAIN2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const config = store().board.config;
    // The compiled machine used A1-A5, so the first empty preset is A6.
    const copy = userPresetIndex(0, 6);
    const home = machine.members("MAIN2")[0]!;
    expect(config.presets[copy]?.name?.trim()).toBe("LOOPR");
    expect(presetSelectTargetToIndex(config.presets[copy]!.controls[ControlId.StompswitchA]!.steps[1]!.data[0])).toBe(
      home,
    );
    const after = recoverMachine(config);
    const loop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[loop.id]).toHaveLength(3);
    expect(loop.transitions.some((t) => t.to.kind === "return")).toBe(true);
  });

  it("lets a copy take a preset that's in use when none is empty, once clearing it is agreed to", () => {
    /*
     * What a real device looks like: all 24 presets hold something, so there's no empty one to
     * offer. The dialog used to offer "— none —" and nothing else, which made a return impossible
     * to set up without leaving it. Every other test here starts from a compiled machine, which
     * is mostly empty presets — so this one fills them first.
     */
    const machine = load(3);
    const presets = { ...store().board.config.presets };
    for (let i = 1; i <= 24; i++) {
      if (!isSparePreset(presets[i])) continue;
      presets[i] = { ...presets[i], index: i, name: `FULL${i % 10}`, controls: body(i), midiSettings: {} };
    }
    act(() => store().loadConfig({ ...store().board.config, presets }, "Full"));

    const onClose = vi.fn();
    const { container } = render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("MAIN2"), toStateId: machine.id("LOOPR") }}
        onClose={onClose}
      />,
    );
    const add = () => screen.getByRole<HTMLButtonElement>("button", { name: "Add route" });
    expect(screen.getByText(/No empty presets left. Choose one to clear/)).toBeTruthy();
    expect(add().disabled).toBe(true);

    // Nothing the machine uses is on offer: not the mains with routes, not LOOPR's copies.
    const slot = userPresetIndex(3, 6);
    // React Aria mirrors each picker in a hidden <select>; the slot picker is the one listing presets.
    const select = Array.from(container.ownerDocument.querySelectorAll<HTMLSelectElement>("select")).find((el) =>
      Array.from(el.options).some((o) => o.text.startsWith("D6 ")),
    )!;
    const offered = Array.from(select.options)
      .map((o) => o.value)
      .filter(Boolean);
    expect(offered).toContain(String(slot));
    for (const used of [...machine.members("MAIN0"), ...machine.members("MAIN2"), ...machine.members("LOOPR")]) {
      expect(offered).not.toContain(String(used));
    }

    fireEvent.change(select, { target: { value: String(slot) } });
    // Chosen isn't agreed: the preset has something in it, and losing it takes a second, explicit yes.
    expect(add().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Clear D6 FULL4 to make room/ }));
    fireEvent.click(add());
    expect(onClose).toHaveBeenCalled();

    const config = store().board.config;
    expect(config.presets[slot]?.name?.trim()).toBe("LOOPR");
    const after = recoverMachine(config);
    expect(after.members[after.states.find((s) => s.name === "LOOPR")!.id]).toHaveLength(3);
    expect(store().editHistory.past.length).toBe(1); // clearing and routing undo together
  });

  it("offers to clear a switch that's already busy, and does it on every copy", () => {
    /*
     * The usual case on a real device: every switch already does something, so a route has
     * nowhere to go until one of them gives way. That's offered, not done quietly.
     */
    const machine = load(2);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("LOOPR"), toStateId: machine.id("MAIN1") }}
        onClose={onClose}
      />,
    );
    // Stomp 1 sends the state's note; the route would otherwise share the press with it.
    fireEvent.click(screen.getByRole("button", { name: /On switch/i }));
    fireEvent.click(screen.getByRole("option", { name: /^1 —/ }));
    expect(screen.getByText(/Replace what 1 does/)).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const home = machine.members("MAIN1")[0];
    for (const copy of machine.members("LOOPR")) {
      const steps = store().board.config.presets[copy]?.controls[ControlId.Stompswitch1]?.steps;
      expect(steps?.[1]?.msgType).toBe(SwitchMessageType.PresetSelect);
      expect(presetSelectTargetToIndex(steps![1]!.data[0])).toBe(home);
      // The note that was on it is gone, not pushed to another step.
      expect(Object.values(steps!).filter((s) => s?.active && s.msgType === SwitchMessageType.Note)).toHaveLength(0);
    }
  });

  it("asks what a switch should do when it already leads somewhere else", () => {
    /*
     * Two mains share one LOOPR whose A always goes to MAIN0. Drawing LOOPR -> MAIN1 on A is the
     * one case with a real question: A can't go to both, so it has to go back to wherever LOOPR
     * was entered from, or depend on the way in — and either needs a second LOOPR.
     */
    const machine = load(2, { kind: "state", id: "m0" });
    expect(machine.members("LOOPR")).toHaveLength(1);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("LOOPR"), toStateId: machine.id("MAIN1") }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /On switch/i }));
    fireEvent.click(screen.getByRole("option", { name: /^A —/ }));
    expect(screen.getByText(/A already goes to MAIN0/)).toBeTruthy();
    // Nothing's assumed: the route can't be added until the question is answered.
    expect(screen.getByRole("button", { name: "Add route" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Goes back to wherever LOOPR was entered from/ }));
    expect(screen.getByText(/needs another preset/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const after = recoverMachine(store().board.config);
    const loop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[loop.id]).toHaveLength(2);
    expect(loop.transitions.find((t) => t.controlId === ControlId.StompswitchA)?.to.kind).toBe("return");
  });

  it("frees the copies when a return becomes a fixed route", () => {
    const machine = load(2);
    expect(machine.members("LOOPR")).toHaveLength(2);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{
          kind: "existing",
          fromStateId: machine.id("LOOPR"),
          controlId: ControlId.StompswitchA,
          stepNumber: 1,
        }}
        onClose={onClose}
      />,
    );
    // It opens on what the switch does now.
    expect((screen.getByRole("radio", { name: /Goes back to wherever LOOPR/ }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Always goes to one state/ }));
    fireEvent.click(screen.getByRole("button", { name: /Goes to/ }));
    fireEvent.click(screen.getByRole("option", { name: /^MAIN0/ }));
    expect(screen.getByText(/Frees/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change route" }));
    expect(onClose).toHaveBeenCalled();

    const after = recoverMachine(store().board.config);
    const loop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[loop.id]).toHaveLength(1);
  });
});
