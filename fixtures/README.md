# Fixtures

## `factory-presets.syx`

A raw MIDI SysEx capture of the Nektar Pacer's factory-default configuration:
all 24 user presets (banks A–D) plus global settings, target `0x7F` ("Full
Backup") in the protocol's own terms — one file, exactly matching this
project's "the file is the config" persistence model (see `CLAUDE.md`).

Verified well-formed: it's a concatenation of individual SysEx messages,
each framed `F0 00 01 77 7F ... F7` (`00 01 77` is Nektar's manufacturer
ID). 139,544 bytes.

**Provenance.** This is byte-identical to the factory dump bundled with
the archived, GPLv3-licensed
[`francoisgeorgy/pacer-editor`](https://github.com/francoisgeorgy/pacer-editor)
project (`dumps/ALL.factory.bin`, `public/patches/factory-defaults.syx`,
and `patches/factory/Pacer ALL factory.syx` in that repo are all this same
file). It was presumably captured by that project's author directly from a
real Pacer unit's factory-reset state — i.e. it's Nektar's own shipped
configuration data, not an original work of that project's author.

**Licensing.** It's sourced from a GPLv3 repository, and this project is
GPLv3 too (see `LICENSE`), so carrying it here, and bundling it into every
build as the app's startup configuration (`src/pacer/factoryDefaults.ts`),
is compatible with how it was distributed to us. It's Nektar's data in the
first place, which Nektar also distributes for factory resets. A dump
captured from real hardware by this app's own Pull would be a cleaner
provenance, and could replace it byte for byte if wanted.

## What it's for

This is the first real-world input for the SysEx decoder: parsing this
file end-to-end (into the canonical JSON mirror described in `CLAUDE.md`)
and round-tripping it back to identical bytes is the first correctness
target for that code, before ever touching live hardware or Web MIDI.

## `ai-looper.syx`

The factory dump with tutorial 4's looper built into it: LOOPR in C1, entered
from A1 on switch A and returning to it. It's written by
`scripts/docs-ai-example.mjs`, which plays the AI in that tutorial and uses
nothing but `docs/reference/programming-the-pacer.md`: no app code. The docs
walkthrough (`pnpm docs:walkthrough`) imports it and finishes tutorial 4 on it,
so it's the check that the format page is enough on its own to write a dump the
app reads as intended. Regenerate it with `node scripts/docs-ai-example.mjs`.
It's derived from `factory-presets.syx`, so the licensing note above applies
to it too.
