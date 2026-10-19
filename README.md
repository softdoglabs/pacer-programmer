# Pacer Programmer

Pacer Programmer is a browser-based editor for the Nektar Pacer MIDI foot
controller. It's built around two ideas.

The first is that you should be able to see what a change does before you
send it. Programming my Pacer used to mean guessing at what a preset would
do, sending it to the device, stomping on switches to find out, and doing it
all again. Here you program on screen, press the switches on screen, and your
real gear responds to real MIDI. The Pacer only gets sent anything once it's
right.

![The simulator playing a looper preset, its MIDI going to a Quad Cortex](docs/images/simulator.png)

In the picture it's driving a Quad Cortex's looper. The lights and the display
are what the Pacer itself would show, since the simulator runs your
configuration the way the Pacer's firmware does, and the log at the bottom
lists every message that went out.

The second idea is a little more unusual. The Pacer can't remember anything,
so if you want a switch that means "go back to wherever I came from," you end
up building copies of presets by hand and keeping them in sync forever. The
[preset map](docs/reference/preset-map.md) finds those copies in your
configuration, shows them as the one thing you actually designed, and keeps
them in step when you change it.
[Why a state machine](docs/why-a-state-machine.md) explains the problem in
more detail.

There's no project file. The app reads and writes the Pacer's own `.syx` dump,
and the format is [documented](docs/reference/programming-the-pacer.md) well
enough that you (or an AI) can read and write it too.

You only need MIDI to reach real gear and the Pacer, and for that your browser
has to support Web MIDI with SysEx. Everything else works without it.

## Documentation

Start with the [guide](docs/guide/README.md), which covers the simulator,
editing a preset, and everything else you'll do day to day. The
[tutorials](docs/tutorials/README.md) build a looper from the factory
defaults, one step at a time, and the [reference](docs/reference/README.md)
covers every control and every message the app shows. The whole set starts at
[docs/README.md](docs/README.md).

## Running It Locally

```
pnpm install
pnpm dev
```

## Not Affiliated with Nektar

Pacer Programmer is an independent project. It isn't affiliated with,
endorsed by, or supported by Nektar Technology. Nektar and Pacer are
trademarks of their owner, and other product names mentioned here, such as
Quad Cortex, belong to their respective owners. Please don't contact Nektar
for help with this app.

## License

Copyright (C) 2026 Soft Dog Labs, LLC

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program, in [LICENSE](LICENSE). If not, see
<https://www.gnu.org/licenses/>.

Additional term, under section 7(e) of the GNU General Public License: no
rights are granted under trademark law to the Soft Dog Labs name or logos. See
[TRADEMARKS.md](TRADEMARKS.md).

The display font, DSEG14 by keshikan, is under the SIL Open Font License 1.1;
its license is bundled with it in `src/assets/fonts/`. The factory preset dump
in `fixtures/` is Nektar's own configuration data; see
[fixtures/README.md](fixtures/README.md).
