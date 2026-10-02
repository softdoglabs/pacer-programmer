# Glossary

**All at once** — the default [control mode](program-mode.md#control-modes):
one press fires every active step.

**Bank** — a row of six presets, A–D. The Pacer has four.

**Control** — anything programmable: the ten stompswitches, four external
footswitches and two expression pedals.

**Control mode** — how a control fires its steps: All at once, Sequence or
External step.

**Copy** — one of several presets that make up a *state* (below). A state
that returns has one copy per way in.

**Current** (slot 0, `CUR`) — the Pacer's working copy of the loaded preset.
The switches run it; preset slots are only read when a preset is loaded.
See [Programming the Pacer › The Current slot](programming-the-pacer.md#the-current-slot).

**Dump** — the Pacer's whole configuration as SysEx messages, the format of a
`.syx` file.

**Edit scope** — whether an edit in Program mode goes to every preset of a
state or only the one in front of you. See
[Editing a state](program-mode.md#editing-a-state-several-presets-at-once).

**Entrant** — a preset with a switch that jumps to a given preset. Plain
stepping doesn't count.

**Legend** — the printed text or icons above a switch's bar. On the Pacer
every legend is a full-colour light.

**Load-time MIDI** — up to sixteen messages a preset sends whenever it's
recalled. See [MIDI sent on load](program-mode.md#midi-sent-on-load).

**Preset** — one of the 24 slots, A1–D6: what every switch does, plus a name
and load-time MIDI.

**Preset select** — the firmware's own way to change preset: hold [Preset],
then a bank and a number.

**Return** — a route that goes back to wherever the state was entered from.
The Pacer has no such action; it's built from one copy per way in, each
jumping back to its own origin.

**Route** — a switch that changes preset, drawn as an arrow on the map.

**Simulated MIDI output** — where the simulator sends what its switches
send: your rig, not the Pacer.

**Snapshot** — a configuration saved in this browser.

**Spare preset** — one that does nothing but step to its neighbours, such as
a cleared one, named `EMPTY`. New copies go there first.

**State** — a place your Pacer can be, drawn as a box on the map: one or more
presets that do the same thing on every switch, differing only in where their
jumps lead.

**Step** — one action of a control. Each control has six.

**Stepping** — Preset Inc/Dec: next or previous preset. It names a direction,
not a preset, so the map leaves it out by default.

**Track, Transport** — the firmware's built-in DAW presets, reached from
switches A and B in the factory set.
