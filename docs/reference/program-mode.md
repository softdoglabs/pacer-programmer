# Program mode

Program mode is where you change what your presets do. Your changes take
effect right away: the faceplate, the simulator and the preset map all run the
edited configuration, so you can press what you just programmed and hear it on
your gear before the Pacer ever sees it.

Nothing reaches the Pacer until you [send it](devices-and-files.md#sending-to-the-pacer).

## The faceplate in Program mode

![The faceplate in Program mode, with a pencil on everything programmable](../images/program-faceplate.png)

Every control you can program has a pencil on it. Tap the control (or the
pencil) to open it in the [switch editor](#the-switch-editor). Tapping doesn't
fire anything in Program mode. The rear jacks (footswitches 1–4 and expression
pedals 1–2) have pencils too, and open in the same editor.

[Preset] has a struck-out pencil and doesn't respond, because it belongs to the
firmware and you can't program it.

The display has two badges. The small pencil beside the name
[renames the preset](#renaming-a-preset), and the one in the corner opens the
[preset chooser](the-faceplate.md#the-preset-chooser).

## The switch editor

When you open a control, its editor replaces the faceplate:

![The switch editor, its parts numbered](../images/switch-editor.png)

| | Part | What it does |
|---|---|---|
| 1 | Preset | The preset you're editing, shown as a breadcrumb: `A1 PRGM1 › Stomp 1`. Click it to switch presets without leaving the editor. |
| 2 | Switch picker | Every programmable control: front row 1–6, back row A–D, and the rear jacks. Pick another one to edit it on the same preset. |
| 3 | Close | Back to the faceplate. Your browser's Back button does the same thing. |
| 4 | Live control | A working copy of the control you're editing. Press it and it fires, lights and sends just as it would in Simulate. |
| 5 | Fires | The control mode, which decides what one press does with the steps (see [below](#control-modes)). |
| 6 | Step type | What this step sends or does. |
| 7 | Channel | The MIDI channel it sends on. *Global* uses the configuration's own channel. It only appears for types that send channel messages. |
| 8 | Data | The type's own values, labelled for that type: a CC number and its values, a program and bank, a note and velocity, and so on. |
| 9 | Light | Which of the switch's lights this step colours. |
| 10 | Lit by | Whether the light follows the switch or incoming MIDI (see [below](#lit-by-incoming-midi)). |
| 11 | Colours | The two colours the light can show, each labelled with when it shows. |
| 12 | Remove step | Turns the step off. This is only on steps 2–6, since step 1 always exists. |
| 13 | + Add step | Turns on the next free step. A control has six, and the button is disabled once they're all in use. |

In the picture, step 2 shows a note where its colours would be: *Not shown: a
switch lights one step at a time, and in All-at-once mode that's the first
step.* Each card tells you whether its colours will ever be seen, and when.
Step 1 has the **lights the switch** badge.

### Control modes

| Fires | One press… |
|---|---|
| All at once | Fires every active step, in order. This is how one press can send a Program Change and also jump to another preset. It's the usual choice. |
| Sequence | Fires the next active step, wrapping around after the last. Inactive steps are skipped, but a step whose type is Off still takes its turn (and sends nothing). |
| External step | Fires whichever step another switch has chosen with Step Select or Step Inc/Dec. |

There's more detail, including what the hardware does in each mode, in
[Programming the Pacer › Control modes](programming-the-pacer.md#control-modes-what-a-press-fires).

### Step types

The type picker groups them by what they do.

**Send MIDI**

| Type | Data | A press… |
|---|---|---|
| Program + Bank | Program, Bank LSB, Bank MSB | Sends a bank select (if set) and a program change. |
| Program Step | Start, End | Sends the next program in a range, one per press. |
| CC Trigger | CC#, Press, Release | Sends *Press* when you press and *Release* when you let go. |
| CC Toggle | CC#, Press 1, Press 2 | Sends *Press 1*, or *Press 2* if the controller already holds *Press 1*. |
| CC Step | CC#, Start, End | Steps a controller through a range. |
| Note | Note, Velocity | Sounds the note while you hold the switch. |
| Note Toggle | Note, Velocity | Starts the note, and the next press stops it. |
| NRPN Coarse / Fine | Value, NRPN LSB, NRPN MSB | Sends an NRPN value. |
| MMC | Device, Command | Sends a MIDI Machine Control command (stop, play, record and so on). MMC is SysEx, so it needs SysEx permission to reach your gear. |

**Pacer actions.** These act on the Pacer itself and send nothing on the MIDI
wire.

| Type | Data | A press… |
|---|---|---|
| Preset Select | **Jump to**: a user preset A1–D6, or the firmware's Track or Transport preset | Loads that preset. |
| Preset Inc/Dec | **Direction**: next or previous | Steps to the neighbouring preset, wrapping from D6 to A1. |
| Relay | Mode, Relay | Switches one of the four relay outputs. |
| Step Select / Step Inc/Dec | Data 1–3 | Chooses which step another switch in External step mode fires. |

**Nothing.** A step of type *Off* doesn't do anything.

Expression pedals have their own list: MIDI CC, Pitch Bend, Channel
Aftertouch and NRPN. Each is swept between a *Min* and a *Max* as the pedal
moves.

The byte layout of every type is in
[Programming the Pacer › Step message types](programming-the-pacer.md#step-message-types).

### Lights and colours

A switch shows the colours of one step at a time, the one that will fire next.
In All-at-once mode that's always step 1, and in Sequence mode it follows the
sequence.

**Light** picks which light that step uses. You're only offered the lights
that switch actually has. The front row has a *Bar*, an *Icon legend* and a
*Text legend*, while the back row has a *Bar* and its printed legend.

The two colours are labelled by what makes each one show, because that
depends on the type:

| Type | First colour shows… | Second colour shows… |
|---|---|---|
| CC Toggle, CC Trigger | While CC *n* holds *Press 1* (or *Press*) | Otherwise |
| Note, Note Toggle | While the note is on | Otherwise |
| Program + Bank | While this program is active on the channel | Otherwise |
| Preset Select (to a user preset) | Always (the second colour isn't used) | |
| Preset Select (to Track or Transport) | While that DAW preset is active, in light blue | Dark otherwise |
| Preset Inc/Dec | Never, since the light stays dark | |
| Anything else | While the switch is held ("On color") | Otherwise ("Off color") |

"Holds" means the last value the Pacer sent on that controller, from any
switch on any preset. So two switches that toggle the same CC share their
state, and their lights agree.

Click a colour to open the picker:

![The colour picker](../images/colour-picker.png)

Each of the twelve hues comes in a bright and a dim version. **Default** uses
the type's own colour (orange for programs, blue for CCs, green for notes, red
for preset changes and so on), bright when on and dim when off. **Off** keeps
the light dark.

The full colour table is in
[Programming the Pacer › Colour codes](programming-the-pacer.md#colour-codes).

### Lit by incoming MIDI

Setting **Lit by** to *Incoming MIDI* hands a CC step's light over to your DAW.
The light then follows that CC as it arrives over USB, and pressing the switch
no longer changes it, although the step still sends. This is the Pacer's own
"MIDI LED feedback" setting.

It only works on CC steps. On anything else it has no effect, and the editor
tells you so. Since the Pacer has no MIDI In jack, the CC has to come back
over USB from something that echoes it. And because the app has no MIDI input,
the simulator shows what the Pacer shows before anything answers, which is the
second colour.

### Edits that reach further than you'd think

Two switches on the same CC share a value whether you meant them to or not.
Toggling one changes what the other sends next, and both lights follow.

A Preset Select's target is the one thing that's edited per preset, even when
you're [editing a state](#editing-a-state-several-presets-at-once). It's where
that copy leads, and the copies need to differ there.

## Renaming a preset

Tap the small pencil beside the name on the display. The name line opens for
typing, with the old name selected:

![Renaming on the display](../images/rename.png)

Press Enter or click away to keep the new name, or press Escape to put the old
one back. Names can be up to five characters, which is what the display
shows. A longer name, or one with a character the Pacer can't store, turns red
and won't be kept.

Names are stored in capitals, the way the Pacer has them. Characters other
than A–Z, 0–9, space and `-` are allowed, but you'll get a warning, because
the Pacer can store them but may not be able to draw them.

## The preset's own settings

Under the faceplate, Program mode shows the settings that belong to the preset
rather than to any one switch:

![The preset panel: MIDI sent on load, and Clear preset](../images/preset-panel.png)

### MIDI sent on load

A preset can send up to sixteen messages whenever it's recalled, whether by
preset select, by a switch jumping to it, or by stepping. Use them to put your
rig in the right state for the preset, like a program change for the amp or a
CC to set a level.

**+ Add message** adds one, and **✕** removes it. Each message has a type
(Program + Bank, CC, Note, NRPN, MMC or Relay), a channel and its data, much
like a step. One difference to watch for: a preset's CC is a controller and
one value, while a switch's CC Toggle has two values.

The simulator sends these too, whenever you load the preset.

### Clear preset

**Clear preset…** empties the preset. Every switch is set to Off, its
load-time MIDI is removed, and it's renamed `EMPTY`. The confirmation tells you
what will go, and warns you if any other preset still jumps here.

An empty preset is a spare slot. When the [preset map](preset-map.md) needs a
new preset for a state that comes back (one copy for each place it's entered
from), it offers the spare slots first. A preset only counts as spare if it
does nothing except step to its neighbours.

Like every other edit, clearing can be undone. Undo only changes the app's
copy, though, so if you've already sent the cleared preset, send again.

## Editing a state: several presets at once

On the preset map, presets that behave alike are drawn as one state. The usual
example is a looper preset with one copy for each place you can enter it from.
The copies have to stay identical apart from where they lead back to, or they
stop being one state.

So when the preset you're on is one of several, Program mode edits all of them
together, and it tells you so in three places.

The context bar gives you a choice:

![Changes: All 2 presets / A3 only](../images/edit-scope-bar.png)

| Changes | Your edits go to… |
|---|---|
| All N presets (the default) | Every preset in the state, so they stay one state. |
| *A3* only | This preset alone. It stops behaving like the others and leaves the state. |

Hover over the choices to see which presets they mean.

The display shows the number of presets where the preset number would be:

![The display while editing two presets at once](../images/edit-scope-display.png)

And the preset panel names them:

![The note naming the state's presets](../images/edit-scope-note.png)

Everything you edit follows that choice: steps, colours, control modes, the
name and the load-time MIDI. Clear preset is an obvious exception, since it
only ever clears the preset in front of you. The less obvious one is where a
Preset Select leads. That's always edited on the preset in front of you,
because it's what tells the copies apart. If you want to change routes between
states, the [preset map](preset-map.md) is the better place, since it keeps
every copy's way back in order.

## Undo, redo and unsaved changes

Undo and Redo (⌘Z and ⇧⌘Z, or Ctrl on Windows and Linux) cover every edit:
steps, names, preset MIDI, clearing, and anything you change on the preset
map.

The **unsaved** badge appears as soon as something has changed since the
configuration was opened or saved. **Save…** keeps your work in this browser
(see [Devices and files](devices-and-files.md#saving)).

In the [preset chooser](the-faceplate.md#the-preset-chooser), a filled dot
marks each preset you've edited, and a hollow dot marks each preset the Pacer
hasn't been sent yet.
