# Pacer Programmer

Pacer Programmer is a browser-based editor for the Nektar Pacer MIDI foot
controller. It's built around two ideas.

The first is that you should be able to see what a change does before you
send it. Programming my Pacer used to mean guessing at what a preset would
do, sending it to the device, stomping on switches to find out, and doing it
all again. Here you program on screen, press the switches on screen, and your
real gear responds to real MIDI. The Pacer only gets sent anything once it's
right.

![The simulator playing a looper preset, its MIDI going to a Quad Cortex](images/simulator.png)

In the picture it's driving a Quad Cortex's looper. The lights and the display
are what the Pacer itself would show, since the simulator runs your
configuration the way the Pacer's firmware does, and the log at the bottom
lists every message that went out.

The second idea is a little more unusual. The Pacer can't remember anything,
so if you want a switch that means "go back to wherever I came from," you end
up building copies of presets by hand and keeping them in sync forever. The
[preset map](reference/preset-map.md) finds those copies in your configuration,
shows them as the one thing you actually designed, and keeps them in step when
you change it. [Why a state machine](why-a-state-machine.md) explains the
problem in more detail.

There's no project file. The app reads and writes the Pacer's own `.syx` dump,
and the format is [documented](reference/programming-the-pacer.md) well enough
that you (or an AI) can read and write it too.

It runs in your browser at
[pacer-programmer.softdoglabs.com](https://pacer-programmer.softdoglabs.com),
with nothing to install. You only need MIDI to reach real gear and the Pacer,
and for that your browser has to support Web MIDI with SysEx. Everything else
works without it.

## Where to Start

If you're new, read [The simulator](guide/the-simulator.md) and then
[Editing a preset](guide/editing-a-preset.md). The [tutorials](tutorials/README.md)
build a looper from the factory defaults, one step at a time. When you need to
look something up, the [reference](reference/README.md) covers every control and every
message the app shows. And if you'd rather have an assistant do the tedious
part, see [Working with an AI](guide/working-with-ai.md).

## Contents

[Guide](guide/README.md): how to get things done

- [The Simulator](guide/the-simulator.md)
- [Editing a Preset](guide/editing-a-preset.md)
- [Switches and Steps](guide/switches-and-steps.md)
- [Lights and Colors](guide/lights-and-colors.md)
- [MIDI Sent When a Preset Loads](guide/preset-midi-on-load.md)
- [Saving and Sending](guide/saving-and-sending.md)
- [Working with an AI](guide/working-with-ai.md)
- [Browsers and Installing](guide/browsers-and-installing.md)

[Tutorials](tutorials/README.md): a looper, step by step

1. [A Looper Preset](tutorials/1-a-looper-preset.md)
2. [A Second Way In](tutorials/2-a-second-way-in.md)
3. [Changing the Looper](tutorials/3-changing-the-looper.md)
4. [Letting an AI Build It](tutorials/4-letting-an-ai-build-it.md)

[Reference](reference/README.md): the manual

- [The Window](reference/the-window.md)
- [The Faceplate](reference/the-faceplate.md)
- [Simulate Mode](reference/simulate-mode.md)
- [Program Mode](reference/program-mode.md)
- [The Preset Map](reference/preset-map.md)
- [Devices and Files](reference/devices-and-files.md)
- [Programming the Pacer](reference/programming-the-pacer.md)
- [Troubleshooting](reference/troubleshooting.md)
- [Glossary](reference/glossary.md)

[Why a State Machine](why-a-state-machine.md): the problem the preset map
solves.

[License](license.md): what you can do with the app, and where its source is.

## Not Affiliated with Nektar

Pacer Programmer is an independent project. It isn't affiliated with,
endorsed by, or supported by Nektar Technology. Nektar and Pacer are
trademarks of their owner, and other product names mentioned here, such as
Quad Cortex, belong to their respective owners. Please don't contact Nektar
for help with this app.
