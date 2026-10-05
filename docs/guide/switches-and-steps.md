# Switches and Steps

Every programmable control has six steps, plus a control mode that decides
which of them a press fires.

## Steps

A step is one action: send a program change, send a CC, play a note, jump to
another preset, flip a relay. Each step is either active or not. **+ Add step**
turns on the next one, and **✕** turns it off again. Its settings are kept, so
adding it back brings them back.

The steps on a switch don't have to be the same kind of thing. One switch can
send a program change to your amp, a CC to your delay, and jump to another
preset, all on one press.

## Control Modes

### All at Once

Every active step fires, in order, each time you press. This is the default,
and it's what you want most of the time.

> **Example: change patch and go to its preset.** Step 1 is *Program + Bank*,
> program 12. Step 2 is *Preset Select*, B1. One press sends PC 12 and moves
> the Pacer to B1.

Only the first preset change on a press counts. If you put two Preset Select
steps on the same press, the second one is ignored, both by the Pacer and by
the simulator.

### Sequence

Each press fires the next active step, and it wraps around after the last one.

> **Example: tap through three patches.** Steps 1 to 3 are *Program + Bank*,
> with programs 1, 2 and 3. Press once for patch 1, again for patch 2, again
> for 3, and the fourth press is patch 1 again.

Inactive steps are skipped. A step whose type is *Off* still takes its turn
and just sends nothing, which is a handy way to get a press that does nothing
in the middle of a sequence.

The light follows along: it shows the colours of whichever step fires next.

### External Step

The switch fires whichever step another switch has picked, using a *Step
Select* or *Step Inc/Dec* step. The simulator doesn't follow this between
switches yet.

## Toggles Share Their State

A CC Toggle sends its first value, or its second value if the controller
already holds the first. "Holds" here means the Pacer's memory of the last
value it sent on that CC, from any switch on any preset. So two switches that
toggle the same CC stay in step. Press one, and the other's next press sends
the opposite value, and both lights agree.

That's usually what you want, since a delay that's on is on no matter which
switch turned it on. If it isn't, use different CCs, or use CC Trigger, which
always sends the same values.

## Momentary or Latching

CC Trigger sends one value when you press and another when you let go, so
it's momentary. CC Toggle alternates on each press, so it latches. Likewise,
Note sounds while you hold the switch down, and Note Toggle starts on one press
and stops on the next.

## Expression Pedals

Pedals have steps too, but you sweep them instead of pressing them. A pedal
step sends a continuous message (a CC, pitch bend, aftertouch or NRPN) between
a minimum and a maximum as the pedal moves. In the simulator, drag the pedal's
slider from heel to toe.

## External Footswitches

Footswitches 1 to 4 plug into the back, and you program them just like the
stompswitches. They just don't have any lights.
