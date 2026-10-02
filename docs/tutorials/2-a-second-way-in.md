# 2. A second way in

You'd like the looper from A2 as well. Pressing A on A2 should open it, and
pressing A on the looper should bring you back **to A2** — not to A1.

The Pacer can't do that with one preset. A preset's switch A jumps to one
fixed place; nothing on the Pacer remembers where you came from. The usual
fix is a second copy of the looper whose A goes back to A2 — and keeping two
copies identical by hand from then on. Here, the map does it.

Carry on from [tutorial 1](1-a-looper-preset.md).

## Free a slot

The copy needs a preset of its own, and the Pacer has no empty ones. In
**Program**, choose **D6** and click **Clear preset…**. D6 is now `EMPTY`,
and the map will offer it.

## Draw the route

1. Switch to **Preset map**.
2. Drag from the dot on **PRGM2**'s right edge to **LOOPR**, and let go. The
   route dialog opens.
3. **On switch**: choose **A — selects the Track preset**, and tick
   **Replace what A does**, so A2's switch A stops selecting Track and only
   goes to the looper.
4. The dialog now asks the question tutorial 1 left open: does leaving LOOPR
   mean *back where I came from*, or *always A1*? Choose **Comes back here**.
5. Coming back costs a preset, so it asks where the copy goes: **D6 EMPTY**.

![The route dialog: switch A, comes back, copy in D6](../images/t2-route.png)

Click **Add route**.

## One state, two presets

![PRGM1 and PRGM2 both lead to LOOPR, which returns](../images/t2-map.png)

LOOPR is still one box — **2 presets · one state** — and it's marked
**↩ A returns**: its switch A goes back to wherever you came from. Click it
to see what it's made of:

![LOOPR's two presets](../images/t2-details.png)

C1 is entered from A1, D6 from A2. They're identical except for switch A,
which on each copy leads back to its own origin.

## Try it

In **Simulate**, choose A2 and press **A**: the display shows `LOOPR` — you're
on D6. Press **A** again and you're back on A2. From A1 you get C1, and back
to A1.

## More ways in

Each new way in to a state that returns is one more copy, and one more slot.
Twelve main presets each opening the looper would be twelve copies: the whole
Pacer. The map works the cost out before it writes anything, asks you for a
slot each time, and won't make a design the Pacer can't hold. See
[Slot budget](../reference/preset-map.md#slot-budget).

If a destination really should be fixed — a tuner that always returns to
A1, say — choose **Always goes to A1** instead, and it stays one preset.
