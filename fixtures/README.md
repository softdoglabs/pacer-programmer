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

**Open licensing question.** That said, it's currently sourced from a
GPLv3 repository, and this project hasn't picked a license yet. Before
this repo is made public or distributed, worth either (a) re-sourcing this
exact data from Nektar's own official factory-preset/reset downloads at
support.nektartech.com, which appear to distribute the same factory
defaults for legitimate reset purposes, or (b) capturing a fresh dump from
real hardware once this project's own MIDI I/O + backup-request code
exists. Tracked as an open item, not blocking early development/parser
work.

## What it's for

This is the first real-world input for the SysEx decoder: parsing this
file end-to-end (into the canonical JSON mirror described in `CLAUDE.md`)
and round-tripping it back to identical bytes is the first correctness
target for that code, before ever touching live hardware or Web MIDI.
