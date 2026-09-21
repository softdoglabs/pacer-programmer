# pacer-programmer

## Purpose

A browser-based configuration tool for the **Nektar Pacer** MIDI foot
controller — a better alternative to Nektar's own web editor. What
distinguishes it from existing editors (e.g. the archived
[`francoisgeorgy/pacer-editor`](https://github.com/francoisgeorgy/pacer-editor), GPLv3)
is that it treats the preset set as data to be *analyzed*, not just edited:

1. **Hardware simulator.** An on-screen image of the Pacer with clickable
   hit-regions over each footswitch. Clicking a switch simulates what the
   physical hardware would do and displays the exact MIDI/SysEx messages
   that switch press would emit — usable with no hardware connected. This
   is powered by a hand-authored **device state machine** (see below).

2. **Derived template hierarchy.** Users never author templates directly.
   Instead, the app analyzes the full set of presets currently loaded (from
   a device or a `.syx` file) and derives a tree of shared configuration:
   the root is whatever every preset has in common, and as you descend the
   tree, presets get partitioned into progressively smaller groups that
   share progressively more specific configuration, down to leaves holding
   each preset's residual unique settings. Because a subset of presets
   might share one thing in common while a different, possibly overlapping
   subset shares something else, this is a tree of shared-config groupings
   computed from the data — not a flat "preset extends template" record
   anyone had to define. Recomputed on every load; never persisted.

3. **Derived higher-level preset-transition state machine.** This is
   distinct from the device state machine (#1). Because the Pacer cannot
   save state, users often "compile" state into the preset graph itself:
   a switch press doesn't just send a MIDI message, it also jumps to
   another preset, and that preset's own switches lead somewhere else.
   Example: pressing switch A on preset 1 sends a Program Change (e.g. to
   activate the Quad Cortex looper) *and* jumps to preset 2; on preset 2,
   switch A jumps to preset 3; on preset 3, switch A sends the
   deactivate/back message and jumps back to preset 1. Preset 2 and 3 here
   aren't independent presets a user thinks of as separate — they're
   really "the looper is currently active, entered from preset 1" as a
   state, hand-implemented as a dedicated preset because the hardware has
   no other way to remember "which preset should I return to." In
   practice this means the Pacer often contains one near-duplicate
   "looper active" preset *per origin preset* it can be entered from,
   differing from each other only in their return target.

   The app should detect this automatically: extract every
   switch-press-causes-preset-change action as a directed edge in a
   preset-transition graph, then use the same shared/diff analysis as #2
   to notice when a set of presets are structurally identical apart from
   their navigation edges. Those get grouped and presented as a single
   higher-level state (e.g. "Looper active") with labeled transitions back
   to each origin, rather than as N separate, seemingly-unrelated presets.
   This is the real payoff of the project: recovering the state machine
   the user actually designed from the raw preset dump they were forced to
   flatten it into.

Both #2 and #3 are views computed by the same underlying "diff the
presets" analysis engine, just applied to different slices of a preset's
config (non-navigational config for templates, navigational config for
the transition graph).

## Persistence philosophy

**No bespoke save format, and no derived data is ever persisted.** The
single source of truth is the same data the hardware itself understands: a
full SysEx configuration dump. On disk, the app reads/writes one JSON
document that is a lossless, field-for-field mirror of that dump (presets,
banks, controls, steps, LED config, global settings). That file *is* the
save file — export it and you have something you could just as well have
pulled from the Pacer's SysEx dump, byte for byte, no app-specific wrapper.

The template hierarchy and the higher-level preset-transition state
machine are **both purely computed/presentational views** over that one
file — recomputed from scratch every time it's loaded, never written back
to it in any form. If the analysis code changes, old files don't go stale;
they just get re-derived differently.

Two ways to get data in: import a `.syx` SysEx dump from the real device,
or edit the JSON directly (or via the UI, which is the same thing). Two
ways to get it out: export back to `.syx` to send to hardware, or save the
JSON.

## Hardware background (Nektar Pacer)

- 10 built-in footswitches with RGB LEDs, up to 4 external NP-1 switches,
  2 NX-P expression pedal inputs, 4 relay outputs.
- 24 user presets arranged as 4 banks (A–D) × 6 presets.
- Loading a preset can fire up to 16 MIDI messages; each individual control
  supports up to 6 sequential steps/actions.
- **Confirmed** (from the reference project's source, `src/pacer/constants.js`
  — protocol facts only, not copied code, see licensing note below): each
  step's `msg_type` byte can be one of several *Pacer-internal control
  actions* rather than a real outgoing MIDI message. The one #3 above
  depends on is `MSG_SW_PRESET_SELECT` (`0x62`, "Preset Select") — its
  `data[0]` is a target: 0 = Current, 1 = Track, 2 = Transport, 3-26 =
  A1-D6 (so a user preset's target is its SysEx `idx` + 2; see the
  numbering helpers in `src/pacer/protocol/constants.ts`). Triggering it switches the Pacer to that preset immediately;
  nothing is sent on the MIDI wire for this action itself — it's invisible
  to connected gear. There's also `MSG_SW_PRESET_INC_DEC` (`0x56`) for
  relative next/previous preset navigation. A control's other steps in the
  same action can still send real MIDI (e.g. `MSG_SW_PRG_BANK`, `0x45`,
  Program Change + Bank) — which is exactly how "send PC to activate the
  looper *and* jump to preset 2" (the example in #3) gets encoded: one
  step of type Program Change, another of type Preset Select, on the same
  switch.
- A control also has a **control mode** (element `0x60`): "all steps in
  one shot" (default — every configured step fires together on a single
  press, which is what makes the PC-and-jump combination above possible
  in one press), "Sequence" (each press advances to the next step), or
  "External Step Select" (another switch's `MSG_SW_STEP_SELECT` /
  `MSG_SW_STEP_INC_DEC` action drives which step fires). The
  preset-transition-graph extraction in #3 needs to account for this: only
  the step(s) that actually fire on a given press — which depends on this
  mode — should become an edge, not every step configured on the control.
- **SysEx framing — verified against `fixtures/factory-presets.syx`, not
  just hypothesized** (implemented in `src/pacer/protocol/`; every one of
  the fixture's 4762 messages round-trips and checksum-validates via its
  test suite). Each message: `F0 00 01 77 7F <cmd> <tgt> <idx> <obj> <elm>
  ...fieldBytes <checksum> F7`. `00 01 77` is Nektar's manufacturer id,
  `7F` a device id byte. `cmd` is `0x01` Set / `0x02` Get. `tgt` is `0x01`
  Preset / `0x05` Global (`0x7F` "Full Backup" only ever appears as the
  target of a Get request — actual dump replies use Preset/Global
  directly, never a backup-wrapper target). `idx` addresses which preset
  or global slot. The checksum covers `cmd` through the last field byte
  (*not* the manufacturer/device bytes, *not* `F0`/`F7`) and is chosen so
  `sum(covered bytes) + checksum ≡ 0 (mod 128)`.
- **Field encoding within a message** — also verified: each named field is
  `elm(1) len(1) value(len bytes)`, and every field except the last one in
  a message is followed by one reserved `0x00` byte (its purpose is
  unconfirmed; our decoder tolerates it as a skippable unrecognized byte
  rather than depending on its meaning). A control step's 6 sub-fields
  (channel, msg type, 3 data bytes, active) always arrive together as one
  fixed-shape message; same for a preset's MIDI setting's 5 sub-fields,
  and a step's 4 LED sub-fields.
- **Preset numbering (SysEx `idx`): 0 = "Current", 1-24 = A1-D6.**
  - Confirmed from the reference editor's `presetIndexToXY` and the factory
    dump. Slot 0 duplicates A1's "PRGM1", and A1-A6 = PRGM1-4 / NOTES /
    RELAY matches the User Guide's factory list.
  - "Current" is the device's working copy of the active preset, not a
    front-panel preset.
  - An earlier version of this code treated idx 0 as A1, which shifted
    every label by one and made every Preset Select jump land one preset
    early. It also produced a supposed "mystery 25th slot" (really D6,
    "SEQNC").
  - The dump's factory set is newer than the manual's list. D1 is
    "G-MST", and the rest of bank D moved down one: COLOR D2, KBDTL D3,
    GM CC D4, MMC D5, SEQNC D6.
- **Not every control supports every field.** Stompswitches (1-6, A-D) get
  a control-mode field, 6 steps, and 6 LED entries. Footswitches (1-4) and
  expression pedals get a control-mode field and 6 steps, but never LED
  entries — the factory dump simply never emits `elm` bytes in the LED
  range (`0x40-0x57`) for those controls, presumably because they lack
  addressable per-step RGB LEDs.
- Global-target fields (`tgt=0x05`): confirmed to use the same
  elm/len/value framing, addressed by `idx` (0 = "Current", 1-4 = "Global
  Preset 1-4") and `obj` (Global Setting, Footswitch Mode, Relay Mode,
  Encoder, Expression Pedal — see the reference project's `dump_format.md`
  for the element tables). **Semantics not yet modeled**: our decoder
  preserves each Global message's bytes verbatim (`PacerConfig.globalFields`)
  without interpreting them, per the open question below on global-config
  scope. Still a licensing-clean, from-scratch implementation — we're
  reusing documented element *codes*, not the reference project's code.

## Tech stack

TypeScript throughout, standard browser target, no server component (the
Web MIDI API is browser-only and everything the app does is local to the
client — a server buys nothing here).

| Concern | Choice | Why |
|---|---|---|
| Framework | **React + Vite** (SPA, no Next.js) | No SSR/routing/server needs — Next.js's server infrastructure is pure overhead for a local hardware tool. Vite gives a fast dev loop and ships as static files you can open locally or host anywhere. |
| Language | **TypeScript, strict mode** | The SysEx byte layout and both state machines are exactly the kind of thing worth encoding in types. |
| Domain state | **Zustand** | Holds the parsed Pacer config (the in-memory mirror of the JSON/SysEx document). Minimal boilerplate, easy to keep pure/serializable. |
| Device state machine | **XState**, hand-authored | Models the Pacer's own firmware-level UI behavior (bank-select mode, active preset/bank, LED feedback) given whatever preset config is currently loaded. This is what the on-screen simulator runs. |
| Preset analysis engine | **Plain TypeScript, pure functions, heavily unit-tested (Vitest)** | Computes the template hierarchy and the derived preset-transition graph from the canonical config. This is derived/inferred data, not something a user or a hand-authored state machine defines — it belongs in a well-tested analysis module, not a UI framework. Exact algorithm (e.g. recursive partitioning by maximal shared field-value sets, vs. a formal-concept-analysis-style lattice) is still to be worked out. |
| Diagram rendering | **React Flow** (`@xyflow/react`) | Renders three different graphs from the same library: the device state machine, the derived template hierarchy tree, and the derived preset-transition graph. |
| Component/styling | **shadcn/ui + Tailwind CSS** | Radix-based primitives (dialogs, tabs, tooltips, forms) that are copy-owned rather than a black-box dependency — needed because we're doing something non-standard (precise hit-regions positioned over a hardware photo/SVG), so full styling control matters more than a large prebuilt widget set. |
| MIDI I/O | **Web MIDI API** directly (`navigator.requestMIDIAccess({ sysex: true })`), thin wrapper module | No dependency needed for something this small; keeping it thin makes the SysEx parsing/encoding logic easy to unit test independent of the browser API. |
| Package manager | **pnpm** | Fast, disk-efficient, fine default. |
| Testing | **Vitest** + Testing Library | Pairs natively with Vite; SysEx encode/decode and both the device and analysis logic are pure and easy to unit test — and correctness of the analysis engine is the actual hard problem in this project, so it needs real test coverage. |
| Lint/format | **ESLint (typescript-eslint) + Prettier** | Standard. |

## Fixtures

`fixtures/factory-presets.syx` — a real SysEx capture of the Pacer's
factory-default configuration (all 24 presets + global settings). This is
the first real input to build/test the SysEx decoder against, before any
live hardware or Web MIDI involvement. It's also what the app starts on:
`src/pacer/factoryDefaults.ts` inlines it into the bundle (Vite `?inline`,
with `.syx` in `assetsInclude`), and the header's "Factory defaults"
button reloads it. Vitest 2 doesn't inline assets, so `src/test/setup.ts`
mocks that import with the same data URL. See `fixtures/README.md` for
provenance and an open licensing question to resolve before this repo is
made public.

## Implementation status

`src/pacer/protocol/` — the SysEx codec (`decodeSysex` / `encodeSysex`)
and the `PacerConfig` domain types that will drive the simulator. Decoding
`fixtures/factory-presets.syx` and re-encoding it round-trips to an
identical `PacerConfig` (see `__tests__/roundtrip.test.ts`) — this is the
foundation the device state machine, template analysis, and
preset-transition graph (all still unbuilt) will sit on top of. Global
config fields are preserved but not semantically decoded (see hardware
background and open questions above).

`src/pacer/simulator/` — the device-level hardware simulator engine
(`applyBoardEvent`, `createBoardState`) that turns a `PacerConfig` plus
press/release events into MIDI messages, preset jumps, and relay actions,
per `ControlMode` (all-steps-at-once / sequence / external-step-select)
and per-message-type semantics. Message-type data-byte layouts are
reference-documented (from the same reference project's
`MSG_TYPES_DATA_HELP`, not guessed) except where noted inline as an
assumption (step-range wrap direction, runtime-state-resets-on-preset-
change, and `ExternalStepSelect`/`StepSelect`/`StepIncDec` cross-control
targeting, which is deliberately deferred — unverified numbering, no way
to validate it without a real capture that exercises it). Covered by 40+
unit tests (synthetic configs for behavior, plus a smoke test pressing
every control on every real factory preset).

The simulator UI (`src/App.tsx`, `src/ui/`, `src/store/pacerStore.ts`) is
built on Tailwind v4 + shadcn/ui (dark-only theme, `@/` path alias,
components in `src/components/ui/`). Its centerpiece is `Faceplate.tsx`, a
hand-drawn SVG of the top panel (back row Preset, A-D, display + encoder;
front row 1-6). Each switch shows a legend summarizing its active steps
plus an LED bar.
- **Hit regions:** each switch is a real HTML `<button>` positioned over a
  background SVG (body, display, markings), with its artwork in an inner
  SVG.
- **Press handling:** all presses, including the rear-jack buttons, go
  through React Aria's `usePress` (`@react-aria/interactions`), not
  hand-rolled pointer/focus code.
- **Why not SVG elements:** `usePress` only ends a touch long-press (no
  click on iOS/Android) for `HTMLElement` targets.
- **Tap vs. hold on [Preset]:** decided by the device machine's timer, not
  the UI.
Around it: rear-jack controls (FS1-4, EXP1-2), a preset list (a direct
jump that the hardware can't do; logged as an app action), a
control/preset inspector, and the output log.
- `src/pacer/device/deviceModeMachine.ts` is the XState machine for the
  firmware's *special presets*. Preset select, Track and Transport are
  modeled as firmware-owned presets that aren't in the config. While one
  is active, the board still holds the last user preset, which is what
  [Preset] returns to.
  - [Preset] is tap-vs-hold (a parallel `presetButton` region with a
    timed `after` transition).
    - Holding it for `PRESET_HOLD_MS` (2000 ms, per the User Guide's
      "hold for 2 seconds"; possibly shorter on real hardware, unverified)
      enters preset select, from any mode. There, A-D pick a bank and 1-6
      load that number in the pending bank, which starts as the current
      bank.
    - A tap returns to the last user preset: it reloads from
      Track/Transport, cancels preset select, and does nothing on a user
      preset.
  - Preset-select LEDs (`presetSelectLeds.ts`, observed on hardware) are
    royal blue: 1-6 flash dim, except the loaded preset's number, which is
    solid bright. [Preset]'s own LED flashes bright red. The A-D LEDs
    (pending bank bright, others off) are assumed.
  - Factory A and B use PresetSelect's reserved targets 1 ("track") and
    2 ("transport"). The engine reports these as `specialPresetRequested`.
  - Track/Transport switch assignments are in `specialPresets.ts`. They
    come from the Pacer User Guide and the faceplate legends.
  - Their DAW commands are logged symbolically; the actual Nektar DAW
    Integration / MCU bytes aren't modeled.
  - Assumptions: A/B switch between Track and Transport, and returning
    resets the user preset's runtime state.
- `src/pacer/simulator/leds.ts` holds the LED color table (codes
  0x01-0x18, documented) and the rules for which LED shows. Those rules
  are an assumption: step 1, or the last-fired step in Sequence mode;
  the active color while held or toggled on. 0x7F, used on nearly every
  factory LED, is undocumented and rendered neutral.
- Not simulated yet: a preset's own load-time MIDI settings (shown in the
  inspector only), LED `midiController` input, and continuous expression
  pedal sweeps (press/release = max/min).

### Running locally

```
pnpm install
pnpm dev
```

Opens the Vite dev server. Requires a Chromium-based browser (Chrome, Edge,
Opera) for Web MIDI + SysEx support — Firefox/Safari support is
inconsistent. The simulator works with no hardware attached; connecting a
real Pacer over USB enables live send/receive against the device.

## Open questions

- **License** for this repo hasn't been decided yet.
- Whether v1 needs to cover **global config** and **NP-1/expression
  pedal/relay** settings, or start scoped to the 24 built-in presets only.
- Framing/checksum/field layout is now verified against a real factory
  dump (see hardware background above); what's *not* yet verified is
  writing to real hardware (only decode + re-encode has been tested, never
  an actual device round-trip over Web MIDI) or the Global-config field
  semantics (currently preserved opaquely, not decoded).
- Licensing: `francoisgeorgy/pacer-editor` is GPLv3. We're treating its
  documented protocol facts (message type IDs, element layout) as
  unencumbered — the same facts anyone would recover from staring at a
  device dump — and independently reimplementing our own encoder/decoder
  in TypeScript rather than porting or copying any of its source. Worth a
  sanity check before release if this project's own license ends up
  incompatible with GPL in some way that matters.
- The exact algorithm for the preset-analysis engine (template hierarchy +
  transition-graph grouping) is unspecified beyond the goals above — worth
  spiking on a few real preset dumps before committing to one approach.
