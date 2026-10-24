# Editing a Preset

This page covers the basics: changing what a switch does on one preset,
trying it, and keeping it. You don't need the preset map for any of this.

## 1. Find the Preset

Open the configuration you want to change. You can pull it from your Pacer,
import a `.syx`, or start from the factory defaults (see
[Devices and files](../reference/devices-and-files.md)). Then pick the preset:
click the badge on the lower half of the display to open the
[preset chooser](../reference/the-faceplate.md#the-preset-chooser), and choose
one.

## 2. Open the Switch

Switch to **Program**. Every control you can program now has a pencil on it:

![The faceplate in Program mode](../images/program-faceplate.png)

Tap the switch you want, and the faceplate gives way to the switch editor.

## 3. Set What It Does

![The switch editor, with a CC Toggle on step 1 and a program change on step 2](../images/switch-editor-plain.png)

The [Program mode reference](../reference/program-mode.md#the-switch-editor)
labels every part of this screen.

Start with step 1: pick its type (Program + Bank, CC Toggle, Note and so on),
its channel, and its values.

If you want one press to do several things, click **+ Add step**. With
**Fires** set to *All at once*, every step goes out on each press. If you'd
rather have each press do the next thing in a list, set it to *Sequence*.

[Switches and steps](switches-and-steps.md) walks through steps and modes with
examples, and every type and field is listed in
[Program mode](../reference/program-mode.md#step-types).

## 4. Choose Its Colors

Under the step, pick which light it uses and its two colors. The labels tell
you when each one shows, for example *While CC 52 = 127* and *Otherwise*.
[Lights and colors](lights-and-colors.md) has the details.

## 5. Try It

Press the live copy of the switch on the right of the editor. It sends, and its
light changes, the same way the Pacer's would. If you've picked a
[simulated MIDI output](the-simulator.md), your gear responds too.

The row of buttons along the top picks a different switch on the same preset,
and the preset name at the start of that row (`A1 PRGM1`) opens the preset
chooser. The **✕** at the end takes you back to the faceplate.

## 6. Name the Preset

Back on the faceplate, tap the small pencil next to the name on the display,
type up to five characters, and press Enter.

## 7. Keep It

Undo and Redo (⌘Z and ⇧⌘Z on a Mac, Ctrl+Z and Ctrl+Shift+Z elsewhere) step
back and forth through every change.
**Save…** keeps the configuration as a snapshot in this browser, and
**Send to Pacer…** writes the presets you changed to the Pacer. See
[Saving and sending](saving-and-sending.md).
