# Working with an AI

A Pacer configuration is a `.syx` file, which is just a few thousand short
SysEx messages. The format is written down in full in
[Programming the Pacer](../reference/programming-the-pacer.md), so an AI
assistant that can read files and run code can read your configuration,
change it, and give you back a new `.syx`. That's handy for the kind of bulk
programming that would otherwise take you an evening.

This app is the other half of the job. You load what the AI made, play it in
the simulator against your real rig, check on the preset map what's actually
connected to what, and only send it to the Pacer once it's right.

That's how the looper in these docs started, actually. I asked Claude Opus (in the
web app) to build it, and told it to read the source of an older Pacer editor
to figure out the format. Then came a fair amount of trial and error: load the
result onto the Pacer, find what was wrong, go back and ask again. With the
format documented and the simulator catching mistakes before they reach the
device, that loop gets a lot shorter.

## What you need

You'll want an AI assistant that can take a file, run code and hand a file
back. Claude (with its analysis tool) can, and so can ChatGPT and others.
You'll also need your configuration as a `.syx` file, and ideally the MIDI
documentation for whatever you're controlling. Most assistants can look that
up themselves, but attaching it is more reliable.

## 1. Export your configuration

Pull it from the Pacer, or open the snapshot you're working on. If you've
made edits, save them first. Then, in the
[device drawer](../reference/devices-and-files.md#the-device-drawer), click
**Export .syx** on the snapshot.

Hang on to that snapshot. It's your way back if things go sideways.

## 2. Ask

Attach the `.syx` file, plus the documentation for your gear if you have it,
and describe what you want. It helps a lot to point the AI at the format
reference, so it doesn't have to guess:

```text
I've attached a configuration dump (.syx) from a Nektar Pacer MIDI foot
controller. The file format is documented here. Read the whole page before
you change anything, and follow its "Writing a dump safely" section:

https://raw.githubusercontent.com/mvachhar/pacer-programmer/main/docs/reference/programming-the-pacer.md

Please change the dump as follows:

<what you want; see the example below>

Change only the presets I've named, and leave every other message exactly as
it is. Afterwards, decode your output and check that every message is framed
correctly and every checksum is right. Then give me the new .syx file to
download, and a short table of what each changed switch now does.
```

If your AI can't fetch web pages, download the page from GitHub and attach it
along with the dump.

### Example: a looper preset for the Quad Cortex

```text
Build a looper preset for a Neural DSP Quad Cortex in slot C1, named LOOPR.
Look up the Quad Cortex's MIDI CC chart for its looper (Looper X). Put the
looper's functions (record/overdub, play/stop, undo/redo and the rest) on
stompswitches 1-6 and B, one per switch, as momentary CC messages (CC Trigger:
127 on press, 0 on release) on the global channel. Give each switch its own
colour, bright when pressed and dim otherwise.

When C1 loads, it should send whatever CCs put the Quad Cortex into its
looper view; when A1 loads, it should send what takes it back out.
On A1, make switch A jump to C1. On C1, make switch A jump back to A1.
```

That gives you two presets that act as one feature: A1's switch A takes you
into the looper, and C1's switch A takes you back out. The
[preset map](../reference/preset-map.md) draws it that way, and the
[tutorials](../tutorials/README.md) build the same thing by hand and then let several
presets share it.

## 3. Load it and try it

1. In the device drawer, click **Import .syx** and pick the file the AI gave
   you. It opens as a new snapshot, and your original is left alone. If the
   import is refused, the message says which message is broken (a bad
   checksum, say, or an unterminated message). Paste that back to the AI.
2. Open the presets it changed. The
   [preset chooser](../reference/the-faceplate.md#the-preset-chooser) shows
   which ones, and Program mode spells out each switch's steps.
3. Choose your gear as the [simulated MIDI output](the-simulator.md), and play
   it. Press every switch the AI touched and listen. The
   [output log](../reference/simulate-mode.md#the-output-log) shows each
   message, so you can check it against your gear's MIDI chart.
4. Look at the lights. Does each switch's colour actually tell you the state
   of the thing it controls?
5. Look at the [preset map](../reference/preset-map.md). Does every route go
   where it should, and does every way in have a way out?

## 4. Fix and repeat

Small fixes are quickest in the app itself. Change a CC, a colour or a target
in Program mode and try it again right away. For bigger changes, tell the AI
what's wrong ("switch 3 sends CC 51 but the looper needs CC 52", or "the light
on switch 1 stays red after recording"), then save, export the current
version, and give it that file.

## 5. Send

When it's right, save, then click **Send to Pacer…**. It only writes the
presets that changed, and reads them back to check. See
[Saving and sending](saving-and-sending.md).

## Tips

Keep it to one feature per conversation. "Add a looper on C1" goes much better
than "redo my whole board."

Tell the AI which slots it's allowed to write, so it doesn't overwrite a
preset you use. A preset with nothing on it except next/previous stepping
counts as spare, and the map uses spare slots for the copies a returning
state needs. [Clear preset](../reference/program-mode.md#clear-preset) makes
one and names it `EMPTY`.

Ask for a table of what each switch does now, and check it against the app.
The two should agree.

Finally, don't let it guess at what isn't known. The reference lists what we
don't know about the Pacer, which includes most of the global settings. Those
are best set on the Pacer itself.
