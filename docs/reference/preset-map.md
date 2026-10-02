# The preset map

The preset map draws your configuration as the thing you designed: places,
and the switches that move between them. It's where you see that four presets
are really two main sounds and one looper, and where you change how they
connect.

If you're new to the idea, read
[Why a state machine](../why-a-state-machine.md) first; the
[tutorials](../tutorials/) build one step by step.

![The preset map, its parts numbered](../images/preset-map.png)

| | Part | What it is |
|---|---|---|
| 1 | **Show** | *Designed routes* leaves out plain next/previous stepping, which almost every preset has and which says nothing about your design. *Everything* draws it too, faintly. |
| 2 | **A state** | A place your Pacer can be. Its name, and under it the preset it lives in. The state you're on is highlighted. |
| 3 | **A route** | A switch that moves from one state to another, labelled with the switch's marking: `A`, `C`, `3`. Click it to change it. |
| 4 | **Several presets, one state** | Presets that behave identically apart from where their switches lead are drawn as one state. Hover for which presets. |
| 5 | **↩ returns** | The state has a switch that goes back to *wherever it was entered from*, here switch A. The Pacer can't do that on its own; it takes one preset per way in, which is why LOOPR is two presets. |
| 6 | **Pencil** | Opens the state in [Program mode](program-mode.md), on the preset you're on if it's one of them. Double-clicking the state does the same. |
| 7 | **A preset nothing routes to** | Every preset is a state, even ones no switch jumps to. The factory presets only step between neighbours, so with *Designed routes* they stand alone. |

The context bar above the map has the preset chooser and the same undo, Save
and Send controls as [Program mode](program-mode.md): changing a route is an
edit like any other.

## What makes a state

Two presets are the same state when they do exactly the same thing on every
switch — same messages, same lights, same control modes, same load-time MIDI —
and differ only in **where their jumps lead**. Names don't count: two copies
can be named differently and still be one state, and the state is only given
a name if every copy shares it.

That's the rule the map reads by, and the rule it edits by: when you change a
state in [Program mode](program-mode.md#editing-a-state-several-presets-at-once)
the change goes to every copy, so they stay one.

**A return** is read from the copies. A state's switch counts as a return when
the state has more than one copy and each copy leads back to the one preset
that enters it. A state with only one copy can't be told apart from a plain
jump — see [the route dialog](#when-the-map-has-to-ask) for how that's
settled.

**Stepping isn't a way in.** Next/previous names a direction, not a preset, so
it never counts towards entering a state, and it's left out of the map unless
you show *Everything*.

## Clicking around

| Do this | And |
|---|---|
| **Click a state** | Loads its preset in the simulator and lists its presets [below the map](#a-states-presets). |
| **Double-click a state**, or its pencil | Opens it in Program mode. |
| **Click a route** (the line or its badge) | Opens the [route dialog](#the-route-dialog) for it, and loads the preset it leaves from, so the faceplate is the one you're changing. |
| **Drag from a state to another** | Starts a new route between them. Drag from one of the small dots on a state's edge and drop on the other state's. |

## A state's presets

Clicking a state lists the presets behind it:

![LOOPR's two presets, each with the preset that enters it](../images/state-details.png)

For each preset:

- **Its slot and name.** The one you're on is highlighted.
- **Entered from** — which presets jump to it. For a state that returns, each
  copy has exactly one, and that's where it returns to.
- **Load** — loads it in the simulator.
- **Program** — opens it in Program mode.
- **Move to…** — moves it to an empty slot, and everything that jumped to it
  follows. Only empty presets are offered (clear one in
  [Program mode](program-mode.md#clear-preset) to make room); moving onto a
  preset in use would delete it. Use it to tidy a state's copies into one
  bank, say.

A move that would change what the configuration does — rather than only where
a preset sits — is refused, and the reason is shown here.

## The route dialog

Clicking a route opens it:

![The route dialog for MAIN0's switch A](../images/route-existing.png)

- **From** — the state the route leaves. If it's several presets, the route
  is written to all of them.
- **On switch** — which switch carries it. Each switch says what it does now:
  *free*, *sends 2 messages*, *goes to LOOPR*, *comes back to where it was
  entered from*, *selects the Track preset*… Choose another switch to move the
  route there; the switch it leaves goes back to doing nothing.
- **Goes to** — the state it leads to.
- **Replace what the switch does** — appears when you pick a switch that's
  busy. Ticked, the switch is emptied on every preset of the state and the
  route becomes all it does. Unticked, the route is added as one more step,
  if the switch has a free one.
- **Take the route away** — the switch stops jumping (its other steps stay).
- **Change route** / **Add route** — writes it. **Cancel** changes nothing.

Dragging between two states opens the same dialog with *Goes to* filled in
and *On switch* set to the first free switch.

### When a route costs a preset

A state that returns needs one preset per way in. So routing to one from
somewhere new needs a **new copy**, and the dialog says so and asks where to
put it:

![Adding a second way into LOOPR: settle what it means, then choose a slot for the copy](../images/route-choice.png)

- **Copy of LOOPR goes in** — the slot for the new copy. Empty presets are
  offered first. You can choose one in use, under *In use — would be
  overwritten*, and the dialog warns you that everything in it will be
  replaced.
- If there are no empty presets, the dialog says so. Clear one in
  [Program mode](program-mode.md#clear-preset), or choose one to overwrite.

The Pacer has 24 presets and no spare ones; a design that returns from many
places can fill them quickly. See [Slot budget](#slot-budget).

### When the map has to ask

A state entered from only one place, whose switch leads back there, could mean
either of two things:

- "go back to where I came from", or
- "always go to that preset".

With one way in they're the same preset, so nothing in the configuration says
which you meant. The moment you add a second way in, they stop being the same,
and the dialog asks:

| Leaving it | Means | Costs |
|---|---|---|
| **Comes back here** | Each way in returns to where it came from. | A new copy for the new way in. |
| **Always goes to *A1*** | Every way in leads on to the same preset. | Nothing: it stays one preset. |

If other presets were already sharing the single copy, choosing *Comes back
here* gives them copies of their own too, and their switches are pointed at
them. The dialog lists them.

### When a route is refused

The dialog won't write a route the map couldn't read back the same way. The
message says why; the common ones:

| Message | Why | What to do |
|---|---|---|
| *A route can't lead to the state it leaves from.* | That's a reload. | Use Preset Select → Current in Program mode. |
| *Step 1 on that switch already jumps somewhere…* | A press only takes the first jump. | Tick *Replace*, or choose another switch. |
| *Every step on that switch is in use…* | Nowhere to put the jump. | Tick *Replace*, or choose another switch. |
| *That would stop A3 coming back to where it was entered from…* | The edit would turn a return into a plain jump. | Usually: change the route on the state that enters it, not the copy. |
| *Can't route to "X": it's on the device N times…* | X has several identical copies and none of them returns, so there's no telling which one you mean. | Clear the extra copies, or give each a way back. |

More are explained in [Troubleshooting](troubleshooting.md).

## Slot budget

Every state that returns costs one preset per way in, and a state entered
from one of those copies multiplies again. Twelve main presets that each
enter a looper is twelve looper copies — all 24 slots. The map works this out
as you go and asks for a slot each time, rather than letting you design
something the Pacer can't hold.

Two ways to make room:

- [Clear a preset](program-mode.md#clear-preset) you don't use. It becomes an
  empty slot that routes offer first.
- Use **Always goes to** where you don't actually need to return to the
  origin.

## Notes the map can't draw

If something on the device can't be expressed as states and routes — two
copies that should be one but lead somewhere inconsistent, say — the map
shows it as it is and lists it above the map:
*1 thing on this device the machine can't express…*. It's not an error; it
just can't be drawn as a design. Your edits can't introduce new ones: an edit
that would is refused.
