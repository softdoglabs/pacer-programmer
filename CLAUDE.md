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
  in one press), "Sequence" (each press advances to the next **active**
  step, wrapping after the last one; an inactive step is skipped entirely,
  while a step whose type is Off still takes its turn and sends nothing —
  owner-confirmed on 1.01.12 from the SEQ test preset's MIDI log), or
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
| Component/styling | **React Aria Components + Tailwind CSS** | Unstyled, accessible primitives (buttons, selects, number fields, tabs, …) with press handling that works the same for mouse, touch, pen and keyboard. That matters for a tablet-friendly editor and for the faceplate's switch hit regions. We style them ourselves with Tailwind via thin wrappers in `src/components/ui/`, so we keep full control over the non-standard hardware UI. (The project started on shadcn/ui/Radix and moved off it.) |
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

**Layering** (enforced by ESLint `no-restricted-imports`; nothing under
`src/pacer` may import React, Zustand, or UI code):
`protocol` → `hardware` → `simulator` → `device` → `panel` → `store` / `ui`.

- `src/pacer/hardware/` is a declarative description of every physical
  control (`PACER_HARDWARE`). It records each control's programmable
  ControlId, preset-select role (bank or number), placement, printed
  marking, and indicator lights. For each light it records the position
  (top/middle/bottom, matching SysEx LED num), variable (RGB) vs.
  fixed-ink color, face (bar / text legend / icons), whether a step can
  address it, and (for printed legends) the function it depicts. Each light carries the `evidence` behind
  it, marked confirmed or inferred. An invariants test checks the table.
  Current facts:
  - Front row: top = text legend, middle = icon legend, bottom = RGB bar.
  - Back row (Preset, A-D): a printed legend over an RGB bar, and no third
    light.
  - **Every light is RGB**, legends included, and takes whatever color a
    step's LED config gives it. The printed ink only decides how a legend
    looks when the *firmware* lights it for an assigned function.
    Owner-confirmed on 1.01.12 (LPOS/LROWS test presets); the old model had
    the legends as fixed-ink and unaddressable.
  - **Hue names are the reference project's** (`ledColors.ts`), and we keep
    them deliberately. The owner reads the middle of the table differently
    (its "amber" as yellow, its "yellow" as lime, its "teal" as light
    blue), but lime vs. green and lavender vs. purple are subjective, and
    only the code-to-light mapping affects behavior.
  - **LED num -> light** (owner-confirmed, LPOS): 0 and 1 both light the
    bar; 2 lights the icon legend (front row) or the printed legend (back
    row); 3 lights the text legend on the front row and does nothing on the
    back row.
  - **Legends are function indicators:** a legend lights while its switch
    is assigned the function it depicts (`depicts`).
    - Examples: A's "Track" while A selects Track; B's icons while B
      selects Transport; C/D's arrows while they step previous/next;
      "Preset" always; front-row DAW legends when the Track/Transport
      preset assigns those commands.
    - Evidence: the User Guide ("when DAW Transport or Track functions are
      assigned, the top and middle row icons are illuminated"), and the
      owner's dump, where A's legend is dark on A1/C1 (A reprogrammed) and
      lit elsewhere. An earlier "back-row legends are always lit" rule was
      only true of the factory assignments.
  - The factory dump only ever uses LED num 0, except its MMC preset (D5),
    which targets 2 (the transport icons).
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
  - Factory A and B use PresetSelect's reserved targets 1 ("track") and
    2 ("transport"). The engine reports these as `specialPresetRequested`.
  - `specialPresets.ts` holds the Track/Transport switch actions (User
    Guide). Their DAW commands use the hardware table's `DawCommand`
    names, so each assignment lights the legend that depicts it: Track
    lights the top text row, Transport the middle icon row.
  - Their DAW commands are logged symbolically; the actual Nektar DAW
    Integration / MCU bytes aren't modeled.
  - Assumptions: A/B switch between Track and Transport, and returning
    resets the user preset's runtime state.
- `src/pacer/panel/` computes what the panel shows.
  `computePanelState(board, firmwareMode)` gives every light's brightness
  (off/dim/bright), flashing, and semantic color (Pacer hue / royal blue /
  printed ink / unspecified), plus the display. It's built from one
  strategy per mode:
  - **The firmware LED model** (`engagement.ts`, `stepLight`).
    - **A switch lights exactly one light at a time: the step that will
      fire next** (owner-confirmed, LROWS/SEQ test presets). In All-at-once
      mode that's step 1, whichever row it targets, even though every step
      fires; a second step's row stays dark. In Sequence mode it follows
      the pointer: after step 1 fires, the light shows step 2's row and
      color, wrapping after the last active step.
    - **Steps that send MIDI have a value state.** The manual calls the
      colors "On/maximum value state" and "Off/minimum value state".
    - **That state is the device's remembered MIDI values**
      (`simulator/midiState.ts`: CC values, notes that are on, program and
      bank per channel), kept in `BoardState.midi`.
      - Every message the simulator sends updates it. It survives preset
        changes (observed: a PC switch sent on A1 is still bright after
        visiting another preset and returning).
      - It's cleared only by the "Reset MIDI state" button or a new
        session.
      - The dump's global "Current" block stores the same kind of state
        (program/bank per channel), but its encoding isn't known, so it
        isn't used as a starting point.
    - **Lights follow the memory** (`stepValueOn`), and remembered values
      start at 0 rather than "unknown":
      - CC Toggle / CC Trigger: the **first color field (elm 0x41) shows
        while the controller holds `data[1]`**, whichever value that is;
        the second (elm 0x42) shows otherwise. Confirmed on 1.01.12 with
        the TOGL preset: five toggles with [127, 0], [0, 127] and [100, 20]
        all followed this, at rest and after a press. Every factory and
        owner preset puts the pressed value in data[1], which is why this
        reads as a plain on/off there — and why the old "elm 0x41 = the on
        color, data[2] = the on value" model matched those dumps.
      - Note / Note Toggle: the note is sounding.
      - Program & Bank: the channel's current program (and bank, if the
        step sends one) is the step's. A1 rests dim orange.
      - Other MIDI types: On while held (assumed).
    - **Toggles follow the memory too:** a CC Toggle sends `data[1]`
      unless the controller already holds `data[1]`, in which case it sends
      `data[2]` (confirmed, TOGL preset). So every switch toggling the same
      CC shares state. Note Toggle works the same way. This replaced
      per-switch toggle bits and a "last PC sender" that were reset on
      every preset change.
    - **Preset navigation has no value state.** Each kind has a fixed light
      role (all observed):
      - Preset Select to a user preset: the On color, steadily. A with
        White/Dim White is bright white on both A1 and C1.
      - Preset Select to Track/Transport: a mode indicator, lit light blue
        in that mode and dark otherwise.
      - Preset Inc/Dec: dark, even when pressed and even with explicit
        colors.
    - This replaced an earlier "engaged" model (Preset Select lit only when
      its target is current), which the A-bar observation disproved. It
      also removed a special case for factory A-D resting dark; the light
      roles now explain that.
    - Unknown: Preset Select whose target is the current preset, and
      explicit colors on a Track/Transport selector.
  - `userPresetLights` applies that model to each showing step, lighting
    the indicator its LED num selects. Fixed-ink legends keep their ink and
    take only the brightness.
    - Color "Default" (0x7F, used on almost every factory LED) is the step
      message type's default hue: bright A when on, dimmed b when off.
      Documented in User Guide p. 12, Chart 2 and implemented in
      `defaultLedColors.ts`: PC = orange, CC = blue, Note = green,
      Preset Select/Inc-Dec = red, MMC = yellow, Relay = lavender,
      NRPN = purple, Step Select = pink.
  - **Mode indicators, observed:** the bar of the switch for the current
    mode is solid bright light blue: Preset on a user preset, A in Track,
    B in Transport. The others are off. Preset's bar is the firmware's
    user-preset-mode indicator. A/B come from the Track/Transport selector
    role above.
  - `presetSelectLights`, all observed on hardware:
    - [Preset]'s bar flashes bright red.
    - A-D: only the current bank's bar is lit, in solid bright royal blue.
    - 1-6: they flash dim royal blue, except the loaded preset's number,
      which is solid bright.
  - `dawPresetLights`: the mode-indicator bars. The DAW-function bars'
    behavior isn't known yet, so they stay off.
  - `legendLights`: printed legends, lit by assigned function (see the
    hardware notes above). Config-driven lights win per indicator, e.g.
    the MMC preset's LED num 2 on the icon row.
  - `switchHint` gives the app's own "what would a press do" annotation,
    which is kept separate from anything the hardware displays.
  - LED color-code decoding (hue + bright/dim) lives in
    `protocol/ledColors.ts`.

The simulator UI (`src/App.tsx`, `src/ui/`, `src/store/pacerStore.ts`) is
built on Tailwind v4 + React Aria Components (dark-only theme, `@/` path
alias). Small Tailwind-styled wrappers over RAC live in
`src/components/ui/` (Button, Tabs, Select, plus a static Badge). There's
no hover-only UI, for tablets.
- **The faceplate** (`src/ui/panel/Faceplate.tsx`) contains no per-switch
  or per-mode logic. It lays out `PACER_HARDWARE` and paints
  `computePanelState` through the generic `SwitchView`, which renders any
  switch's text/icon legend rows and bar from its spec.
- **`palette.ts`** is the only place semantic colors become CSS.
  **`icons.tsx`** holds our own SVG icon drawings.
- **Hints** are drawn as teal italic annotations below each switch, visibly
  distinct from the printed legends.
- **Hit regions:** each switch is a real HTML `<button>` positioned over a
  background SVG (body, display, markings, hints), with its artwork in an
  inner SVG.
- **Press handling:** all presses, including the rear-jack buttons, go
  through React Aria's `usePress` (`react-aria`), not hand-rolled
  pointer/focus code.
- **Why not SVG elements:** `usePress` only ends a touch long-press (no
  click on iOS/Android) for `HTMLElement` targets.
- **Tap vs. hold on [Preset]:** decided by the device machine's timer, not
  the UI.
- **Programming interface (first slice):**
  - **Play/Edit** switch in the header. In Edit mode, tapping a switch
    (or a rear-jack control) selects it for editing and fires nothing;
    [Preset] does nothing. The faceplate gets a dashed outline.
  - **Editor** (`ui/editor/`): the preset name (5 chars), then the selected
    control's mode (All at once / Sequence / External step) and a card per
    configured (active) step. Step 1 is always shown. "+ Add step"
    activates the next free step and is disabled once all 6 are in use;
    steps 2-6 have a remove (✕) button that deactivates them.
    - The card of the step that currently lights the switch is badged
      "lights the switch"; the others explain why their colors don't show
      (All-at-once) or when they will (Sequence). Same rule as the panel
      (`showingStep`).
    - Each card has a type picker grouped as
      Send MIDI / Pacer actions, and labeled fields per type (a target
      picker for Preset Select, a direction for Inc/Dec, a channel with
      Global).
    - For lit switches: the LED target (one option per light the switch
      really has — LED nums 0 and 1 are the same bar, and A-D have nothing
      on 3) and two color swatch grids (Default, Off, 12 hues in bright and
      dim). The swatches are labeled by what makes each color show, e.g.
      "While CC 52 = 127" / "Otherwise", since the pair isn't a plain
      on/off (see the LED model above).
    - Wide screens show the editor in the side column; narrow ones
      (tablet portrait) put it right under the faceplate
      (`useMediaQuery`, rendered in one place only).
  - **Edits** are pure functions (`src/pacer/editing`) applied to the live
    config, so the simulator previews them. There's undo/redo (buttons,
    ⌘Z / ⇧⌘Z) and an "unsaved" badge.
  - **Save** opens a dialog: "Save as new snapshot" (the default, "Edited
    from …") or "Save over" the open snapshot (not the factory defaults).
    Opening, importing, pulling, or deleting the open snapshot asks before
    discarding unsaved edits.
  - **Send to Pacer** (header, `ui/editor/SendToPacer.tsx`,
    `store/sendSlice.ts`, `midi/pacerWrite.ts`): writes user presets of the
    working config to the device.
    - Scope: "Changed" (the default: presets that differ from
      `sendBaseline`, which is the config as opened, updated with each
      preset successfully sent since), "This preset", or "All 24". The
      dialog lists exactly which presets get overwritten and needs an
      explicit confirm.
    - Preset Set messages (`encodePresetMessages`) to idx 1-24, never
      global settings.
    - **The loaded preset's working copy is updated too.** Writing a slot
      doesn't change Current (idx 0), which is what the switches run
      (observed). So before writing, the app asks the Pacer which preset
      it has loaded (`midi/pacerState.ts`: `Get` / Global / 0 / all
      objects returns every global message in about 60 ms, and
      `activeUserPresetIndex` reads elm `0x1A` = user preset and `0x1E` =
      0-23 → A1-D6). If that preset is being sent, the same contents
      also go to idx 0 (`encodePresetAsCurrentMessages`), after the slot
      writes and inside the same settled send. The read-back checks
      Current too.
    - If the Pacer doesn't say, the send goes ahead and the dialog asks
      you to reselect the preset on the Pacer.
    - Paced at 10 ms per message, like the reference editor's dump upload.
      Cancelable; a partial send is reported as such.
    - **Then a 1 s settle, during which nothing else goes to the Pacer**
      (`PACER_WRITE_SETTLE_MS`; pull, read-back and "Check firmware" are
      blocked). Found on hardware: after preset writes, a full-dump
      request within ~200 ms makes the Pacer drop the writes and fill the
      written preset with D6's contents, so the preset gets corrupted. With
      300 ms or more, writes always land. Writes look buffered and
      committed only once the input goes quiet (see pacerWrite.ts). The
      first version of the read-back sent its dump request immediately,
      which corrupted the owner's A1. The store tests' fake Pacer models
      this behavior. Re-confirmed on firmware 1.01.12, for presets that
      aren't loaded too.
    - Optional verify (on by default): re-pulls the full dump and compares
      the sent presets (`mismatchedPresets`).
    - Confirmed on hardware: single-message and full-preset writes land
      in exactly the addressed slot (idx 1-24), for the active preset too.
      Writing idx 0 replaces Current and touches nothing else.
    - Not yet observed: that the switches run the new Current right away,
      and that `0x1E` counts from A1 = 0 for presets other than A1. So
      far the Pacer has only been seen on A1.
  - Not built yet: preset load-time MIDI settings,
    expression pedal ranges beyond step data, and copy/paste of
    steps/switches.
- **Sessions:** loading a configuration (opening a snapshot, importing,
  pulling) starts a fresh simulator session.
  - `freshSession` in the store rebuilds all per-session state, and the
    device mode machine is restarted. The same function builds the initial
    state, so nothing is patched field by field.
  - The simulator views are keyed on `sessionId`, so React remounts them
    and no component state (a held press, the inspector tab) survives the
    switch.
- **Around the faceplate:** rear-jack controls, a preset list (a direct
  jump that the hardware can't do; logged as an app action), a
  control/preset inspector (step table with LED colors and which light each
  step drives), and the output log.
- **MIDI out** (`src/midi/webMidi.ts`): a thin Web MIDI wrapper, typed
  structurally so tests use fakes (`src/midi/__tests__/fakeMidi.ts`).
  - The header's "Connect MIDI" asks for SysEx access, falling back to
    plain MIDI if that's refused, then lists output ports and tracks ports
    being added and removed.
  - Every MIDI message the simulator emits is sent to the chosen output.
    The default is "Don't send", so nothing reaches real gear until you
    pick a port.
  - MMC is SysEx, so it's only sent with the SysEx permission.
  - Step channels follow the manual: 0 = the config's global channel
    (`protocol/globalSettings.ts`), 1-16 = MIDI channels 1-16.
  - Not sent yet: DAW-preset commands (their bytes aren't modeled) and
    preset load-time MIDI (not simulated).
- **Pulling from the Pacer** (`src/midi/pacerDump.ts`):
  - It sends the full-dump request (`Get` / Full Backup,
    `protocol/requests.ts`) and collects the Pacer's `Set` replies. The
    reply is 4762 messages on current firmware, the same format as the
    factory fixture.
  - There's no end marker, so completion is detected by the stream going
    quiet. It fails clearly if the Pacer never answers.
  - The Pacer's ports are auto-detected by name (/pacer/i) and can be
    overridden.
- **Firmware version:** the dump doesn't contain one. Its global fields
  are identical between the factory capture and a real device dump, and
  are all settings.
  - The app sends a standard MIDI Device Inquiry (Universal SysEx
    `F0 7E 7F 06 01 F7`, `protocol/identity.ts`, `midi/deviceIdentity.ts`)
    before each pull, and on demand via "Check firmware".
  - The reply (manufacturer, family, model, 4 version bytes) is stored on
    the pulled snapshot.
  - Confirmed on hardware: the Pacer answers (Nektar, family 9319, model
    8273). Its 4 version bytes are ASCII digits ("0101"), shown as text;
    non-printable version bytes are shown as numbers. No reply is treated
    as normal, not as an error.
  - **The version bytes don't identify a firmware build.** The reply is
    byte-identical before and after updating to 1.01.12: "0101" is only the
    "1.01" part, so the app can't tell builds apart, and neither can a
    dump (identical message counts, layout and contents across the
    update).
- **Saved configurations** (`src/library/configLibrary.ts`,
  `store/configurationsSlice.ts`, `ui/ConfigurationsPanel.tsx`):
  - Every pull and every `.syx` import becomes an immutable snapshot in
    localStorage. It holds the raw SysEx bytes as received, plus name,
    source, date and preset count.
  - Snapshots can be opened, renamed, exported as `.syx`, or deleted. The
    built-in factory defaults are always listed.
  - The last-opened configuration is reopened on reload.
  - Raw bytes rather than the JSON mirror: they're canonical and lossless,
    and about 3x smaller, which matters because localStorage allows about
    5 MB (~25 dumps).
  - Edits are saved as new snapshots or over the open one (see Save
    above); sending to the device is separate (see Send to Pacer).
- Not simulated yet: a preset's own load-time MIDI settings (shown in the
  inspector only), LED `midiController` input, and continuous expression
  pedal sweeps (press/release = max/min).
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`.

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
  writing Global settings, and the
  Global-config field semantics (currently preserved opaquely, not
  decoded). Preset writes over Web MIDI are confirmed (see Send to Pacer).
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
