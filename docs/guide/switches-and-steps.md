# Switches and steps

Every programmable control has **six steps** and a **control mode** that
decides which of them a press fires.

## Steps

A step is one action: send a program change, send a CC, play a note, jump to
another preset, switch a relay. A step is either active or not; **+ Add step**
activates the next one, and **✕** deactivates it again (its settings are kept,
so adding it back restores them).

A switch's steps don't have to be the same kind. One switch can send a program
change to your amp, a CC to your delay, and jump to another preset — all in
one press.

## Control modes

### All at once

Every active step fires, in order, on each press. This is the default, and
what you want most of the time.

> **Example: change patch and go to its preset.** Step 1: *Program + Bank*,
> program 12. Step 2: *Preset Select*, B1. One press sends PC 12 and moves the
> Pacer to B1.

Only the first preset change on a press counts: a second Preset Select on the
same press is ignored, by the Pacer and by the simulator.

### Sequence

Each press fires the *next* active step, wrapping round after the last.

> **Example: tap through three patches.** Steps 1–3: *Program + Bank*, with
> programs 1, 2 and 3. Press once for patch 1, again for patch 2, again for 3,
> and the fourth press is patch 1 again.

An inactive step is skipped. A step of type *Off* still takes its turn and
sends nothing — a way to make a press that does nothing in the middle of a
sequence.

The light follows the sequence: it shows the colours of the step that will
fire next.

### External step

The switch fires whichever step another switch has chosen, with a *Step
Select* or *Step Inc/Dec* step. The simulator doesn't follow this between
switches yet.

## Toggles share their state

A CC Toggle sends its first value, or its second if the controller already
holds the first. "Holds" is the Pacer's memory of the last value sent on that
CC — from **any** switch, on any preset. So two switches toggling the same CC
stay in step: press one and the other's next press sends the opposite value,
and both lights agree.

This is usually what you want (a delay that's on is on, whichever switch
turned it on). If it isn't, use different CCs, or CC Trigger, which always
sends the same value.

## Momentary or latching

- **CC Trigger** sends one value on press and another on release: momentary.
- **CC Toggle** alternates on each press: latching.
- **Note** sounds while you hold the switch; **Note Toggle** starts on one
  press and stops on the next.

## Expression pedals

Pedals have steps too, but they're swept rather than pressed: a pedal step
sends a continuous message — a CC, pitch bend, aftertouch or NRPN — between a
minimum and a maximum as the pedal moves. In the simulator, drag its slider
from heel to toe.

## External footswitches

Footswitches 1–4, plugged into the back, are programmed like any stompswitch,
except they have no lights.
