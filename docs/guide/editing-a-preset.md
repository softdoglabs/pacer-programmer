# Editing a preset

The basics: change what a switch on one preset does, try it, and keep it. No
state machines needed.

## 1. Find the preset

Open the configuration you want to change — pull it from your Pacer, import a
`.syx`, or start from the factory defaults (see
[Devices and files](../reference/devices-and-files.md)). Then choose the
preset: click the badge on the display's lower half for the
[preset chooser](../reference/the-faceplate.md#the-preset-chooser), and pick
one.

## 2. Open the switch

Switch to **Program**. Every programmable control now carries a pencil:

![The faceplate in Program mode](../images/program-faceplate.png)

Tap the switch you want. The faceplate gives way to the switch editor.

## 3. Set what it does

![The switch editor](../images/switch-editor.png)

- Choose what **step 1** does: its type (Program + Bank, CC Toggle, Note…),
  channel, and values.
- To make one press do several things, **+ Add step**. With *Fires: All at
  once*, every step goes out on each press.
- To make each press do the next thing, choose *Fires: Sequence*.

[Switches and steps](switches-and-steps.md) explains steps and modes with
examples. Every type and field is listed in
[Program mode](../reference/program-mode.md#step-types).

## 4. Choose its colours

Under the step, choose which light it uses and its two colours. The labels say
when each one shows: *While CC 52 = 127 / Otherwise*, say. See
[Lights and colours](lights-and-colours.md).

## 5. Try it

Press the live copy of the switch at the right of the editor. It sends, and
its light changes, as the Pacer's would — and if you've chosen a
[simulated MIDI output](the-simulator.md), your gear responds.

Move between switches with the picker at the top, and between presets with
the chooser beside it. **✕** goes back to the faceplate.

## 6. Name the preset

Back on the faceplate, tap the small pencil next to the name on the display,
type up to five characters, and press Enter.

## 7. Keep it

- **Undo / Redo** (⌘Z / ⇧⌘Z) step back and forth through every change.
- **Save…** keeps the configuration as a snapshot in this browser.
- **Send to Pacer…** writes the presets you changed to the Pacer.

See [Saving and sending](saving-and-sending.md).
