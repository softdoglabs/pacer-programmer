# Lights and colours

Every switch on the Pacer has a colour bar, and the front-row switches have
two legends above it — every one a full-colour light. You choose, per step,
which light it uses and what colours it shows.

![One switch's lights](../images/switch-anatomy.png)

## One light at a time

A switch shows **one step's colours** — the step that will fire next. With
*All at once* that's always step 1, so give step 1 the colours you want to
see; the other steps' colours never show. With *Sequence*, the light moves
through the steps as you press.

Each step's card in the editor says whether its colours will show, and the one
that lights the switch is badged **lights the switch**.

## Two colours, chosen by state

Each step has two colours, and which shows depends on what the step last did:

| Step type | First colour | Second colour |
|---|---|---|
| CC Toggle, CC Trigger | while the CC holds the step's first value | otherwise |
| Note, Note Toggle | while the note is on | otherwise |
| Program + Bank | while this program is the current one on its channel | otherwise |
| Preset Select | always | — |
| Preset Inc/Dec | the light stays dark | — |

So a CC Toggle with green and red is green while its effect is on and red
while it's off — and stays that way when you change preset and come back,
because the Pacer remembers the CC's value.

## Default, Off and the palette

![The colour picker](../images/colour-picker.png)

- Twelve hues, each **bright** or **dim**. A common choice is the same hue
  twice: bright for on, dim for off.
- **Default** — the step type's own colour: orange for programs, blue for
  CCs, green for notes, red for preset changes. Bright when on, dim when off.
  Most factory presets use it.
- **Off** — dark.

## Which light

*Light* chooses the bar, the icon legend or the text legend. A legend lit by
a step takes the step's colour, not the colour it's printed in.

The firmware also lights legends by itself, to show an assigned function: the
arrows on C and D while they step through presets, *Track* on A while A
selects the Track preset, and so on.

## Lit by incoming MIDI

Setting *Lit by* to **Incoming MIDI** hands a CC step's light to whatever
sends that CC back to the Pacer over USB — typically a DAW. Pressing the
switch then no longer changes the light. It only works over USB (the Pacer
has no MIDI In jack) and only for CC steps. See
[Program mode](../reference/program-mode.md#lit-by-incoming-midi).

The full rules, as the Pacer applies them, are in
[Programming the Pacer › Lights](../reference/programming-the-pacer.md#lights).
