# Why a state machine

The Pacer has 24 presets and no memory. A switch can send MIDI and jump to a
preset, but nothing on the device remembers where you were. If you want it to
behave as though it remembers, you have to build that memory out of presets,
by hand.

## The looper problem

Here's where I ran into it. I wanted to open my Quad Cortex's looper from any
of my main presets, use it, and come back to the preset I started on.

The looper's controls need a preset of their own, since it takes six or seven
switches for record, play, undo and the rest. Getting into it is easy: switch
A on each main preset jumps to the looper preset. Getting out is the problem.
Switch A on the looper has to jump somewhere, and a jump has exactly one
target. If that target is A1, then every trip to the looper from A2 ends up on
A1.

The fix is one looper preset per main preset. One copy's A goes back to A1,
another's goes back to A2, and so on. The copies are identical except for that
one target. With twelve main presets you need twelve copies, which is the
whole device.

And then you have to keep them identical. Change a colour, move undo to
another switch, or fix a CC, and you make the same change on every copy, in an
editor that shows them as twelve unrelated presets. Miss one and the looper
behaves differently depending on how you got there.

## What you actually designed

Underneath all those copies there's a pretty simple design. There are states,
which are the places the Pacer can be: main 1, main 2, the looper. And there
are routes between them: switch A from a main preset into the looper, and
switch A from the looper back to wherever you came from.

That last kind of route, a return, is the one thing the Pacer can't express.
It's the whole reason the copies exist. The design has one looper; the
hardware needs one per way in.

## What the app does with it

It reads the design out of your presets. When you load a configuration, the
[preset map](reference/preset-map.md) groups presets that behave identically
apart from where their jumps lead into one state, and it recognises a set of
copies that each lead back to their own origin as a return. A board you built
by hand years ago shows up as the design you meant, and you didn't have to
describe it to anyone.

You edit the design rather than the copies. Change a state in Program mode and
every copy gets the change. Add a route on the map, and if it needs a new copy
the app makes one. It asks you which slot to use, and it tells you what it'll
cost before it writes anything.

It also won't let the design and the presets drift apart. If an edit would
leave something the map can't read back the same way (a return that would
stop being one, say, or copies that would stop agreeing), the app refuses it
and tells you why. I'd much rather find that out at my desk than on stage.

Finally, nothing else gets saved. There's no project file sitting next to your
configuration. The design is worked out from the presets every time they're
loaded, so the `.syx` you send to the Pacer is the whole story. Pull it back a
year from now, or edit it on the Pacer's own front panel, and the map still
shows your design.

## When you don't need it

Plenty of boards are just presets: each one a set of patch changes and effect
toggles, with next and previous to move between them. That's fine. The
[simulator](guide/the-simulator.md), the
[switch editor](guide/editing-a-preset.md) and the
[AI workflow](guide/working-with-ai.md) are just as useful for those, and the
map just shows each preset on its own.

If you want to build one, the [tutorials](tutorials/) walk through my looper
from scratch.
