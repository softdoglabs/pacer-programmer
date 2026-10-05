# The Preset Map

The preset map draws your configuration the way you designed it: as places,
and the switches that move between them. This is where you'll notice that four
presets are really two main sounds and one looper, and it's where you change
how they connect.

If the idea is new to you, read [Why a state machine](../why-a-state-machine.md)
first. The [tutorials](../tutorials/README.md) build one step by step.

![The preset map, its parts numbered](../images/preset-map.png)

| | Part | What it is |
|---|---|---|
| 1 | Show | *Designed routes* leaves out plain next/previous stepping, which almost every preset has and which tells you nothing about your design. *Everything* draws it too, faintly. |
| 2 | A state | A place your Pacer can be. It shows its name, with the preset it lives in underneath. The state you're on is highlighted. |
| 3 | A route | A switch that moves you from one state to another, labelled with the switch's marking (`A`, `C`, `3`). Click it to change it. |
| 4 | Several presets, one state | Presets that behave identically apart from where their switches lead are drawn as a single state. Hover to see which presets. |
| 5 | ↩ returns | The state has a switch that goes back to wherever you entered it from, switch A in this case. The Pacer can't do that on its own. It takes one preset per way in, which is why LOOPR is two presets. |
| 6 | Pencil | Opens the state in [Program mode](program-mode.md), on the preset you're on if it's one of them. Double-clicking the state does the same. |
| 7 | A preset nothing routes to | Every preset is a state, even if no switch jumps to it. The factory presets only step between neighbours, so with *Designed routes* they stand alone. |

The context bar above the map has the preset chooser, plus the same undo, Save
and Send controls as [Program mode](program-mode.md), since changing a route is
an edit like any other.

## What Makes a State

Two presets are the same state when they do exactly the same thing on every
switch (the same messages, lights, control modes and load-time MIDI) and only
differ in where their jumps lead. Names don't count. Two copies can have
different names and still be one state, and a state only gets a name if every
copy shares it.

The map uses this rule both when it reads your presets and when you edit them.
When you change a state in
[Program mode](program-mode.md#editing-a-state-several-presets-at-once), the
change goes to every copy, so they stay one state.

Returns are worked out from the copies. A state's switch counts as a return
when the state has more than one copy and each copy leads back to the one
preset that enters it. With only one copy, there's no telling a return apart
from a plain jump. See [When the map has to ask](#when-the-map-has-to-ask) for
how that gets settled.

Stepping doesn't count as a way in. Next and previous name a direction rather
than a preset, so they never count towards entering a state, and they're left
off the map unless you choose *Everything*.

## Clicking Around

| Do this | And you get |
|---|---|
| Click a state | Its preset loads in the simulator, and its presets are listed [below the map](#a-states-presets). |
| Double-click a state, or click its pencil | It opens in Program mode. |
| Click a route (the line or its badge) | The [route dialog](#the-route-dialog) for it. The preset it leaves from is loaded, so the faceplate is the one you're changing. |
| Drag from one state to another | A new route between them. Drag from one of the small dots on a state's edge and drop on the other state's. |

## A State's Presets

Clicking a state lists the presets behind it:

![LOOPR's two presets, each with the preset that enters it](../images/state-details.png)

Each row shows the preset's slot and name (the one you're on is highlighted),
and which presets jump to it. For a state that returns, each copy has exactly
one, and that's where it returns to.

**Load** loads the preset in the simulator, and **Program** opens it in
Program mode. **Move to…** moves it to an empty slot, and everything that
jumped to it follows. Only empty presets are offered, because moving onto a
preset that's in use would delete it, so you may need to
[clear one](program-mode.md#clear-preset) first. This is handy for tidying a
state's copies into one bank, say.

If a move would change what the configuration does, rather than just where a
preset sits, it's refused and the reason shows up here.

## The Route Dialog

Clicking a route opens it:

![The route dialog for MAIN0's switch A](../images/route-existing.png)

- **From** is the state the route leaves from. If that's several presets, the
  route is written to all of them.
- **On switch** is which switch carries it. Each switch says what it does now:
  *free*, *sends 2 messages*, *goes to LOOPR*, *comes back to where it was
  entered from*, *selects the Track preset*, and so on. Pick a different switch
  to move the route there, and the switch it leaves goes back to doing
  nothing.
- **Goes to** is the state it leads to.
- **Replace what the switch does** appears when you pick a switch that's busy.
  If you tick it, the switch is emptied on every preset of the state, and the
  route becomes the only thing it does. If you don't, the route is added as
  one more step, as long as the switch has a free one.
- **Take the route away** stops the switch from jumping. Its other steps stay.
- **Change route** (or **Add route**) writes it, and **Cancel** changes
  nothing.

Dragging between two states opens the same dialog, with *Goes to* filled in and
*On switch* set to the first free switch.

### When a Route Costs a Preset

A state that returns needs one preset per way in. So routing to it from
somewhere new needs a new copy, and the dialog tells you that and asks where to
put it:

![Adding a second way into LOOPR: settle what it means, then choose a slot for the copy](../images/route-choice.png)

**Copy of LOOPR goes in** is the slot for the new copy. Empty presets are
offered first. You can pick one that's in use, listed under *In use — would be
overwritten*, and the dialog warns you that everything in it will be
replaced. If there are no empty presets, the dialog says so, and you can either
clear one in [Program mode](program-mode.md#clear-preset) or choose one to
overwrite.

The Pacer has 24 presets and no spare ones, so a design that returns from lots
of places can fill them up quickly. See [Slot budget](#slot-budget).

### When the Map Has to Ask

Take a state you can only enter from one place, whose switch leads back
there. That switch could mean "go back to where I came from," or it could mean
"always go to that preset." With only one way in, those come out as the same
preset, so nothing in the configuration says which one you meant. As soon as
you add a second way in, they're no longer the same, and the dialog asks:

| Leaving it | Means | Costs |
|---|---|---|
| Comes back here | Each way in returns to where it came from. | A new copy for the new way in. |
| Always goes to *A1* | Every way in leads on to the same preset. | Nothing. It stays one preset. |

If other presets were already sharing that single copy, choosing *Comes back
here* gives them their own copies too, and points their switches at them. The
dialog lists which ones.

### When a Route Is Refused

The dialog won't write a route that the map couldn't read back the same way.
The message tells you why. These are the common ones:

| Message | Why | What to do |
|---|---|---|
| *A route can't lead to the state it leaves from.* | That's a reload. | Use Preset Select → Current in Program mode. |
| *Step 1 on that switch already jumps somewhere…* | A press only takes the first jump. | Tick *Replace*, or pick another switch. |
| *Every step on that switch is in use…* | There's nowhere to put the jump. | Tick *Replace*, or pick another switch. |
| *That would stop A3 coming back to where it was entered from…* | The edit would turn a return into a plain jump. | Usually the fix is to change the route on the state that enters it, rather than on the copy. |
| *Can't route to "X": it's on the device N times…* | X has several identical copies and none of them returns, so there's no telling which one you mean. | Clear the extra copies, or give each one a way back. |

[Troubleshooting](troubleshooting.md) covers the rest.

## Slot Budget

Every state that returns costs one preset per way in. If you have twelve main
presets that each lead into a looper, that's twelve looper copies, and all 24
slots are used up. The map keeps track of this as you go and asks for a slot
each time, so you can't end up designing something the Pacer can't hold.

If you need more room, you can [clear a preset](program-mode.md#clear-preset)
you don't use, which turns it into an empty slot that routes will offer first.
Or, where you don't actually need to return to the origin, use **Always goes
to** instead.

## Notes the Map Can't Draw

Sometimes there's something on the device that can't be expressed as states
and routes, such as two copies that should be one but lead somewhere
inconsistent. The map draws it as it is, and lists it above the map under
*1 thing on this device the machine can't express…*. That isn't an error. It
just can't be drawn as a design. Your own edits can't add new ones, because an
edit that would is refused.
