# Why a state machine

The Pacer has 24 presets and no memory. A switch can send MIDI and jump to a
preset, but nothing on the device remembers where you were. Any time you
want it to behave like it remembers, you have to build that memory out of
presets by hand.

## The looper problem

Say you play from a few main presets, and from any of them you want to open
your modeller's looper, use it, and come back.

The looper's controls need a preset of their own: six switches for record,
play, undo and the rest. Entering it is easy — switch A on each main preset
jumps to it. Leaving is where it goes wrong. Switch A on the looper preset has
to jump *somewhere*, and a jump has one fixed target. If it's A1, every trip to
the looper from A2 ends on A1.

So you make **one looper preset per main preset**: one whose A goes back to
A1, one whose A goes back to A2, and so on. They're identical apart from that
one target. With twelve main presets it takes twelve copies: the whole
device.

And then you have to keep them identical. Change a colour, move undo to
another switch, fix a CC, and you make the same change on every copy, in an
editor that shows them as unrelated presets. Miss one and the looper behaves
differently depending on how you got there.

That's the job this app takes on.

## What you actually designed

Underneath the copies there's a simple design:

- **States**: places the Pacer can be — *main 1*, *main 2*, *looper*.
- **Routes**: switches that move between them — A from a main to the
  looper; A from the looper *back to wherever you came from*.

That last route — a **return** — is exactly what the Pacer can't express, and
the reason the copies exist. The design has one looper; the hardware needs
one per way in.

## What the app does with it

**It reads the design out of your presets.** Load any configuration, and the
[preset map](reference/preset-map.md) groups presets that behave identically
apart from where their jumps lead into one state, and recognises a set of
copies that each lead back to their own origin as a return. Your existing
board shows up as the design you meant, without you describing it.

**You edit the design, not the copies.** Change a state in Program mode and
every copy gets the change. Add a route on the map, and if it needs a new
copy, the app makes one — asking you which slot to use, and telling you what
it will cost before it writes anything.

**It won't let the design and the presets drift apart.** An edit that would
leave something the map couldn't read back the same way — a return that would
stop being one, copies that would stop agreeing — is refused, with the
reason, instead of being written and discovered on stage.

**Nothing else is saved.** There's no project file alongside your
configuration. The design is recomputed from the presets every time they're
loaded, so the `.syx` you send to the Pacer is the whole of it: pull it back
next year, or edit it on the Pacer's own front panel, and the map still shows
your design.

## When you don't need it

Plenty of boards are just presets: each one a set of patch changes and effect
toggles, with next and previous to move between them. Everything else in the
app — the [simulator](guide/the-simulator.md), the
[switch editor](guide/editing-a-preset.md), the
[AI workflow](guide/working-with-ai.md) — is for those as much as for
anything. The map simply shows them as presets on their own.

Ready to build one? Start with the [tutorials](tutorials/).
