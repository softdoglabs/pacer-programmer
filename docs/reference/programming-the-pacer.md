# Programming the Pacer: The SysEx Format and What It Means

This page describes how a Nektar Pacer is programmed: the bytes of a
configuration dump (`.syx`) and what each one does on the hardware. It's
written to be complete enough that you can read or write a dump with nothing
else to go on, whether you're a person or an AI that's been handed a `.syx`
file and asked to change it.

Every fact here was checked against a real Pacer's factory dump and, where
noted, against the hardware itself. Where something isn't known, it says so.

> **If you're an AI editing a dump:** read [Writing a dump safely](#writing-a-dump-safely)
> before changing anything. In short: recompute every checksum, change only the
> presets you were asked to change, set unused fields to Off rather than deleting
> them, and decode your output afterwards to check it.

Numbers are hexadecimal where written `0x..` or as bare byte sequences
(`F0 00 01 77`), and decimal otherwise.

## Contents

- [The Dump at a Glance](#the-dump-at-a-glance)
- [Message Framing](#message-framing)
- [The Checksum](#the-checksum)
- [Fields](#fields)
- [Addressing: Target, Slot, Object](#addressing-target-slot-object)
- [Preset Names](#preset-names)
- [Controls: Modes, Steps, Lights](#controls-modes-steps-lights)
- [Step Message Types](#step-message-types)
- [Changing Preset: Preset Select and Inc/Dec](#changing-preset-preset-select-and-incdec)
- [Control Modes: What a Press Fires](#control-modes-what-a-press-fires)
- [Lights](#lights)
- [Expression Pedals](#expression-pedals)
- [MIDI Sent When a Preset Loads](#midi-sent-when-a-preset-loads)
- [The Current Slot](#the-current-slot)
- [Global Settings](#global-settings)
- [Reading from a Pacer](#reading-from-a-pacer)
- [Writing a Dump Safely](#writing-a-dump-safely)
- [Sending to a Pacer](#sending-to-a-pacer)
- [Worked Examples](#worked-examples)
- [What Isn't Known](#what-isnt-known)

## The Dump at a Glance

A full configuration dump is a sequence of independent SysEx messages, each
one setting a few fields. A factory dump is **4,762 messages, 139,544 bytes**:

| Part | Messages |
|---|---|
| 25 preset slots (the Current slot + A1–D6), 189 messages each | 4,725 |
| Global settings | 37 |

The 189 messages of one preset:

| What | Messages |
|---|---|
| Name | 1 |
| 10 stompswitches (1–6, A–D) × (1 control mode + 6 steps + 6 lights) | 130 |
| 4 footswitches × (1 control mode + 6 steps) | 28 |
| 2 expression pedals × (1 control mode + 6 steps) | 14 |
| 16 preset MIDI messages | 16 |

**Every field is present, used or not.** A dump carries all six steps of every
control and all sixteen preset messages; the unused ones are simply set to
Off. This matters when writing: the Pacer keeps whatever a message doesn't
address, so leaving a field out doesn't clear it (see
[Writing a dump safely](#writing-a-dump-safely)).

Message order doesn't matter to the Pacer, since each message stands on its
own. Dumps from the device go preset by preset, though, and keeping that order
makes files easier to compare.

## Message Framing

Every message has the same shape:

```
F0 00 01 77 7F  <cmd> <tgt> <idx> <obj> <field bytes…>  <checksum>  F7
```

| Bytes | Meaning |
|---|---|
| `F0` | Start of SysEx |
| `00 01 77` | Nektar's manufacturer ID |
| `7F` | Device ID (always `7F`) |
| `cmd` | `01` = Set (what a dump is made of), `02` = Get (a request) |
| `tgt` | `01` = a preset, `05` = global settings (`7F` = "full backup", only in a Get) |
| `idx` | Which preset slot (or global slot); see [Addressing](#addressing-target-slot-object) |
| `obj` | Which part of it: the name, a control, or the preset MIDI (see below) |
| field bytes | One or more fields; see [Fields](#fields) |
| checksum | See [The checksum](#the-checksum) |
| `F7` | End of SysEx |

All bytes between `F0` and `F7` are 7-bit (0–127), as MIDI requires.

## The Checksum

The checksum covers **`cmd` through the last field byte**. It doesn't cover
the manufacturer and device bytes, or `F0` and `F7`. It's chosen so that

```
(sum of covered bytes + checksum) mod 128 = 0
```

that is, `checksum = (128 − (sum mod 128)) mod 128`.

Example: A1's name message is
`F0 00 01 77 7F 01 01 01 01 01 05 50 52 47 4D 31 0F F7`. The covered bytes are
`01 01 01 01 01 05 50 52 47 4D 31`, which sum to 369. 369 mod 128 = 113, and
128 − 113 = 15 = `0F`. ✓

A message with a wrong checksum is rejected; **recompute it whenever you change
a byte**.

## Fields

After `obj`, a message carries one or more fields. Each field is

```
<elm> <len> <value bytes (len of them)>
```

and **every field except the last is followed by one `00` byte**. That byte's
purpose isn't known; write it, and skip it when reading.

So a message with three one-byte fields looks like
`elm₁ 01 v₁ 00  elm₂ 01 v₂ 00  elm₃ 01 v₃`.

Some groups of fields always travel together in one message, in a fixed order:
a step's six fields, a light's four, a preset MIDI message's five. Write them
that way.

## Addressing: Target, Slot, Object

### Preset Slots (`idx`, with `tgt` = `01`)

| `idx` | Slot |
|---|---|
| `00` | **Current**, the device's working copy of whichever preset is loaded (see [The Current slot](#the-current-slot)) |
| `01`–`06` | A1–A6 |
| `07`–`0C` | B1–B6 |
| `0D`–`12` | C1–C6 |
| `13`–`18` | D1–D6 |

In general, `idx = bank × 6 + number`, with banks A–D as 0–3 and numbers
1–6. So C1 is 2 × 6 + 1 = 13 = `0D`.

### Objects Within a Preset (`obj`)

| `obj` | What | Has steps | Has lights |
|---|---|---|---|
| `01` | The preset's name | | |
| `0D`–`12` | Stompswitches 1–6 (the front row) | ✓ | ✓ |
| `14`–`17` | Stompswitches A–D (the back row, beside [Preset]) | ✓ | ✓ |
| `18`–`1B` | Footswitches 1–4 (external, on the rear jacks) | ✓ | |
| `36`, `37` | Expression pedals 1 and 2 | ✓ | |
| `7E` | The preset's MIDI messages, sent when it loads | | |

The [Preset] button itself isn't programmable, and has no object.

## Preset Names

```
obj 01, elm 01, len 05, then 5 ASCII characters
```

Names are 5 characters (the width of the display), padded with spaces. Every name
the Pacer has been seen to use is upper-case letters, digits, space and `-`;
other printable characters may not show as typed on the 14-segment display.

## Controls: Modes, Steps, Lights

Each switch or pedal (`obj` `0D`–`1B`, `36`, `37`) has a control mode and six
steps, and stompswitches also have a light setting per step.

### Control Mode (Element `60`)

```
obj <control>, elm 60, len 01, <mode>
```

| Mode | Meaning |
|---|---|
| `00` | All at once: a press fires every active step |
| `01` | Sequence: each press fires the next active step |
| `02` | External step select: another switch chooses which step fires |

See [Control modes](#control-modes-what-a-press-fires) for what happens on a press.

### Steps (Elements `01`–`24`)

Each control has six steps. Step *n* (1–6) occupies six elements starting at
`base = (n − 1) × 6 + 1`, always sent together in one message:

| Element | Field | Values |
|---|---|---|
| base + 0 | Channel | `00` = the global channel, `01`–`10` = MIDI channels 1–16 |
| base + 1 | Message type | See [Step message types](#step-message-types) |
| base + 2 | Data 1 | Depends on the type |
| base + 3 | Data 2 | Depends on the type |
| base + 4 | Data 3 | Depends on the type |
| base + 5 | Active | `00` = off, `01` = on |

So step 1 is elements `01`–`06`, step 2 is `07`–`0C`, and so on to step 6 at
`1F`–`24`.

- **An inactive step never fires** and isn't counted in Sequence mode.
- **An active step whose type is Off** does take its turn in Sequence mode,
  and sends nothing.
- **Step 1 is always active** on the hardware: the Pacer's own menu won't turn
  it off. To make a switch do nothing, set step 1's type to Off.

### Lights (Elements `40`–`57`, Stompswitches Only)

Each stompswitch has a light setting per step. Step *n*'s four elements start at
`base = 0x40 + (n − 1) × 4`, always sent together:

| Element | Field | Values |
|---|---|---|
| base + 0 | MIDI feedback | `00` = off, `01` = on (see [Lights](#lights)) |
| base + 1 | First colour | A colour code; see [Colour codes](#colour-codes) |
| base + 2 | Second colour | A colour code |
| base + 3 | Which light | `00`/`01` = the bar, `02` = the middle light, `03` = the top light |

Footswitches and expression pedals have no lights and no light messages.

## Step Message Types

The message type byte of a switch step (stompswitches and footswitches):

| Type | Name | Data 1 | Data 2 | Data 3 | What a press does |
|---|---|---|---|---|---|
| `61` | Off | – | – | – | Nothing |
| `40` | CC Trigger | Controller | Value on press | Value on release | Sends CC = Data 2 on press, CC = Data 3 on release |
| `47` | CC Toggle | Controller | Value 1 | Value 2 | Sends Value 1, unless that controller already holds Value 1, in which case it sends Value 2 (see below) |
| `48` | CC Step | Controller | Start | End | Each press sends the next value from Start to End, then wraps to Start |
| `43` | Note | Note | Velocity | – | Note on while held, note off on release |
| `44` | Note Toggle | Note | Velocity | – | First press note on, next press note off |
| `45` | Program + Bank | Program | Bank LSB | Bank MSB | Sends Program Change; if either bank byte is non-zero, sends CC32 = LSB and CC0 = MSB first |
| `46` | Program Step | – | Start | End | Each press sends the next program from Start to End, then wraps |
| `57` | NRPN Coarse | Value | NRPN LSB | NRPN MSB | Sends CC99 = MSB, CC98 = LSB, CC6 = Value |
| `58` | NRPN Fine | Value | NRPN LSB | NRPN MSB | Sends CC99 = MSB, CC98 = LSB, CC38 = Value |
| `55` | MMC | Device ID | Command | – | Sends a MIDI Machine Control command (SysEx) |
| `59` | Relay | Mode | Relay | – | Operates relay output Relay + 1 (0–3 → relays 1–4) |
| `62` | Preset Select | Target | – | – | Changes preset (see [below](#changing-preset-preset-select-and-incdec)). Sends nothing on MIDI |
| `56` | Preset Inc/Dec | Direction | – | – | Next (`00`) or previous (`01`) preset. Sends nothing on MIDI |
| `63` | Step Select | – | – | – | Chooses the step of a switch in External step select mode (targeting not documented here) |
| `64` | Step Inc/Dec | – | – | – | Moves that step up or down (targeting not documented here) |

Notes:

- **CC Toggle follows the controller, not the switch.** The Pacer remembers
  the last value it sent on each controller (per channel), and a toggle press
  compares against that: "send Value 1 unless the controller already holds
  Value 1". So every switch toggling the same CC shares one state, across
  presets. Nothing sent yet counts as 0. Confirmed on hardware.
- **Note Toggle** works the same way, following whether the note is sounding.
- **MMC** commands are the standard MIDI Machine Control ones. The factory set
  uses Device ID `7F` (all devices) with commands `01` Stop, `02` Play,
  `04` Fast Forward, `05` Rewind and `06` Record.
- **Program Step and CC Step** advance by one per press. The direction and
  step size are this project's understanding, not confirmed on hardware.
- **Relay** modes: the factory set uses Mode `03` on all four relays; other
  values aren't documented here.
- MIDI values are 0–127 throughout (notes, programs, controllers, velocities).

## Changing Preset: Preset Select and Inc/Dec

This is how a switch moves to another preset, and so it's also how a set of
presets ends up being a state machine.

**Preset Select (`62`).** Data 1 is the target:

| Target | Goes to |
|---|---|
| `00` | The current preset (a reload) |
| `01` | The firmware's Track preset (DAW control) |
| `02` | The firmware's Transport preset (DAW control) |
| `03`–`1A` | A1–D6 |

**For a user preset, target = `idx` + 2.** So A1 is `03` and C1 is `0F`.

**Preset Inc/Dec (`56`).** Data 1 is `00` for next and `01` for previous. It
wraps around: next from D6 is A1.

Both happen immediately and **send nothing on MIDI**: connected gear never sees
them. Other steps on the same switch still send their messages, so one press
can send a Program Change and change preset, as in "turn the looper on and go
to the looper preset".

**Only the first jump on a press happens.** In All-at-once mode, if a switch
has several active steps that change preset, the first one wins and the rest
are ignored. A jump placed after another one never fires.

The factory set uses these on every preset: A selects Track, B selects
Transport, C steps to the previous preset and D to the next.

## Control Modes: What a Press Fires

- **All at once (`00`).** A press fires every active step, in step order.
  Steps with a release action (CC Trigger, Note) act again on release.
- **Sequence (`01`).** Each press fires the *next* active step, wrapping
  after the last one. Inactive steps are skipped; active steps of type Off
  take their turn and send nothing. Confirmed on hardware.
- **External step select (`02`).** The step that fires is chosen by another
  switch's Step Select / Step Inc/Dec step.

## Lights

Stompswitches (1–6 and A–D) have lights; footswitches and pedals don't.

### Which Lights a Switch Has

| Switch | Top light | Middle light | Bar |
|---|---|---|---|
| 1–6 (front row) | Text legend | Icon legend | Colour bar |
| A–D (back row) | – | Printed legend | Colour bar |

Every light is full-colour, legends included. A step's *which light* field
(`00`/`01` the bar, `02` the middle light, `03` the top light) picks where its
colour shows; `03` does nothing on A–D. Confirmed on hardware.

### One Light at a Time: The Step That Fires Next

**A switch lights one step's colour at a time: the step that will fire
next.** In All-at-once mode that's always step 1. Every step fires, but a
second step's light setting never shows. In Sequence mode it follows
the sequence. Confirmed on hardware.

### Which of the Two Colours Shows

The first colour shows while the step is "on", the second otherwise. What
"on" means depends on the type:

| Type | Shows the first colour while… |
|---|---|
| CC Trigger, CC Toggle | the controller holds the step's Data 2 (Value on press / Value 1) |
| Note, Note Toggle | the note is sounding |
| Program + Bank | the channel's current program (and bank, if the step sends one) is the step's |
| Preset Select to a user preset | always |
| Preset Select to Track / Transport | that DAW preset is active (lit light blue); dark otherwise |
| Preset Inc/Dec | never; these switches stay dark |
| Other types | the switch is held |

"Holds" refers to the values the Pacer remembers sending, which survive
preset changes. So a switch that sent Program 5 on one preset still shows its
first colour after you come back, if nothing changed the program meanwhile.

### MIDI Feedback

With MIDI feedback on (`01`), the light follows the step's CC **received over
USB MIDI** instead of what the switch sends: CC = Data 2 shows the first
colour, anything else the second. The switch's own presses stop moving the
light. It only works for CC steps, and only over USB, because the Pacer's one
DIN socket is MIDI out. Confirmed on hardware.

### Colour Codes

| Code | Colour | | Code | Colour |
|---|---|---|---|---|
| `00` | Off | | `7F` | Default (see below) |
| `01` | Pink | | `02` | Dim pink |
| `03` | Red | | `04` | Dim red |
| `05` | Orange | | `06` | Dim orange |
| `07` | Amber | | `08` | Dim amber |
| `09` | Yellow | | `0A` | Dim yellow |
| `0B` | Lime | | `0C` | Dim lime |
| `0D` | Green | | `0E` | Dim green |
| `0F` | Teal | | `10` | Dim teal |
| `11` | Blue | | `12` | Dim blue |
| `13` | Lavender | | `14` | Dim lavender |
| `15` | Purple | | `16` | Dim purple |
| `17` | White | | `18` | Dim white |

In general, for hue number *h* (1–12 in the order above), bright is
`2h − 1` and dim is `2h`. The names are only conventions (to some eyes "amber"
looks yellow and "yellow" looks lime), but the codes are what the device
uses.

**Default (`7F`)** means the message type's own colour: the bright version
when the step is on, the dim version when it's off.

| Type | Default colour |
|---|---|
| Step Select, Step Inc/Dec | Pink |
| Preset Select, Preset Inc/Dec | Red |
| Program + Bank, Program Step | Orange |
| MMC | Yellow |
| Note, Note Toggle | Green |
| CC Trigger, CC Toggle, CC Step | Blue |
| Relay | Lavender |
| NRPN Coarse, NRPN Fine | Purple |

## Expression Pedals

Expression pedal steps (`obj` `36`, `37`) use their own type codes:

| Type | Name | Data 1 | Data 2 | Data 3 | What it sends |
|---|---|---|---|---|---|
| `61` | Off | – | – | – | Nothing |
| `00` | MIDI CC | Controller | Minimum | Maximum | CC, swept from Minimum (heel) to Maximum (toe) |
| `01` | Pitch Bend | – | Minimum | Maximum | Pitch bend, swept between the two |
| `02` | Channel Aftertouch | – | Minimum | Maximum | Channel pressure, swept between the two |
| `03` | NRPN Coarse | Maximum | NRPN LSB | NRPN MSB | NRPN, coarse |
| `04` | NRPN Fine | Maximum | NRPN LSB | NRPN MSB | NRPN, fine |

Pitch bend is 14-bit but the range is stored as 7-bit values: the Pacer sends
the 7-bit value as the most significant byte with a zero least significant
byte, except at 127, where it sends the full 16383. Confirmed on hardware.

## MIDI Sent When a Preset Loads

Each preset has sixteen messages it sends whenever it's recalled (`obj` `7E`).
Message *n* (1–16) occupies five elements starting at `base = (n − 1) × 6 + 1`,
sent together. The blocks are six elements apart, like a step's, but the sixth
element of each block isn't used:

| Element | Field |
|---|---|
| base + 0 | Channel (`00` = global, `01`–`10` = channels 1–16) |
| base + 1 | Message type |
| base + 2 | Data 1 |
| base + 3 | Data 2 |
| base + 4 | Data 3 |

There's no active flag: an unused message has type Off. Note these types and
data layouts differ from a step's:

| Type | Name | Data 1 | Data 2 | Data 3 |
|---|---|---|---|---|
| `61` | Off | – | – | – |
| `65` | CC | Controller | Value | – |
| `43` | Note | Note | Velocity | – |
| `45` | Program + Bank | Program | Bank LSB | Bank MSB |
| `57` | NRPN Coarse | Value | LSB | MSB |
| `58` | NRPN Fine | Value | LSB | MSB |
| `55` | MMC | Device ID | Command | – |
| `59` | Relay | Mode | Relay | – |

MMC and Relay don't use the channel.

## The Current Slot

Slot `00` is the device's **working copy of whichever preset is loaded**. It
isn't a preset you can select; it's what the switches are actually running.

- **Writing a preset's own slot doesn't change what's loaded.** If you send
  new contents to A1 while A1 is loaded, nothing changes until A1 is
  reloaded, or until the same contents are also written to slot `00`.
- **Writing slot `00` takes effect immediately**, and touches nothing else.
- Edits made on the Pacer's own front panel go to slot `00` too, and only reach
  a preset's slot through the device's Save.
- In a dump, slot `00` is a duplicate of the loaded preset. Treat it as such:
  when you change a preset, you don't need to change slot `00` unless you
  want the change to take effect without reloading.

## Global Settings

Messages with `tgt` = `05` are global settings: `idx` `00` is the current
global state and `01`–`04` are the four global configurations. They use the
same field encoding. **This page doesn't document them; leave them exactly as
they are.**

One field matters to presets: the **global MIDI channel**, used by any step
with channel `00`. It's at `obj` `01`, `elm` `01` in the active global
configuration (which one is active is `obj` `01`, `elm` `31` of `idx` `00`).
The factory value is channel 1.

## Reading from a Pacer

| Request | Bytes | Reply |
|---|---|---|
| Full dump | `F0 00 01 77 7F 02 7F 7F F7` | The whole configuration as Set messages (4,762 of them) |
| Global settings only | `F0 00 01 77 7F 02 05 00 7F 7A F7` | Every global message, in about 60 ms |
| Device identity | `F0 7E 7F 06 01 F7` | The standard MIDI identity reply: Nektar, family 9319, model 8273, version "0101" |

There's no end marker on a full dump: it's complete when the messages stop.

## Writing a Dump Safely

Whether you're a person with a hex editor or an AI with a script:

1. **Recompute every checksum** you touch: `(128 − (sum of cmd…last field byte)
   mod 128) mod 128`.
2. **Change only what you were asked to change.** Leave other presets, the
   global settings and the Current slot byte-identical.
3. **Never delete a field to clear it. Set it to Off instead.** The device keeps
   whatever a message doesn't address. To empty a step, write its message
   with type `61` (and Active `00`, except for step 1). To empty a light, write
   colours `00`.
4. **Keep fixed groups whole:** a step's six fields, a light's four, a preset
   message's five, each in its own message, in element order, with a `00`
   after every field but the last.
5. **Use Preset Select to jump to a preset**, with target = `idx` + 2, and put
   it on the first jumping step of the switch, since later ones never fire.
6. **Keep values 7-bit** (0–127) everywhere between `F0` and `F7`.
7. **Check your output**: split it into messages, confirm every checksum, and
   confirm the message count still adds up (189 per preset slot). Then list
   exactly which presets and fields changed, compared with the original.

A correct preset written in full is 189 messages. Writing fewer is fine for
changing a few fields of a preset that's already there: the Pacer sets what
each message addresses and keeps everything else, and Pacer Programmer's
**Pick presets from a file…** reads a file the same way. So a file can hold just the
presets you changed. A file that's meant to be opened as a whole configuration
by itself needs every message.

## Sending to a Pacer

- Send messages one at a time, about **10 ms apart**.
- **After writing, wait at least a second before asking the Pacer for
  anything.** Requesting a dump within about 200 ms of preset writes makes it
  drop the writes and fill the written preset with another preset's
  contents, which corrupts the preset. With 300 ms or more, writes land
  reliably. Confirmed on hardware.
- To make a change to the loaded preset take effect at once, also write it to
  slot `00` (see [The Current slot](#the-current-slot)).

## Worked Examples

All from a factory dump, preset A1 (`idx` `01`).

**The name**, "PRGM1":

```
F0 00 01 77 7F  01 01 01  01   01 05 50 52 47 4D 31   0F  F7
                Set Preset A1  Name: elm 01, len 5, "PRGM1"  checksum
```

**Stompswitch 1's control mode**, All at once:

```
F0 00 01 77 7F  01 01 01 0D   60 01 00   0F  F7
                         Stomp 1  elm 60 (mode), len 1, 00
```

**Stompswitch 1, step 1**, an active Program Change 0 on the global channel:

```
F0 00 01 77 7F  01 01 01 0D
  01 01 00 00     channel 00 (global)
  02 01 45 00     type 45 (Program + Bank)
  03 01 00 00     data 1: program 0
  04 01 00 00     data 2: bank LSB 0
  05 01 00 00     data 3: bank MSB 0
  06 01 01        active
  0F  F7
```

**Stompswitch 1, step 2**, unused, so type Off and inactive (elements `07`–`0C`):

```
F0 00 01 77 7F  01 01 01 0D  07 01 00 00  08 01 61 00  09 01 00 00  0A 01 00 00  0B 01 00 00  0C 01 00  50 F7
```

**Stompswitch 1, step 1's light**, with no MIDI feedback and Default colours,
on the bar:

```
F0 00 01 77 7F  01 01 01 0D  40 01 00 00  41 01 7F 00  42 01 7F 00  43 01 00  68 F7
```

**Preset MIDI message 1**, unused (type Off):

```
F0 00 01 77 7F  01 01 01 7E  01 01 00 00  02 01 61 00  03 01 00 00  04 01 00 00  05 01 00  0A F7
```

**A jump to C1 on stompswitch A, step 1**: Preset Select, target `0F`
(C1 is `idx` `0D`, + 2):

```
F0 00 01 77 7F  01 01 01 14  01 01 00 00  02 01 62 00  03 01 0F 00  04 01 00 00  05 01 00 00  06 01 01  5C F7
```

## What Isn't Known

- **Relay modes** beyond the factory set's `03`.
- **Step Select / Step Inc/Dec targeting**, meaning how they name the switch
  they drive.
- **Global settings**, beyond the global channel and which preset is loaded.
- **The DAW (Track/Transport) presets' command bytes.**
- **Program Step and CC Step's direction and increment**, which this page
  describes as one step up per press, wrapping.
