# MIDI sent when a preset loads

Each preset can send up to sixteen messages the moment it loads, before you
press anything. That's how you put your rig in the state the preset expects.
For example, you might send a program change to load the matching patch on your
modeller, or a few CCs to turn effects on or off.

You'll find them in Program mode, under the faceplate:

![MIDI sent on load](../images/preset-panel.png)

**+ Add message** adds one. Each message has a type, a channel and values, like
a step does, with one difference worth knowing about: a preset's CC has a
single value, while a switch's CC Toggle has two.

## When they're sent

They go out whenever the preset is recalled. That includes a switch that jumps
or steps to it, the firmware's preset select, and choosing it in the app's
preset chooser or on the map. Opening a configuration doesn't count, so
nothing is sent when you load a file.

## They light switches too

Load-time messages update the Pacer's memory like any other message, and the
switches light to match. If a preset sends PC 5 on load, and switch 2 sends
PC 5 on the same channel, switch 2 is showing its "on" colour as soon as you
arrive.
