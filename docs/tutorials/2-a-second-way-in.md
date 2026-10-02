# 2. A second way in

Now say you'd like the looper from A2 as well. Pressing A on A2 should open
it, and pressing A on the looper should bring you back to A2, not to A1.

The Pacer can't do that with one preset. Switch A on a preset jumps to one
fixed place, and nothing on the Pacer remembers where you came from. The usual
fix is a second copy of the looper whose A goes back to A2, and then keeping
the two copies identical by hand from then on. Here, the map does that for
you.

This picks up where [tutorial 1](1-a-looper-preset.md) left off.

## Free up a slot

The copy needs a preset of its own, and the Pacer doesn't have any empty ones.
In **Program**, choose **D6** and click **Clear preset…**. D6 is now `EMPTY`,
and the map will offer it when it needs a slot.

## Draw the route

1. Switch to **Preset map**.
2. Drag from the dot on the right edge of **PRGM2** to **LOOPR**, and let go.
   The route dialog opens.
3. For **On switch**, choose **A — selects the Track preset**, and tick
   **Replace what A does**. That way A2's switch A stops selecting Track and
   only goes to the looper.
4. Now the dialog asks the question tutorial 1 left open: does leaving LOOPR
   mean going back where you came from, or always going to A1? Choose
   **Comes back here**.
5. Coming back costs a preset, so it asks where to put the copy. Choose
   **D6 EMPTY**.

![The route dialog: switch A, comes back, copy in D6](../images/t2-route.png)

Click **Add route**.

## One state, two presets

![PRGM1 and PRGM2 both lead to LOOPR, which returns](../images/t2-map.png)

LOOPR is still a single box, labelled **2 presets · one state**, and it's
marked **↩ A returns**, which means its switch A takes you back to wherever you
came from. Click it to see what it's made of:

![LOOPR's two presets](../images/t2-details.png)

C1 is entered from A1, and D6 from A2. The two are identical except for switch
A, which on each copy leads back to its own origin.

## Try it

In **Simulate**, choose A2 and press **A**. The display shows `LOOPR`, and
you're on D6. Press **A** again and you're back on A2. From A1 you get C1, and
it takes you back to A1.

## More ways in

Every new way into a state that returns costs one more copy, and so one more
slot. Twelve main presets that each open the looper would need twelve copies,
and twelve mains plus twelve copies fills all 24 slots. The map works out the cost before it writes
anything, asks you for a slot each time, and won't build a design that doesn't
fit. See [Slot budget](../reference/preset-map.md#slot-budget).

If a destination really should be fixed, like a tuner that always goes back to
A1, choose **Always goes to A1** instead and it stays one preset.
