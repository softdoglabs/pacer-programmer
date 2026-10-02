# Working with an AI

A Pacer configuration is a `.syx` file: a few thousand short SysEx messages.
That format is fully written down in
[Programming the Pacer](../reference/programming-the-pacer.md), so an AI
assistant that can read files and run code can read your configuration,
change it, and hand you back a new `.syx` — the kind of bulk programming that
takes an evening by hand.

This app is the other half of that: you load what the AI made, **play it in
the simulator against your real rig**, see on the preset map what it actually
connects to what, and only send it to the Pacer once it's right.

The looper preset these docs use as their example was first built this way,
with Claude, before this app could simulate anything: the AI read the source
of an older Pacer editor to learn the format, and every guess went straight
to the Pacer. Now the format is written down and the simulator catches the
mistakes, which makes the loop much shorter.

## What you need

- An AI assistant that can take a file, run code and give you a file back —
  Claude (with its analysis tool), ChatGPT and similar can.
- Your configuration as a `.syx` file.
- The documentation for whatever you're controlling — your modeller's MIDI
  chart, say. Most AIs can look it up; attaching it is more reliable.

## 1. Export your configuration

Pull it from the Pacer, or open the snapshot you're working on. If you've
made edits, **Save** them first. Then, in the
[device drawer](../reference/devices-and-files.md#the-device-drawer), click
**Export .syx** on the snapshot.

Keep that snapshot: it's your way back.

## 2. Ask

Attach the `.syx` file, and the documentation for your gear if you have it,
and describe what you want. Point the AI at the format reference, so it
doesn't have to guess:

```text
I've attached a configuration dump (.syx) from a Nektar Pacer MIDI foot
controller. The file format is documented here — read the whole page before
you change anything, and follow its "Writing a dump safely" section:

https://raw.githubusercontent.com/mvachhar/pacer-programmer/main/docs/reference/programming-the-pacer.md

Please change the dump as follows:

<what you want — see the example below>

Change only the presets I've named, and leave every other message exactly as
it is. Afterwards, decode your output and check that every message is framed
correctly and every checksum is right. Then give me the new .syx file to
download, and a short table of what each changed switch now does.
```

If your AI can't fetch web pages, download the page from GitHub and attach it
alongside the dump.

### Example: a looper preset for the Quad Cortex

```text
Build a looper preset for my Neural DSP Quad Cortex in slot C1, named LOOPR.
Look up the Quad Cortex's MIDI CC chart for its looper (Looper X). Put the
looper's functions — record/overdub, play/stop, undo/redo and the rest — on
stompswitches 1–6 and B, one per switch, as momentary CC messages (CC Trigger:
127 on press, 0 on release) on the global channel. Give each switch its own
colour, bright when pressed and dim otherwise.

When C1 loads, it should send whatever CCs put the Quad Cortex into its
looper view; when A1 loads, it should send what takes it back out.
On A1, make switch A jump to C1. On C1, make switch A jump back to A1.
```

That's two presets that act as one feature: A1's switch A enters "the
looper", and C1's switch A leaves it. The [preset map](../reference/preset-map.md)
draws exactly that — and the [tutorials](../tutorials/) build the same thing
by hand, then let several presets share it.

## 3. Load it and try it

1. In the device drawer, **Import .syx** the file the AI gave you. It opens as
   a new snapshot; your original is untouched.
   - If the import is refused, the message says which message is broken
     (a checksum, an unterminated message). Paste it back to the AI.
2. Open the presets it changed. The
   [preset chooser](../reference/the-faceplate.md#the-preset-chooser) shows
   them; Program mode shows each switch's steps in plain words.
3. Choose your gear as the [simulated MIDI output](the-simulator.md), and
   **play it**: press every switch the AI touched and listen. The
   [output log](../reference/simulate-mode.md#the-output-log) shows each
   message sent, so you can compare it with your gear's MIDI chart.
4. Check the lights: does each switch's colour tell you the truth about the
   state it controls?
5. Look at the [preset map](../reference/preset-map.md): does every route go
   where it should, and does every way into a state have a way out?

## 4. Fix and repeat

Small fixes are quickest in the app itself: change a CC, a colour, a target
in Program mode, and try it again straight away. For larger changes, describe
what's wrong to the AI — "switch 3 sends CC 51 but the looper needs CC 52",
"the light on switch 1 stays red after recording" — save, export the current
version, and give it that file.

## 5. Send

When it's right, **Save**, then **Send to Pacer…**. It writes only the
presets that changed, and reads them back to check. See
[Saving and sending](saving-and-sending.md).

## Tips

- **One feature per conversation.** "Add a looper on C1" goes better than
  "redo my whole board".
- **Name the slots.** Tell the AI which presets it may write, so it doesn't
  overwrite one you use.
- **Ask for a table** of what each switch now does, and check it against the
  app: the two should agree.
- **Spare slots:** a preset with nothing on it but next/previous stepping is
  spare, and the map uses spare slots for the copies a returning state needs.
  [Clear preset](../reference/program-mode.md#clear-preset) makes one, named
  `EMPTY`.
- **Don't let it guess at what isn't known.** The reference lists what isn't
  known about the Pacer, such as most global settings. Things outside it are
  best done on the Pacer itself.
