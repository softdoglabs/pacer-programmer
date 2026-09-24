// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { ControlId, userPresetIndex } from "../../pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";

const store = () => usePacerStore.getState();
const A1 = userPresetIndex(0, 1);
/** Both display lines: the name is an input's value, the preset label is text. */
const display = () =>
  `${(screen.getByTestId("display-line1") as HTMLInputElement).value} ${screen.getByTestId("display-line2").textContent}`;

function tap(el: Element) {
  fireEvent.keyDown(el, { key: " " });
  fireEvent.keyUp(el, { key: " " });
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  act(() => {
    for (const e of store().library.entries) store().deleteSavedConfig(e.id);
    store().loadConfig(loadFactoryDefaults(), "Factory defaults");
    store().setUiMode("simulate");
  });
});
afterEach(cleanup);

/** The device and its snapshots live in a drawer, opened from the configuration's name. */
function openDeviceDrawer() {
  const trigger = screen.getByTitle("Open configurations and the Pacer connection");
  fireEvent.click(within(trigger).getByRole("button"));
}

function enterEditMode() {
  fireEvent.click(screen.getByRole("radio", { name: "Program" }));
  expect(store().uiMode).toBe("program");
  expect(store().selectedControlId).toBeUndefined(); // starts at the faceplate
}

describe("programming interface", () => {
  it("in Edit mode, tapping a switch selects it for editing and fires nothing", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    expect(store().selectedControlId).toBe(ControlId.Stompswitch1);
    expect(store().log).toEqual([]);
    expect(screen.getByRole("heading", { name: "Stomp 1" })).toBeTruthy();
    // Only configured steps are shown: factory switch 1 has just step 1.
    expect(screen.getAllByRole("region", { name: /^Step \d$/ }).map((r) => r.getAttribute("aria-label"))).toEqual([
      "Step 1",
    ]);
  });

  it("renames the preset on the display itself, and undoes", () => {
    render(<App />);
    enterEditMode();
    // The display carries the pencil badge; tapping it turns into the name field.
    fireEvent.click(screen.getByRole("button", { name: /Rename preset A1/ }));
    const field = screen.getByRole("textbox", { name: /Preset A1 name/ });
    fireEvent.change(field, { target: { value: "LOOP" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store().board.config.presets[A1]!.name).toBe("LOOP ");
    expect(display()).toContain("LOOP");
    expect(screen.getByText("● unsaved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store().board.config.presets[A1]!.name).toBe("PRGM1");
    expect(screen.queryByText("● unsaved")).toBeNull();
  });

  it("changes a step's type from the picker, and the faceplate caption follows", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add step" }));
    const step2 = screen.getByRole("region", { name: "Step 2" });
    fireEvent.click(within(step2).getByRole("button", { name: /Step 2 type/ }));
    fireEvent.click(screen.getByRole("option", { name: "CC Toggle" }));
    const step = store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.steps[2]!;
    expect(step).toMatchObject({ active: true, data: [0, 0, 127] });
    // Closing the switch's editor returns to the faceplate, which shows what it now sends.
    fireEvent.click(screen.getByRole("button", { name: /Back to faceplate/ }));
    expect(screen.getByRole("button", { name: "Switch 1: PC0 CC0⇅" })).toBeTruthy();
  });

  it("adds steps up to six, then disables +; removing a step keeps its settings for next time", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "+ Add step" }));
    expect(screen.getAllByRole("region", { name: /^Step \d$/ })).toHaveLength(6);
    expect(screen.getByRole("button", { name: /\+ Add step \(all 6 in use\)/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove step 1" })).toBeNull(); // step 1 always stays

    fireEvent.click(screen.getByRole("button", { name: "Remove step 3" }));
    expect(screen.queryByRole("region", { name: "Step 3" })).toBeNull();
    const steps = store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.steps;
    expect(steps[3]).toMatchObject({ active: false });
    fireEvent.click(screen.getByRole("button", { name: "+ Add step" })); // fills the gap: step 3 again
    expect(screen.getByRole("region", { name: "Step 3" })).toBeTruthy();
  });

  it("picks an LED color from the picker, labeled by what makes it show, and flips it to dim", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    const step1 = screen.getByRole("region", { name: "Step 1" });
    const led = () => store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.led[1]!;
    // Factory A1 switch 1 is a Program Change, so the first color shows while that program is active.
    const open = () => fireEvent.click(within(step1).getByRole("button", { name: /^While this program is active:/ }));
    open();
    fireEvent.click(screen.getByRole("radio", { name: "2A Red" }));
    expect(led().activeColor).toBe(0x03);

    // The hue's dim twin is one tap on the brightness toggle, not a hunt for another swatch.
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Dim" }));
    expect(led().activeColor).toBe(0x04);
  });

  it("switches a light between what the switch sends and incoming MIDI", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    const step1 = screen.getByRole("region", { name: "Step 1" });
    const litBy = within(step1).getByRole("radiogroup", { name: "Lit by" });
    const led = () => store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.led[1]!;
    expect(led().midiFeedback).toBe(0); // no preset in any dump has it on

    fireEvent.click(within(litBy).getByRole("radio", { name: "Incoming MIDI" }));
    expect(led().midiFeedback).toBe(1);
    // Factory A1 switch 1 is a Program Change, and the hardware only does this for CC steps.
    expect(within(step1).getByText(/only works on CC steps/)).toBeTruthy();

    fireEvent.click(within(litBy).getByRole("radio", { name: "This switch" }));
    expect(led().midiFeedback).toBe(0);
  });

  it("shows the preset's load-time MIDI in Program mode, beside the faceplate", () => {
    render(<App />);
    expect(screen.queryByRole("region", { name: "Preset settings" })).toBeNull(); // not while simulating
    enterEditMode();
    const panel = screen.getByRole("region", { name: "Preset settings" });
    expect(within(panel).getByRole("heading", { name: /^A1 — MIDI sent on load/ })).toBeTruthy();
    // It belongs to the preset, so drilling into a switch leaves it behind.
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    expect(screen.queryByRole("region", { name: "Preset settings" })).toBeNull();
  });

  it("entering Edit mode starts at the faceplate, and closing a switch stays in Edit mode", () => {
    render(<App />);
    tap(screen.getByRole("button", { name: /^Switch 2:/ })); // pressed in Play mode: not a choice to program it
    expect(store().selectedControlId).toBe(ControlId.Stompswitch2);
    enterEditMode();
    expect(screen.queryByRole("region", { name: "Step 1" })).toBeNull();

    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    expect(screen.getByRole("region", { name: "Step 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back to faceplate/ }));
    expect(store().uiMode).toBe("program");
    expect(store().selectedControlId).toBeUndefined();
    expect(screen.getByRole("button", { name: /^Switch 1:/ })).toBeTruthy();
  });

  it("the control in the editor is live: pressing it fires the simulator", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    expect(store().log).toEqual([]); // selecting it for editing fires nothing

    tap(screen.getByRole("button", { name: /^Try 1:/ }));
    expect(store().log.map((e) => e.title)).toContain("Stomp 1 — press");
    expect(
      store()
        .log.flatMap((e) => e.lines)
        .join(" "),
    ).toContain("Program Change");
    expect(store().selectedControlId).toBe(ControlId.Stompswitch1); // trying it doesn't change what's open
  });

  it("expression pedals are swept, not pressed: moving one sends its value", () => {
    render(<App />);
    const pedal = screen.getByRole("slider", { name: /Expression 1: heel to toe/ });
    fireEvent.change(pedal, { target: { value: "50" } });
    // Factory A1's EXP1 is CC 7 over its full range: halfway is about half the range.
    const lines = store()
      .log.flatMap((e) => e.lines)
      .join(" ");
    expect(lines).toMatch(/CC#7 = 6[0-9]/);
    fireEvent.change(pedal, { target: { value: "100" } });
    expect(
      store()
        .log.flatMap((e) => e.lines)
        .join(" "),
    ).toMatch(/CC#7 = 127/);
  });

  it("refuses a name the Pacer can't store, and warns about an unusual character", () => {
    render(<App />);
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: /Rename preset A1/ }));
    const field = screen.getByRole("textbox", { name: /Preset A1 name/ });

    fireEvent.change(field, { target: { value: "TOOLONG" } });
    expect(screen.getByRole("alert").textContent).toMatch(/5 characters/);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store().board.config.presets[A1]!.name).toBe("PRGM1"); // refused: still editing
    expect(screen.getByRole("textbox", { name: /Preset A1 name/ })).toBeTruthy();

    fireEvent.change(field, { target: { value: "A*B" } });
    expect(screen.queryByRole("alert")).toBeNull(); // a warning, not an error
    expect(screen.getByText(/may not display/)).toBeTruthy();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store().board.config.presets[A1]!.name).toBe("A*B  ");
  });

  it("renames in place: the same display line becomes the field, focused and selected", () => {
    render(<App />);
    enterEditMode();
    const readout = screen.getByTestId("display-line1");
    expect(readout.tagName).toBe("INPUT"); // the readout and the field are one element
    fireEvent.click(screen.getByRole("button", { name: /Rename preset A1/ }));
    const field = screen.getByTestId("display-line1");
    expect(field).toBe(document.activeElement);
    expect(field).toBe(screen.getByRole("textbox", { name: /Preset A1 name/ }));
    expect(screen.queryByRole("button", { name: /Rename preset A1/ })).toBeNull();
  });

  it("stores typed names uppercased, as every Pacer name is", () => {
    render(<App />);
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: /Rename preset A1/ }));
    const field = screen.getByRole("textbox", { name: /Preset A1 name/ });
    fireEvent.change(field, { target: { value: "loop" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store().board.config.presets[A1]!.name).toBe("LOOP ");
  });

  it("[Preset] is disabled in Edit mode: it can't be programmed", () => {
    render(<App />);
    enterEditMode();
    const preset = screen.getByRole("button", { name: /Preset button/ });
    expect(preset.hasAttribute("disabled")).toBe(true);
    expect(preset.getAttribute("aria-label")).toContain("not programmable");
    fireEvent.click(preset);
    expect(store().selectedControlId).toBeUndefined();
  });

  it("the pencil badge opens a control that isn't itself a button (an expression pedal)", () => {
    render(<App />);
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: "Program Expression 1" }));
    expect(store().selectedControlId).toBe(ControlId.ExpressionPedal1);
    expect(screen.getByRole("heading", { name: "Expression 1" })).toBeTruthy();
  });

  it("marks the step that lights the switch, and says why the others don't", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    // A second step fires too, but in All-at-once mode only step 1's light shows.
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    const [step1, step2] = screen.getAllByRole("region", { name: /^Step [12]$/ });
    expect(within(step1!).getByText("lights the switch")).toBeTruthy();
    expect(within(step2!).queryByText("lights the switch")).toBeNull();
    expect(within(step2!).getByText(/a switch lights one step at a time/)).toBeTruthy();
  });

  it("offers only the lights a switch has: A-D have a bar and their legend, not three rows", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch A:/ }));
    const lights = within(screen.getByRole("region", { name: "Step 1" })).getByRole("radiogroup", { name: "Light" });
    expect(
      within(lights)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Bar", "Text legend"]);
  });

  it("asks before discarding unsaved edits when switching configurations", () => {
    const fixture = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
    act(() => store().importSyxFile("other.syx", fixture));
    render(<App />);
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: /Rename preset A1/ }));
    const field = screen.getByRole("textbox", { name: /Preset A1 name/ });
    fireEvent.change(field, { target: { value: "EDIT" } });
    fireEvent.keyDown(field, { key: "Enter" });

    openDeviceDrawer();
    const list = screen.getByRole("list", { name: "Saved configurations" });
    fireEvent.click(within(list).getByRole("button", { name: /^Factory defaults/ }));
    expect(screen.getByRole("dialog", { name: /Discard unsaved changes to “other”/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(store().configSource).toBe("other");
    expect(store().board.config.presets[A1]!.name).toBe("EDIT ");

    fireEvent.click(within(list).getByRole("button", { name: /^Factory defaults/ }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and continue" }));
    expect(store().configSource).toBe("Factory defaults");
  });
});
