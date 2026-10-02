# Devices and files

Your work lives in two places, and the app keeps them apart:

- **This browser** holds snapshots of configurations — pulled from a Pacer,
  imported from files, or saved from your edits. Nothing in a snapshot reaches
  the Pacer until you send it.
- **The Pacer** holds whatever it was last sent. The app reads it with
  **Pull** and writes it with **Send**, and never does either on its own.

Both need MIDI with SysEx permission, in a Chromium-based browser (Chrome,
Edge, Opera, Brave). Everything else — the simulator, programming, the map,
importing and exporting files — works without MIDI.

## The device drawer

Click the configuration's name in the header, or the device status beside it,
to open the drawer:

![The device drawer, its parts numbered](../images/device-drawer.png)

| | Part | What it does |
|---|---|---|
| 1 | **Pull from Pacer** | Reads everything on the Pacer into a new snapshot and opens it. Nothing on the device changes. |
| 2 | **Import .syx** | Opens a `.syx` file as a new snapshot. |
| 3 | **Pacer ports** | The Pacer's MIDI input and output. Chosen automatically from any port with "Pacer" in its name; pick them by hand if yours is named differently. |
| 4 | **Firmware** | What the Pacer says when asked who it is. Asked automatically whenever its ports appear. |
| 5 | **Factory defaults** | The Pacer's factory configuration, built in. Always there, and can't be changed: edits to it are saved as a new snapshot. |
| 6 | **The open configuration** | Highlighted. Click any row to open that configuration instead. |
| 7 | **Rename, Export .syx, Delete** | For each snapshot. Delete asks you to click again to confirm. |

Before MIDI access is granted, the drawer shows **Connect MIDI** in place of
the ports.

### Pulling from the Pacer

**Pull from Pacer** asks the Pacer for a full dump: all 24 presets, its
working copy and its global settings, about 4,800 SysEx messages. A progress
bar counts them in; **Cancel** stops. When the Pacer goes quiet, the dump is
saved as a snapshot named after the time, and opened.

If the Pacer doesn't answer, the drawer says so. Check that it's on, that the
ports are right, and that the browser granted SysEx.

The firmware line only shows the Pacer's major and minor version — `0101` is
firmware 1.01 — which is all the Pacer reports. A dump doesn't carry a
version at all.

### Importing and exporting files

**Import .syx** takes any full Pacer dump — one saved by this app, by Nektar's
editor, by a MIDI utility, or written by hand or by an AI (see
[Working with an AI](../guide/working-with-ai.md)). It becomes a new snapshot,
and the original file is untouched.

**Export .syx**, on a snapshot's row, downloads it as a `.syx` file: the same
bytes the Pacer would send in a dump, which any SysEx tool can send back to
it. To export your edits, **Save** them first, then export the snapshot.

A file that isn't a Pacer dump, or that's damaged, is refused with the reason:
the app checks every message's framing and checksum. What a valid dump
contains is set out in [Programming the Pacer](programming-the-pacer.md).

### Snapshots

- A snapshot is the configuration's raw SysEx bytes, plus a name, where it
  came from, when, and how many presets it holds. The row's second line says
  all of that.
- Pulled and imported snapshots are never changed by editing. Your edits
  become a snapshot only when you **Save**.
- They live in this browser's local storage, which holds about 25 full dumps.
  Clearing the browser's site data deletes them — export the ones you want to
  keep.
- The configuration you had open is reopened when you come back.

If you have unsaved edits, opening another configuration, importing or
pulling first asks whether to discard them.

## Saving

**Save…** in the context bar (Program mode and the preset map) opens:

![The Save dialog](../images/save-dialog.png)

- **Save as new snapshot** — keeps your edits under the name you give, leaving
  the snapshot you started from as it was. The default name is the old one
  with "(edited)".
- **Save over "…"** — replaces the open snapshot with your edits. Not offered
  for the factory defaults.

Saving clears the **unsaved** mark. It doesn't send anything to the Pacer.

## Sending to the Pacer

**Send to Pacer…** in the context bar writes presets to the Pacer:

![The Send to Pacer dialog](../images/send-dialog.png)

**Presets to send**

| Choice | Sends |
|---|---|
| **Changed** (the default) | The presets you've changed since the configuration was opened, or since they were last sent. |
| **This preset** | Only the preset you're on. |
| **All** | All 24. |

The dialog lists exactly which presets will be overwritten. Then:

- **Overwrite N presets on the Pacer** writes them. The Pacer has no undo,
  so pull a copy first if you want to keep what's on it.
- **Read back afterwards to verify** (on by default) pulls the Pacer's
  configuration again and compares the presets you sent, which takes about
  eight seconds. The result says whether they match.
- Global settings are never sent: only presets.

**The loaded preset updates too.** The Pacer runs a working copy of whichever
preset it has loaded, and writing a preset's slot doesn't change that copy.
So the app asks the Pacer which preset it has loaded, and if that's one you're
sending, it updates the working copy as well: the new version is live
straight away. If the Pacer doesn't say, the result asks you to select the
preset again on the Pacer.

**While it sends**, nothing else goes to the Pacer, including for a second
afterwards while it stores what it was sent. If your
[simulated MIDI output](the-window.md#in-simulate) is the Pacer itself, presses
in the simulator are dropped during that time rather than sent. **Cancel**
stops a send part way; the presets already written stay written, and the
result says which.

**Send to Pacer…** is greyed out until MIDI with SysEx is granted and the
Pacer's output port is chosen.

The [preset chooser](the-faceplate.md#the-preset-chooser) marks each preset
the Pacer hasn't been sent with a hollow dot, so you can see what **Changed**
will send before you open the dialog.
