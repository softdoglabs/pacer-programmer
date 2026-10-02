# 1. A looper preset

We'll turn C1 into a preset that drives the Quad Cortex's looper, and make
switch A on A1 lead to it and back. By the end, the map shows the two presets
and the switch that connects them.

Start from the factory defaults: open the
[device drawer](../reference/devices-and-files.md#the-device-drawer) and click
**Factory defaults**.

## Make room in C1

1. Switch to **Program**.
2. Click the badge on the display's lower half and choose **C1**.
3. Below the faceplate, click **Clear preset…** and confirm. C1 is now
   `EMPTY`: every switch does nothing.
4. Tap the small pencil next to `EMPTY` on the display, type `LOOPR`, and
   press Enter.

## Put the looper on the switches

Tap switch **1**. In the editor:

1. Set the step type to **CC Trigger**: it sends one value when you press and
   another when you let go, which is what a looper's buttons expect.
2. **CC#** `53`, **Press** `127`, **Release** `0`. Leave the channel on
   *Global*.
3. Colours: **2A Red** while CC 53 = 127, **2B Dim Red** otherwise. The switch
   will glow dim red, and flash bright while you press it.

![Switch 1 on LOOPR: CC 53, red](../images/t1-loopr-switch-1.png)

Press the live switch at the right to try it: the log shows CC 53 = 127, then
CC 53 = 0.

Now the rest, using the switch picker at the top to move between them:

| Switch | CC | Colours |
|---|---|---|
| 1 | 53 | 2A Red / 2B Dim Red |
| 2 | 54 | 7A Green / 7B Dim Green |
| 3 | 56 | 4A Amber / 4B Dim Amber |
| 4 | 51 | 9A Blue / 9B Dim Blue |
| 5 | 55 | 11A Purple / 11B Dim Purple |
| 6 | 49 | 8A Teal / 8B Dim Teal |
| B | 52 | 3A Orange / 3B Dim Orange |

These are the CCs the author's Quad Cortex uses for its looper functions.
Check them against the MIDI chart for your own unit and firmware, and give
each function the switch you'd want under your foot.

## The way back

Tap switch **A**. Set its step to **Preset Select**, **Jump to** `A1`, and
its colour to **12A White**. Pressing A on LOOPR now goes back to A1.

## The way in

Choose **A1** (the breadcrumb at the top of the editor is the same chooser)
and tap its switch **A**. In the factory set it's already a Preset Select —
to the firmware's Track preset. Change **Jump to** to `C1`, and its colour to
**12A White**:

![A1's switch A, now jumping to C1](../images/t1-a1-switch-a.png)

## Try it

Close the editor and switch to **Simulate**. On A1, press **A**: the display
reads `LOOPR`, and the looper's switches glow in their colours.

![LOOPR in the simulator](../images/t1-loopr-faceplate.png)

Press a few switches and watch the log — or your looper, if you've chosen a
simulated MIDI output. Press **A** to go back to A1.

## On the map

Switch to **Preset map**:

![A1 and LOOPR, each leading to the other on A](../images/t1-map.png)

Two presets, and switch A leading each way. Every other factory preset stands
alone, because their only routes are next/previous stepping, which the map
leaves out.

Notice that LOOPR's A is drawn as *going to A1*, not as *going back*. With
only one way in, the two mean the same thing, and the Pacer's configuration
can't say which you meant. The [next tutorial](2-a-second-way-in.md) is the
moment it has to.

**Save…** now if you want to keep this.
