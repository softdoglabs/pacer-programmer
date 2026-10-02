# Devices and files

Your work lives in two places, and the app keeps them apart.

This browser holds snapshots of configurations: ones you pulled from a Pacer,
imported from files, or saved from your edits. Nothing in a snapshot reaches
the Pacer until you send it.

The Pacer holds whatever it was last sent. The app reads it with **Pull** and
writes it with **Send**, and it never does either on its own.

Pulling and sending both need MIDI with SysEx permission, in a Chromium-based
browser (Chrome, Edge, Opera or Brave). Everything else, including the
simulator, programming, the map, and importing and exporting files, works
without MIDI.

## The device drawer

Click the configuration's name in the header, or the device status next to it,
to open the drawer:

![The device drawer, its parts numbered](../images/device-drawer.png)

| | Part | What it does |
|---|---|---|
| 1 | Pull from Pacer | Reads everything on the Pacer into a new snapshot and opens it. Nothing on the device changes. |
| 2 | Import .syx | Opens a `.syx` file as a new snapshot. |
| 3 | Pacer ports | The Pacer's MIDI input and output. The app picks any port with "Pacer" in its name; if yours is named differently, choose them by hand. |
| 4 | Firmware | What the Pacer says when asked who it is. The app asks automatically whenever its ports show up. |
| 5 | Factory defaults | The Pacer's factory configuration, built into the app. It's always there and can't be changed, so edits to it are saved as a new snapshot. |
| 6 | The open configuration | Highlighted. Click any other row to open that configuration instead. |
| 7 | Rename, Export .syx, Delete | One set for each snapshot. Delete asks you to click again to confirm. |

Until you've granted MIDI access, the drawer shows a **Connect MIDI** button
where the ports would be.

### Pulling from the Pacer

**Pull from Pacer** asks the Pacer for a full dump: all 24 presets, its working
copy and its global settings, which comes to about 4,800 SysEx messages. A
progress bar counts them in, and **Cancel** stops it. When the Pacer goes
quiet, the dump is saved as a snapshot named after the time, and opened.

If the Pacer doesn't answer, the drawer says so. Check that it's on, that the
ports are right, and that the browser granted SysEx.

The firmware line only shows the Pacer's major and minor version (`0101` means
firmware 1.01), because that's all the Pacer reports. A dump doesn't carry a
version at all.

### Importing and exporting files

**Import .syx** takes any full Pacer dump, whether it was saved by this app, by
Nektar's editor, by a MIDI utility, or written by hand or by an AI (see
[Working with an AI](../guide/working-with-ai.md)). It becomes a new snapshot,
and the original file isn't touched.

**Export .syx** on a snapshot's row downloads it as a `.syx` file. Those are the
same bytes the Pacer would send in a dump, so any SysEx tool can send it back
to the Pacer. To export your edits, save them first and then export the
snapshot.

If a file isn't a Pacer dump, or it's damaged, the import is refused and you're
told why. The app checks every message's framing and checksum. What a valid
dump contains is described in [Programming the Pacer](programming-the-pacer.md).

### Snapshots

A snapshot is the configuration's raw SysEx bytes, plus a name, where it came
from, when, and how many presets it holds. The second line of each row shows
all of that.

Pulled and imported snapshots are never changed by editing. Your edits only
become a snapshot when you save.

Snapshots live in this browser's local storage, which holds about 25 full
dumps. Clearing the browser's site data deletes them, so export any you want to
keep. Whatever configuration you had open is reopened when you come back.

If you have unsaved edits, opening another configuration, importing or pulling
will first ask whether you want to throw them away.

## Saving

**Save…** in the context bar (in Program mode and on the preset map) opens
this:

![The Save dialog](../images/save-dialog.png)

**Save as new snapshot** keeps your edits under the name you give, and leaves
the snapshot you started from as it was. The default name is the old one with
"(edited)" on the end. **Save over "…"** replaces the open snapshot with your
edits. It isn't offered for the factory defaults.

Saving clears the **unsaved** badge. It doesn't send anything to the Pacer.

## Sending to the Pacer

**Send to Pacer…** in the context bar writes presets to the Pacer:

![The Send to Pacer dialog](../images/send-dialog.png)

First pick which presets to send:

| Choice | Sends |
|---|---|
| Changed (the default) | The presets you've changed since the configuration was opened, or since they were last sent. |
| This preset | Only the preset you're on. |
| All | All 24. |

The dialog lists exactly which presets will be overwritten. Then
**Overwrite N presets on the Pacer** writes them. The Pacer has no undo, so pull
a copy first if you want to keep what's on it. **Read back afterwards to
verify**, which is on by default, pulls the Pacer's configuration again and
compares the presets you sent. That takes about eight seconds, and the result
tells you whether they match. Global settings are never sent, only presets.

The loaded preset gets updated too. The Pacer actually runs a working copy of
whichever preset it has loaded, and writing to a preset's slot doesn't change
that copy. So the app asks the Pacer which preset it has loaded, and if it's
one you're sending, the app updates the working copy as well, and the new
version is live right away. If the Pacer doesn't say which preset it has
loaded, the result asks you to select the preset again on the Pacer.

While a send is running, nothing else goes to the Pacer, including for about a
second afterwards while it stores what it was sent. (It turns out that asking
it for anything too soon after a write can corrupt the preset you just wrote.)
If your [simulated MIDI output](the-window.md#in-simulate) is the Pacer itself,
presses in the simulator are dropped during that time rather than sent.
**Cancel** stops a send part way through. Any presets already written stay
written, and the result tells you which ones.

**Send to Pacer…** stays greyed out until MIDI with SysEx is granted and the
Pacer's output port is chosen.

The [preset chooser](the-faceplate.md#the-preset-chooser) marks each preset the
Pacer hasn't been sent with a hollow dot, so you can see what *Changed* will
send before you open the dialog.
