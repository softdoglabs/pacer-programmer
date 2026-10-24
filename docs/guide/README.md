# Pacer Programmer Guide

Pacer Programmer is a browser-based editor for the Nektar Pacer MIDI foot
controller. It's built around two ideas.

The first is that you should be able to see what a change does before you
send it. Programming my Pacer used to mean guessing at what a preset would
do, sending it to the device, stomping on switches to find out, and doing it
all again. Here you program on screen, press the switches on screen, and your
real gear responds to real MIDI. The Pacer only gets sent anything once it's
right.

![The simulator playing a looper preset, its MIDI going to a Quad Cortex](../images/simulator.png)

In the picture it's driving a Quad Cortex's looper. The lights and the display
are what the Pacer itself would show, since the simulator runs your
configuration the way the Pacer's firmware does, and the log at the bottom
lists every message that went out.

The second idea is a little more unusual. The Pacer can't remember anything,
so if you want a switch that means "go back to wherever I came from," you end
up building copies of presets by hand and keeping them in sync forever. The
[preset map](../reference/preset-map.md) finds those copies in your
configuration, shows them as the one thing you actually designed, and keeps
them in step when you change it. [Why a state machine](../why-a-state-machine.md)
explains the problem in more detail.

There's no project file. The app reads and writes the Pacer's own `.syx` dump,
and the format is [documented](../reference/programming-the-pacer.md) well
enough that you (or an AI) can read and write it too.

It runs in your browser at
[pacer-programmer.softdoglabs.com](https://pacer-programmer.softdoglabs.com),
with nothing to install. You only need MIDI to reach real gear and the Pacer,
and for that your browser has to support Web MIDI with SysEx. Everything else
works without it.

## About This Guide

These are short pages on how to get things done. Each one links to the
[reference](../reference/README.md) for the details, and the
[tutorials](../tutorials/README.md) put them together to build a looper from
the factory defaults.

Start with [The simulator](the-simulator.md), which plays your configuration on
screen and can drive your real rig, no Pacer needed. Then
[Editing a preset](editing-a-preset.md) covers changing what a switch does,
trying it, and keeping it.

For programming in more depth:

- [Switches and Steps](switches-and-steps.md): steps, control modes, toggles
  and pedals.
- [Lights and Colours](lights-and-colours.md): which light shows, and when
  each colour shows.
- [MIDI Sent When a Preset Loads](preset-midi-on-load.md): setting up your rig
  the moment a preset is chosen.
- [Saving and Sending](saving-and-sending.md): snapshots, and writing to the
  Pacer.
- [Browsers and Installing](browsers-and-installing.md): which browsers can
  talk MIDI, which keep what you save, and installing the app.

And for going further, [Working with an AI](working-with-ai.md) shows how to
have an assistant make large changes to your `.syx` and then try them here.
[Why a state machine](../why-a-state-machine.md) and the
[tutorials](../tutorials/README.md) are about designing how your presets lead
to one another.

## Not Affiliated with Nektar

Pacer Programmer is an independent project. It isn't affiliated with,
endorsed by, or supported by Nektar Technology. Nektar and Pacer are
trademarks of their owner, and other product names mentioned here, such as
Quad Cortex, belong to their respective owners. Please don't contact Nektar
for help with this app.
