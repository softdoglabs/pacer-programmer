# Glossary

**All at once**: The default [control mode](program-mode.md#control-modes),
where one press fires every active step.

**Bank**: A row of six presets, A–D. The Pacer has four.

**Control**: Anything you can program, meaning the ten stompswitches, the four
external footswitches and the two expression pedals.

**Control mode**: How a control fires its steps (All at once, Sequence or
External step).

**Copy**: One of several presets that make up a *state* (below). A state
that returns has one copy per way in.

**Current** (slot 0, `CUR`): The Pacer's working copy of the loaded preset.
The switches run it; preset slots are only read when a preset is loaded.
See [Programming the Pacer › The Current slot](programming-the-pacer.md#the-current-slot).

**Dump**: The Pacer's whole configuration as SysEx messages, the format of a
`.syx` file.

**Edit scope**: Whether an edit in Program mode goes to every preset of a
state or only the one in front of you. See
[Editing a state](program-mode.md#editing-a-state-several-presets-at-once).

**Entrant**: A preset with a switch that jumps to a given preset. Plain
stepping doesn't count.

**Legend**: The printed text or icons above a switch's bar. On the Pacer
every legend is a full-colour light.

**Load-time MIDI**: Up to sixteen messages a preset sends whenever it's
recalled. See [MIDI sent on load](program-mode.md#midi-sent-on-load).

**Preset**: One of the 24 slots, A1–D6. It holds what every switch does, plus
a name and load-time MIDI.

**Preset select**: The firmware's own way to change preset. You hold
[Preset], then press a bank and a number.

**Return**: A route that goes back to wherever the state was entered from.
The Pacer has no such action, so it's built from one copy per way in, each
jumping back to its own origin.

**Route**: A switch that changes preset, drawn as an arrow on the map.

**Simulated MIDI output**: Where the simulator sends what its switches
send. That's your rig, never the Pacer.

**Snapshot**: A configuration saved in this browser.

**Spare preset**: A preset that does nothing except step to its neighbours.
Clearing a preset makes one and names it `EMPTY`. New copies go there first.

**State**: A place your Pacer can be, drawn as a box on the map. It's one or
more presets that do the same thing on every switch and only differ in where
their jumps lead.

**Step**: One action of a control. Each control has six.

**Stepping**: Preset Inc/Dec, which moves to the next or previous preset.
Since it names a direction rather than a preset, the map leaves it out by
default.

**Track, Transport**: The firmware's built-in DAW presets, reached from
switches A and B in the factory set.
