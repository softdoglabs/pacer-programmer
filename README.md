# Pacer Programmer

A browser-based editor and simulator for the Nektar Pacer MIDI foot
controller. Program your presets on screen, play them against your real gear
over MIDI before anything is sent to the Pacer, and see how your presets lead
to one another on the preset map.

The documentation starts at [docs/README.md](docs/README.md).

## Running it locally

```
pnpm install
pnpm dev
```

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

The display font, DSEG14 by keshikan, is under the SIL Open Font License 1.1;
its license is bundled with it in `src/assets/fonts/`. The factory preset dump
in `fixtures/` is Nektar's own configuration data; see
[fixtures/README.md](fixtures/README.md).
