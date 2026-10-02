# The faceplate

The faceplate is the on-screen Pacer. In Simulate mode it behaves like the
real one: press a switch and it lights, changes preset, and sends the MIDI the
real Pacer would. In Program mode, tapping a control opens it for
programming instead (see [Program mode](program-mode.md)).

![The faceplate, its parts numbered](../images/faceplate.png)

| | Part | What it does |
|---|---|---|
| 1 | **[Preset]** | Tap and hold for the firmware's preset select (see [below](#preset-select)). It isn't programmable. |
| 2 | **Stompswitches A–D** | The back row. Programmable like any switch. In preset select they choose a bank. |
| 3 | **Stompswitches 1–6** | The front row. Programmable. In preset select they load a preset from the chosen bank. |
| 4 | **Hint** | The app's note of what a press will do on this preset: `PC0`, `→track`, `P+`. It isn't on the real hardware; it's there so you can read a preset at a glance. |
| 5 | **Display** | The preset's name on the top line, its number on the bottom line — as on the Pacer. In Program mode the name is edited here. |
| 6 | **Preset chooser** | Opens a grid of all 24 presets, to jump to any of them (see [below](#the-preset-chooser)). |

Under each switch is its printed marking — the letters A–D and numbers 1–6
are on the real unit too. The encoder beside the display is drawn for
completeness; the app doesn't simulate the Pacer's own setup menus.

## A switch up close

![One front-row switch, lit, its lights numbered](../images/switch-anatomy.png)

| | Part | |
|---|---|---|
| 1 | **Top light** | The text legend ("Solo"). Front row only. |
| 2 | **Middle light** | The icon legend. On the back row, the printed legend ("Track", the transport icons…). |
| 3 | **Bar** | The colour bar under the legends. |
| 4 | **The switch** | Click or tap to press it; hold to keep it pressed. With the keyboard, Tab to it and press Space or Enter. |
| 5 | **Hint** | What a press will do (see above). |

Every light is full-colour, legends included. A switch shows one step's
colour at a time — the step it will fire next — on whichever light that step
chose. Above, switch 1's step sends Program Change 0, and the bar is bright
orange because the program on that channel *is* 0: the switch is "on".

### What the lights mean

| You see | Meaning |
|---|---|
| A bar or legend in a **bright** colour | The step that fires next is "on" — for example its CC holds the value it sends, its note is sounding, or its program is the current one. |
| The same colour, **dim** | That step is "off". |
| **Dark** | Nothing to show: the step's colour is Off, it's a next/previous switch (those stay dark), or the switch has nothing on it. |
| **Light blue** bar on [Preset] | You're on one of your own presets. |
| **Light blue** bar on A or B | You're in the firmware's Track (A) or Transport (B) preset. |
| **Flashing** | Preset select is waiting for you (see below). |
| A **legend** lit in its printed colour | The switch is assigned the function that legend shows — the Track legend while A selects Track, the arrows while C and D step. |

The colours themselves are set per step in Program mode. The exact rules —
which colour shows when, what "Default" means for each message type — are in
[Programming the Pacer › Lights](programming-the-pacer.md#lights).

### Pressing

- A press fires the switch's steps the way its control mode says: all of them
  at once, or the next one in a sequence. See
  [Switches and steps](../guide/switches-and-steps.md).
- Steps with something to do on release (CC Trigger sends its release value,
  a Note stops) do it when you let go.
- Everything a press sends appears in the output log — and goes to your gear,
  if you've chosen a [simulated MIDI output](the-window.md#in-simulate).

## Preset select

Hold [Preset] for two seconds and the Pacer enters preset select, as the
hardware does:

![Preset select: waiting for a bank and a number](../images/preset-select-mode.png)

- **A–D** choose a bank. The chosen bank's bar is lit bright blue, and the
  display shows it (`A--`).
- **1–6** load that number from the chosen bank. The loaded preset's number is
  bright; the others flash dim blue.
- **[Preset]**'s bar flashes red while it's waiting. Tap [Preset] to cancel.

Tapping [Preset] (without holding) on one of your own presets does nothing;
from the Track or Transport presets it returns to the preset you were on.

## Track and Transport

The factory set gives switch A the firmware's **Track** preset and B its
**Transport** preset, for controlling a DAW. Pressing them in the simulator
switches the panel over: the display names the DAW preset, A or B's bar is lit
light blue, and the switches show their DAW functions. Tap [Preset] to come
back.

The app records these DAW commands in the output log by name, but doesn't send
them as MIDI: the bytes of Nektar's DAW integration aren't known.

## The rear jacks

![The external footswitches and expression pedals](../images/rear-jacks.png)

- **Footswitches 1–4** are switches like any other: press them, and they fire
  whatever the current preset gives them. Each card shows what that is.
- **Expression pedals 1 and 2** are sliders: drag from heel (left) to toe
  (right), and the pedal sends its message continuously — a CC from its
  minimum to its maximum, say. Where a pedal sits is remembered across preset
  changes, as a real pedal stays where your foot left it.

## The preset chooser

The badge on the display's lower half (and the preset button in the preset
map's context bar) opens a grid of every preset, to jump straight to one. It's
an app shortcut; on the hardware, preset select does the same job.

![The preset chooser, by bank](../images/preset-chooser-banks.png)

**By bank** lays the 24 presets out as the Pacer does: banks A–D, presets 1–6.
**By state** groups the presets that behave alike — the way the
[preset map](preset-map.md) draws them — with the rest under "One preset
each":

![The preset chooser, by state](../images/preset-chooser-states.png)

| Mark | Meaning |
|---|---|
| ● | You've edited this preset since the configuration was opened. |
| ○ | The Pacer hasn't been sent this version of the preset yet. |
| ×2 | One of 2 presets that behave alike — one state. Hover for which. |

**CUR** is the device's working copy of the loaded preset, listed separately
because it isn't a preset you can choose on the hardware. See
[Programming the Pacer › The Current slot](programming-the-pacer.md#the-current-slot).

Choosing a preset loads it, exactly as the hardware would: the MIDI it sends on
load goes out too.
