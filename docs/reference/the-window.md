# The window

![The Pacer Programmer window, its regions numbered](../images/app-window.png)

| | Region | What it's for |
|---|---|---|
| 1 | **Configuration** | The name of the configuration that's open. Click it to open the [device drawer](devices-and-files.md): pull from your Pacer, import or export a `.syx`, and open saved snapshots. |
| 2 | **Mode bar** | Switches between [Simulate](simulate-mode.md), [Program](program-mode.md) and the [Preset map](preset-map.md). |
| 3 | **Docs** | Opens these docs in a new tab, so you can follow along beside the app. |
| 4 | **Device slot** | Asks the browser for MIDI access; once granted, shows whether your Pacer is there (see below). |
| 5 | **Context bar** | The controls for the current mode. It changes with the mode (see below). |
| 6 | **The faceplate** | The on-screen Pacer. In Simulate it plays; in Program you tap a control to program it. See [The faceplate](the-faceplate.md). |
| 7 | **Rear jacks** | The four external footswitches and two expression pedals, as they'd plug into the back of the unit. |
| 8 | **Output log** | Every press and what it sent, newest first. **Clear** empties it. |

## The three modes

| Mode | What you do there |
|---|---|
| **Simulate** | Play the on-screen Pacer. Every press does what the real one would — lights, preset changes, and MIDI, which you can send to real gear. |
| **Program** | Change what the presets do: tap a control to edit it, rename the preset on the display, and send your changes to the Pacer. |
| **Preset map** | See how your presets lead to one another, and design those routes: which switch goes where, and which presets are really one state. |

All three work on the same configuration and the same current preset: a
change made in Program is what Simulate plays, and choosing a preset on the
map loads it everywhere.

Your browser's Back and Forward buttons move between the places you've been
— modes, the switch you were editing, the device drawer.

## The device slot

| It shows | Meaning |
|---|---|
| **Connect MIDI** | The browser hasn't been asked for MIDI access yet. Click it; the browser asks whether to allow MIDI (and SysEx, which the Pacer needs). |
| **Pacer connected** | MIDI access is granted and a Pacer is on USB. Click it to see its ports and firmware in the device drawer. |
| **No Pacer found** | MIDI access is granted but no Pacer is plugged in, or its ports aren't chosen. Click it to choose them. |
| **Web MIDI isn't available in this browser** | Use a Chromium-based browser: Chrome, Edge, Opera, Brave. |
| **MIDI access denied** | The browser refused. **Retry** asks again; you may need to allow MIDI in the site settings first. |

![The header with a Pacer connected](../images/header-connected.png)

You don't need MIDI at all to use the simulator or to program: the app works
entirely on screen. MIDI is for sending to real gear and for talking to the
Pacer.

## The context bar

### In Simulate

![Simulate's context bar](../images/context-simulate.png)

- **Simulated MIDI output** — where the simulator sends its MIDI: your
  guitar processor, synth or DAW. **Don't send** (the default) keeps
  everything on screen. Before MIDI access is granted, a **Connect MIDI**
  button stands in its place.
- **SysEx off** appears if the browser granted MIDI without SysEx: MMC
  messages (which are SysEx) won't be sent, and the Pacer can't be read or
  written.
- **Reset MIDI state** — the Pacer remembers the last value it sent on each
  controller, note and program, and its lights follow that memory. This
  forgets it all, so the switches light as they would from a fresh start.

This output is **not** the Pacer. The simulator sends *out to your rig*,
exactly as the Pacer would; the Pacer itself is reached through the device
drawer. See [The simulator](../guide/the-simulator.md).

### In Program

![Program's context bar, with an unsaved edit](../images/context-program.png)

- **Undo** and **Redo** — also ⌘Z and ⇧⌘Z (Ctrl on Windows), except while
  you're typing in a field.
- **Changes: All N presets / this preset only** — appears only when the
  preset you're on is one of several that behave alike. See
  [Editing a state](program-mode.md#editing-a-state-several-presets-at-once).
- **unsaved** — you've changed something since the configuration was opened
  or last saved.
- **Save…** — keeps the configuration as a snapshot in this browser. Nothing
  is sent to the Pacer.
- **Send to Pacer…** — writes your changes to the Pacer. See
  [Sending to the Pacer](devices-and-files.md#sending-to-the-pacer).

### On the preset map

![The preset map's context bar](../images/context-map.png)

- **The preset chooser** — the current preset. Click it to choose another
  (see [The preset chooser](the-faceplate.md#the-preset-chooser)).
- The same editing controls as Program, because rerouting on the map is
  editing too.
