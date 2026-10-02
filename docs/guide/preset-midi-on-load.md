# MIDI sent when a preset loads

Each preset can send up to sixteen messages the moment it's loaded, before
you press anything. Use them to put your rig in the state the preset expects:

- a program change to load the matching patch on your modeller;
- CCs to set effects on or off, or a level;
- a note, or a relay to switch an amp channel.

They're in Program mode, below the faceplate:

![MIDI sent on load](../images/preset-panel.png)

**+ Add message** adds one, and each has a type, channel and values like a
step's. Note one difference: a preset's CC has a single value, where a
switch's CC Toggle has two.

## When they're sent

Whenever the preset is recalled: by a switch that jumps or steps to it, by
the firmware's preset select, or from the app's preset chooser and map. Not
when a configuration is opened.

## They light switches too

Load-time messages update the Pacer's memory like any other, so the switches
light accordingly. If a preset sends PC 5 on load and switch 2 sends PC 5 on the
same channel, the moment you arrive switch 2 shows its "on" colour.
