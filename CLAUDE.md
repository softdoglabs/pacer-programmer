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
provenance, and why carrying it fits the project's GPL-3.0 license.

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

`src/pacer/analysis/` — the derived views over a configuration, starting
with the preset-transition graph (`presetTransitions`): every route one
preset's own controls can take to another. Pure, and it depends on
`protocol` alone.
- Only a control step can change preset. A preset's load-time MIDI can't
  (its table has no preset type) and neither can an expression pedal (all
  its types are continuous). The firmware's own routes — [Preset] held,
  Track/Transport — aren't edges: they're available everywhere and belong
  to the device rather than to a configuration.
- Which steps can fire depends on the control mode, so the trigger is part
  of the edge: All-at-once reaches a jump on one press and carries
  everything else that press sends (`alsoFires` — the "activate the looper
  *and* go there" pattern); Sequence gives one edge per active navigating
  step, reached after that many presses; External step select marks them
  all possible, since cross-control targeting isn't modeled.
- An all-at-once press with two jumps yields one edge, matching the
  engine, which takes the first and warns about the rest.
- Preset Inc/Dec is relative, so it resolves per source preset and wraps
  (D6 next = A1). Preset Select's reserved targets stay distinct: 0 is a
  reload, 1 and 2 are the firmware's DAW presets.
- Verified against the factory dump and the owner's device, where it finds
  the hand-built pair A1 -> C1 "LOOPR" and back — Purpose #3's pattern in
  miniature.

`presetStates` groups presets that behave identically apart from *where
their navigation leads*: navigation steps are compared by shape rather
than destination, so a switch that is a Preset Select in both presets
matches whichever preset each one points at, while a preset lacking that
switch does not. Names are excluded, so instances can be named apart on a
5-character display and still be one state; a state takes a name only when
every member shares one, which is the only name a dump can carry for it.
Tested by building the twelve-origin looper shape and recovering it as a
single state with twelve return routes.

## The state machine: authoring, not just recovery

Recovering the graph is half of it. The point is to **author** one "looper
running" state and have the tool work out that the hardware needs twelve
copies of it — one per origin, because the Pacer has nowhere to remember
which preset it came from — then allocate the slots and keep the copies in
step when the state changes. Doing that by hand in the stock editor, and
keeping twelve copies in sync afterwards, is the work this project exists
to remove.

**The invariant: whatever can be authored must be recoverable.** The
design is not persisted anywhere — the dump remains the only source of
truth (see Persistence philosophy) — so a state machine survives only by
being re-derived from its presets. That constrains the authoring side more
than the analysis: the editor must refuse anything the recovery can't read
back, and every multi-preset edit is checked against exactly that before
it's written (`whatWasLost`, below).

If some authorable shape turns out not to be recoverable, the fallback is
a saved design document plus tools to merge states — but that reintroduces
the bespoke save format this project set out to avoid, and two things that
can drift apart (the Pacer's front panel can edit presets behind it). Only
if the round trip can't be made to hold.

**Slot arithmetic is a hard constraint, not a detail.** A state entered
from twelve origins costs twelve presets on top of the twelve originals —
the whole device. Every edit is priced before it's written: a route that
needs another copy says so and asks which empty preset it may take, and one
that leaves copies unneeded frees them (`planRoute`, below), rather than
being refused or half-done.

**Machines are edited where they are, not compiled from scratch.** There
was once a whole-machine compiler (`compileMachine`): describe states,
get presets. The app never used it — the editor changes a machine by
editing the presets already on the device, which works the same on a
fresh dump as on an empty one — so it now lives in `src/test/` as a
fixture builder and the engine of the round-trip property test
(`analysis/__tests__/roundTrip.test.ts`), which checks that recovery reads
back the design that was meant. Like `realize`, it gives ways in that lead to
the same places one preset between them, so a fixture has the presets the
app would have made.

### The model and its recovery (`analysis/model.ts`, `analysis/recover.ts`)

A machine is states with a body (controls, minus navigation) and
transitions. A transition leads to a named state; or **returns**, back to
whatever entered this state; or follows a **table** of where it leads from
each way in (`byEntry`: back to MAIN0 and MAIN1, but from MAIN2 always to
MAIN0). The last two are what the hardware doesn't have, and the only
reason a state is ever more than one preset: **a copy is needed exactly
when one switch has to lead to different places depending on the way in.**
A tuner reached from everywhere is one preset; so is a looper whose A goes
to A1 and B to A2. A state needs a preset per distinct set of destinations.

`recoverMachine` reads one out of the presets. A group of look-alike
presets is a state, and each switch is read as a table: from each way into
each copy, where does it lead? Every way in going to one state is a fixed
jump; every way in going back is a return; anything else is a `byEntry`
table. Anything it can't express becomes a `note` rather than a wrong
answer. Nothing outside the analysis layer calls it — they ask `machineOf`
(below).
- **Nested returns are read inside out.** A looper whose tuner returns to
  it has each looper copy entered twice: by its origin, and by its tuner
  copy coming back. So the reading repeats, and each round's way-back
  edges stop counting as ways into where they land, until nothing more is
  learned. `RecoveredMachine.waysIn` is the result: what really enters
  each preset.
- **A jump to a one-preset state is fixed** even where that preset is also
  a copy's way in (LOOPR's B going to MAIN0 is "always MAIN0", not "back
  when entered from MAIN0"). A jump to a state of several copies is only
  fixed when it doesn't go back to the copy that entered.
- **A copy nothing enters is unused, not a misreading**: the state still
  reads from the ways in it has. Freeing such copies is the editor's job.
- Two ways in leading to the same places can share a copy (a hand-built
  partial return does this) and read back as the same table.

**Two states are the same when they differ in nothing but where their
navigation leads** — the rule the recovery groups on, and therefore the
rule the model is held to. A state's *identity is its behaviour*, not its
name: two states may share a name as long as they do something different,
which matters on a five-character display. Names that repeat are still
qualified by their starting slot when ids are needed as keys, but that's
presentation, not identity.

**What the invariant demands is that the recovered machine *means* the
same thing, not that it has the same shape.** A return from a state only
one place enters comes back as a jump to that one place — and with a single
origin those are the same machine. The two only part company once a second
origin exists, which is exactly when the editor's route dialog starts
offering "goes back" as a choice. An earlier version refused a single-origin
return on structural grounds, which conflated a harmless restatement with a
real loss and would have stopped a design being built up one origin at a
time.

**Plain stepping isn't an entrance.** Next/previous names a direction, not
a preset, so it says nothing about which state a press meant to reach, and
it doesn't count as entering one for the purpose of spotting a return. It
can't: every slot has neighbours and C/D step on nearly every preset, so
counting it would mean no state on a real device could ever be seen to
return. It's the same distinction the map's "hide default stepping" filter
draws.

**Neither is the Current slot** (idx 0). It's the device's working copy of
whichever preset is loaded, so its switches are a second copy of that
preset's, and every dump from real hardware has one. Counting it gave
everything the loaded preset leads to a phantom second way in, which is
precisely what stops a return being recognised — on the owner's device it
hid the return of the one hand-built looper there is. Found by running the
map on that dump, not by reading the code. It doesn't vote on a state's
name either: it lags behind the slot it copies until the next send, so
renaming the loaded preset used to leave its state with two names and
therefore none.

**Copies step to their own neighbours, and that isn't a disagreement.**
Two presets of the same state sit in different slots, so C and D lead to
different places from each — B6 from one, D4 from another. That's where a
copy happens to live rather than something the state does, so the slot is
left undrawn and unremarked. Calling it "copies that lead to different
states" made every multi-copy state on a real device unreadable the moment
it was created.

### What enters a preset (`analysis/returns.ts`)

`presetEntrants`: the presets that lead to one *by name* — not plain
stepping, not the Current slot, not itself, and not an edge already known
to be a way back (the nested-return fixpoint above). Written once and used
by recovery and authoring alike: two of the bugs found on the owner's
device were a fix reaching one copy of this rule and not the other. The
helpers that used to sit beside it (`soleEntrant`, `readsAsReturn`,
`wayBack`) answered the old "is this one copy a return?" question and went
with it.

### Whether an edit kept the design (`analysis/survives.ts`)

`whatWasLost(before, after, intended)` asks whether an edit lost anything
it didn't mean to, and is refused with the reason if the answer isn't
nothing. Moving a preset asks it; a route edit checks itself more strictly
(`realize`, below), because it knows the whole machine it meant. One
check, asked two ways, because edits claim two different things:

- **An edit** (`kind: "edit"`) says "these steps changed, and these slots
  were written over". It's held to losing nothing else: no return that
  stops reading as a return, nothing unreadable that wasn't before.
- **A renumbering** (`kind: "renumbering"`) says "the design is exactly
  what it was, only where it sits changed" — a stronger claim, held to the
  stronger test: the whole machine, slots renamed, comes back the same. The
  slots it fills and vacates are named, so no notion of "spare" is needed.

Whether an edit did what it was *asked* (the route reads back as the one
requested) is a different question and stays with the edit.

### One machine per configuration (`analysis/machineOf.ts`, `ui/useMachine.ts`)

Everything that asks what the states are gets them from `machineOf(config)`,
which recovers the machine once per configuration version and hands every
caller the **same object**. Components use `useMachine()` (and
`useStateOfPreset()` / `useEditTargets()` beside it in `src/ui/`).

- Configurations are never changed in place — every edit copies the path it
  touches — so a config object *is* a version and identity is an exact cache
  key. A WeakMap lets old versions go with the undo history that held them.
- The point isn't speed (recovery is about half a millisecond on a real
  dump). It's that there's one: before this, the map, chooser, editor,
  display and route dialog each recovered the states at their own moment,
  so two parts of one screen could hold different ideas of them.
- **Enforced:** ESLint forbids importing `recoverMachine` outside
  `src/pacer/analysis` (tests excepted). The machine handed out is shared,
  so treat it as read-only.

### Editing the machine (`src/pacer/authoring/`)

The layer where `analysis` and `editing` meet, which neither may depend
on the other to reach. **A route edit is a change to the recovered
machine, not to presets**: `editRoute` says where one switch of a state
should lead — a state, back, or a per-way-in table — and `realize` works
out what presets that machine needs and writes the difference, on **every
copy at once**, which is the part that can't be done a preset at a time
without the copies drifting apart.

One file per question:
- `change.ts` — what a route edit asks for (`RouteChange`: `to`, plus
  `entering` for a state this route enters whose switches depend on the way
  in), and the result every authoring edit gives back.
- `switches.ts` — what each switch on a state carries, and where a route
  could go (`switchUses`, `firstJump`).
- `plan.ts` — what a route would cost before anything's written
  (`planRoute`: the copies it needs a preset for, the presets it frees),
  and which states enter a state (`entrantStates`, from `waysIn`).
- `slots.ts` — where something new may go (`slotChoices`: the empty presets,
  and the ones in use that may be cleared for it, `clearablePresets`). One
  rule, asked by the route dialog and Move to… alike; each used to work out
  its own list.
- `editRoute.ts` — builds the machine after the edit and hands it to
  `realize`.
- `realize.ts` — from a machine to presets.
- `movePreset.ts` — renumbering a preset, routes following.

How `realize` gets from the machine to presets:
1. **Expand**: each affected state becomes an instance per context (the way
   in it was entered from), following byEntry rows and returns.
2. **Merge**: instances that behave the same are one copy (Moore partition
   refinement), so ways in that lead to the same places share a preset —
   a partial return costs a copy per *distinct set of destinations*, not
   per way in.
3. **Match** copies to the presets already there, by their ways in, so an
   unchanged copy stays where it is.
4. **Ask** for a slot for each copy left over (`CopyNeed`, with the way in
   it's for), and **free** copies nothing needs any more — clearing them —
   but only for states that are or were entry-dependent.
5. **Write** only the jumps that differ, then **check** by recovering the
   result: every affected switch must read back meaning what was asked
   (meanings are compared, not shapes — a single-origin return reading as
   a jump is the same machine), no other preset may start reading as a
   copy of a state, and nothing new may become unreadable.

What it refuses, and why:
- **New copies only go into empty presets** (`isSparePreset`, below). Not
  one the machine already uses, and never a preset with something in it:
  the dialog used to offer overwriting one, which is a one-click way to
  lose work for a route.
  - **But the dialog can clear one first, when asked twice.** A real device
    has no empty preset until something's cleared (the factory set fills all
    24), and "empty only" left the picker with a single "— none —" entry:
    a return couldn't be set up without leaving the dialog. So the picker
    also lists presets *in use* that the machine doesn't use
    (`clearablePresets` in `plan.ts`: a state by itself, nothing leads to it
    by name, no designed route of its own), under their own heading. Choosing
    one needs a tick-box naming the preset before the button enables; it's
    cleared and the route written as one undo step (`editRoute`'s `clearing`
    option, which refuses any preset `clearablePresets` wouldn't offer).
    `realize` is unchanged and still refuses a preset with something in it.
  - **Clearing can rename a state.** An id is the state's name, qualified by
    its slot only while another state shares the name, so emptying a preset
    called the same as the route's state changes that state's id. `editRoute`
    restates the change in the ids the states have after clearing, following
    each state by the presets it is.
  - Found by the owner on a full device. No test had one: every dialog test
    started from `compileMachine`, which leaves most slots empty, and the
    tutorial cleared D6 before it drew a route. **Test UI that allocates
    slots against a full 24 as well.** Tutorial 2 now clears D6 from the
    dialog and tutorial 3 moves onto D5 MMC, so the walkthrough takes the
    full-device path in both.
- **Nesting is allowed.** A looper that returns and leads to a tuner that
  returns to the looper copy that entered it multiplies the copies, and is
  rarely worth it in 24 slots — but it can be built by hand, and a map that
  can't draw it, or an editor that can't put it back after undoing it, is
  worse. The recovery reads it (its fixpoint) and `realize` builds it.
- **Only the first jump on a press happens** (the engine takes it and warns
  about the rest), so a route written after an earlier jumping step would
  never fire. Refused. That's the shape of every factory preset: switch A
  already selects the firmware's Track preset, which isn't a state of the
  configuration and so doesn't show on the map at all — hence
  `SwitchUse.firmwareTarget`, which is why "nothing on it" isn't the same
  as "free".
- **`RouteChange.replace` empties the switch first**, so the route is all it
  does, on every preset the state is. Without it most switches have nowhere
  a route could go. It replaces the whole switch rather than one step: a
  route that shares a press with what was there needs a free step, which is
  the case that doesn't need this.
- A route can't lead to the state it leaves from: that's a reload, which
  is Preset Select → Current.

### Spare slots (`src/pacer/editing/presetSlots.ts`)

The Pacer has 24 presets and no notion of a free one: every slot holds
whatever it was last given. A state that comes back needs a preset per
place it's entered from, so a design grows by taking slots, and something
has to say which may be taken.

- **What makes a preset spare is that nothing in it does anything**, not
  what it's called. A name is five characters on a 14-segment display:
  useful for spotting a slot you've freed, on the device as well as in the
  app, and no basis at all for overwriting somebody's work. `clearPreset`
  names one `EMPTY` as a label; `isSparePreset` judges the contents.
- A preset left with only its next/previous stepping counts as spare —
  that's what the hardware leaves when a preset is emptied from the front
  panel, and it holds nothing of yours.
- **Clearing sets what's there to Off rather than removing it.** A dump
  holds all six steps of every control and all sixteen preset messages,
  with the unused ones already Off (verified: the factory dump's steps 2-6
  are `0x61` and inactive). The device keeps whatever a message doesn't
  address, so emptying a preset by deleting fields would send nothing for
  them and leave the hardware exactly as it was. Writing Off over what's
  present sends the same number of messages the preset already had, which
  is what it takes to leave nothing behind.
- `clearControl` empties one switch the same way, which is how a route gets
  onto a switch that's already busy — on a real device that's most of them.
- `copyPreset` copies a whole preset into another slot, keeping that
  slot's own index. It's how a new copy of a state is made.

**Layering** (enforced by ESLint `no-restricted-imports`; nothing under
`src/pacer` may import React, Zustand, or UI code):
`protocol` → `hardware` → `simulator` → `device` → `panel` → `store` / `ui`,
with `editing` and `analysis` alongside, both depending on `protocol` only.

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
    - **A step's LED can be driven by incoming MIDI instead** — its first
      field, `LedConfig.midiFeedback` (the front panel's Control Edit ->
      LED -> `MIDI`, Off/On). We used to call it `midiController` and read
      it as a controller number; it's a flag. All confirmed on 1.01.12 by
      writing a CC 52 toggle ([52, 127, 0], green/red) into the Current
      slot on two switches, one flagged and one not:
      - `0` = Off, `1` = On, and it's **per step**: setting it from the
        front panel changed `led1` alone, leaving `led2`-`led6` of the same
        switch at 0.
      - With it on, the light follows the step's own CC **received on USB
        MIDI**: `CC 52 = 127` showed the first color, `64` the second. Same
        exact-match-on-`data[1]` rule as above, so the value model didn't
        need changing — only where the value comes from.
      - **The switch's own presses stop moving it** (pressed twice, stayed
        on the second color), which is the point: the DAW confirms the
        state. The step still *sends* on a press; only its light is
        detached.
      - **CC only.** A Program Change step with the flag on never lit, and
        sending PC 5 changed no light on the board. The User Guide only
        ever advertises "MIDI LED feedback for MIDI CC messages".
      - **USB is the only way in.** The Pacer has no MIDI In jack: its one
        DIN socket is MIDI Out, and the global `M OUT` setting
        (Int/USB/I+U) only picks what that jack transmits. So the flag is
        opt-in "let the DAW own this light", and with nothing echoing the
        CC back it parks on the second color for good. With the flag off
        (every preset in evidence) a CC step's light needs no input at all
        — the Pacer tracks what it sent itself.
      - The app has no MIDI input, so `userPresetLights` gives a flagged
        step its second color and ignores presses — what the hardware shows
        until its DAW answers. The editor says so per step.
      - It reads 0 on all 1500 LED entries of both the factory dump and the
        owner's device, so no preset in evidence uses it.
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
    - **A held switch shows On, whatever its value**, and goes back to its
      value state when let go: a momentary light, not a state change.
      Owner-observed on factory D6 (SEQNC), whose sequenced CC Trigger,
      Program Change and Note steps light on press and dim on release though
      none is ever On by value when it shows (the model used to keep them dim
      throughout). Preset navigation keeps its roles while held, and a step
      following incoming MIDI isn't treated as held.
    - Unknown: Preset Select whose target is the current preset, and
      explicit colors on a Track/Transport selector. Also which step a held
      Sequence switch shows: the sequence pointer may already be on the next
      step, so a sequence with a different color per step would light the
      next step's color while held. D6 can't tell, since its steps share one.
  - `userPresetLights` applies that model to each showing step, lighting
    the indicator its LED num selects. Every light is RGB, legends
    included, so the step's own color is what shows; a legend's printed ink
    only decides how it looks when the *firmware* lights it for an assigned
    function (see `legendLights`).
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
`src/components/ui/` (Button, Tabs, Select, Tick, plus a static Badge). There's
no hover-only UI, for tablets.
- **The faceplate** (`src/ui/panel/Faceplate.tsx`) contains no per-switch
  or per-mode logic. It lays out `PACER_HARDWARE` and paints
  `computePanelState` through the generic `SwitchView`, which renders any
  switch's text/icon legend rows and bar from its spec.
- **The display uses a real 14-segment font**: DSEG14 Classic Italic
  (`src/assets/fonts/`, @font-face in `index.css`), which draws each
  character as the segments the hardware's module would light. It's
  keshikan's font under the SIL Open Font License 1.1, bundled with its
  license file; the italic cut matches the Pacer's slanted digits.
- **Shared style facts live in `index.css`, not repeated in components:**
  `--page-max` and `--faceplate-min` (the width the page stops growing at,
  and the one below which the faceplate scrolls), `--badge-overhang` with
  `.badge-room`, and `.ring-focus`, the focus ring.
  - **Keyboard focus only**: `:focus-visible` and React Aria's
    `data-focus-visible`. Not `data-focused`, which RAC also sets for
    pointer focus — matching it painted a ring on every mouse click, which
    read as a stuck highlight.
  - **An outline, not a box-shadow.** A shadow shares its property with
    `shadow-sm` and friends, so the two overwrite each other, and it's
    painted with the element, so a later sibling's background covers it.
    Outlines are painted after everything else in the stacking context.
  - `.ring-focus-inset` draws it inside the control, for ones packed tight
    in a container: a segmented group's buttons sit in 3px of padding, so
    an outward ring spills onto its neighbours.
- **Tooltips go through `Titled`** (`components/ui/titled.tsx`). React
  Aria filters unknown props out of the DOM, so `title` set on any of its
  components never reaches the element; a `display: contents` wrapper
  carries it without joining the layout, and still works on a disabled
  control, whose `pointer-events: none` would swallow its own tooltip.
- **`palette.ts`** is the only place semantic colors become CSS.
  **`icons.tsx`** holds our own SVG icon drawings.
- **Hints** are drawn as teal italic annotations below each switch, visibly
  distinct from the printed legends.
- **Layout is a CSS grid** (`ui/panel/Faceplate.tsx`): two rows of six
  cells, each a switch with its hint and printed marking beneath it, so
  every element sizes itself from its content and anything that grows (Edit
  mode's badges, a longer hint) has somewhere to go. Text scales with the
  panel through container-query units (`cqw`), not the viewport.
  - This replaced an SVG background with the switches positioned over it as
    percentages of a hand-built coordinate system (WIDTH/HEIGHT, column
    pitch, per-row offsets). Every box was computed, which is what made
    overhanging badges clip and raise scrollbars.
  - Each switch is still a real HTML `<button>` with its artwork in an
    inner SVG (`SwitchView`), and the glow filters live in one place
    (`FaceplateDefs`) so they also apply to the editor's live control,
    which renders outside the faceplate.
- **Press handling:** all presses, including the rear-jack buttons, go
  through React Aria's `usePress` (`react-aria`), not hand-rolled
  pointer/focus code.
- **Why not SVG elements:** `usePress` only ends a touch long-press (no
  click on iOS/Android) for `HTMLElement` targets.
- **Tap vs. hold on [Preset]:** decided by the device machine's timer, not
  the UI.
- **Touches may pan** (`touch-action: pan-x pan-y` on the faceplate and the
  rear jacks), so a phone can scroll a faceplate wider than its screen and
  scroll the page across rear jacks that fill it. It was `touch-none`, which
  made both impossible by touch alone (found by the owner on a phone). A tap or
  a finger held still still reaches the switch; one that moves scrolls.
- **A drag to scroll is never a press** (owner's rule; `ui/useSettledPress.ts`).
  A touch acts only once it has settled: still for `TOUCH_SETTLE_MS` (150ms) it
  goes down, lifted sooner it's a tap (down and up together), and moved, the
  browser scrolls and cancels it, so nothing fires. Mouse, pen and keyboard go
  down at once. In Program mode a switch opens on a completed press (`onTap`),
  never on press start, by touch or by mouse. Before this, presses acted on
  touch start, so a swipe across the faceplate sent the switch it started on,
  or opened it for editing. The [Preset] hold runs from the settle, so by touch
  it's 2.15s.
  **`pnpm check:touch`** (`scripts/touch-check.mjs`) drives a 390px phone by
  touch in headless Chrome and fails if either swipe stops scrolling, a tap or
  the [Preset] hold stops working, or a drag that starts on a switch or its
  pencil presses it or opens it. jsdom can't scroll, but `Faceplate.test.tsx`
  checks the settle rules with pointer events and a cancel.
- **Phone and tablet widths** (measured, 2026-10-20): the faceplate shrinks to
  640px (`--faceplate-min`), so it fits any tablet and scrolls on a phone (owner's
  call). The switch editor keeps its close button top right at every width; the
  top bar puts the configuration and modes on a second row below 1280px; the
  map may zoom out to 0.3, so it fits a phone.
- **Programming interface (first slice):**
  - **Play/Edit** switch in the header. In Edit mode, tapping a switch
    (or a rear-jack control) selects it for editing and fires nothing;
    [Preset] does nothing. Every programmable control gets a pencil badge,
    overhanging its bottom-right corner with a shadow so it reads as an app
    affordance rather than part of the hardware (and so it's clear what can
    be tapped, and that [Preset] can't). Clicking the badge opens the
    control, including the part that overhangs: inside a control that's
    already a button it's a plain element that takes pointer events, and
    where the control isn't a button (an expression pedal) the badge is one
    itself. [Preset] gets the counterpart — a struck-out pencil in red —
    and is disabled outright in Edit mode, so it neither highlights nor
    responds. The badges say what's editable, so the faceplate has no edit
    outline; a badged band sits under it. How far a badge overhangs is one
    value, `--badge-overhang` in index.css: the badge offsets itself by it
    and `.badge-room` keeps that much space, in both modes, so nothing is
    clipped and switching raises no scrollbar.
    Entering Edit mode clears the selected control: it starts at the
    faceplate rather than on whatever was last pressed in Play mode.
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
    - Step cards stack vertically, each spanning the width, so its fields
      lay out wide and its two color grids sit side by side (container
      query).
  - **The preset's name** is edited on the display itself: in Edit mode the
    display takes a pencil badge, and tapping it puts a caret in the name,
    nothing more.
    - **The readout and the field are the same element in both modes**, an
      `<input>` that's read-only until you open it, so there's nothing to
      position or keep in step. Both display lines are styled by one class,
      `.display-line` in index.css, which carries the segment font, size,
      letter spacing, color and glow, sized in container units relative to
      the display module.
    - The display was SVG text with the field overlaid on top; matching
      their metrics by hand made the name jump larger and land on the wrong
      line. Now it's HTML in normal flow.
    - The input's value isn't document text, so the display's accessible
      readout is an `sr-only` line inside its `aria-live` region; the
      visible lines are `aria-hidden`.
    - **Validated** by `checkPresetName` (`src/pacer/editing`), which
      separates what the Pacer can't store from what it merely might not
      show: more than 5 characters or anything outside printable ASCII is
      an error and the rename is refused; a character no Pacer name has
      ever used (its own names are A-Z, 0-9, space and -) is a warning and
      goes through. Names are stored uppercased, since no dump has ever
      held a lowercase one.
  - **The control being edited is also rendered live** beside its settings
    (`ui/editor/LiveControl`): pressing it runs the simulator exactly as in
    Play mode — MIDI goes out, its lights follow, the log records it — so
    you can try what you're editing. `useControlPress(id, { live: true })`
    opts out of Edit mode's press-free behavior. Pressing it does whatever
    the control does, including changing preset if it's a Preset Select.
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
      (`PACER_WRITE_SETTLE_MS`; pull, read-back and the identity query are
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
    - **Confirmed: the switches run the new Current right away.** Writing
      a preset into idx 0 changed what the loaded switches send and how
      they light, with no reload (1.01.12, the LED-feedback experiment).
    - Front-panel edits go to Current too: they only reach a preset slot
      through the device's own Save -> Store, so an experiment run from the
      panel is discarded by reloading the preset.
    - Not yet observed: that `0x1E` counts from A1 = 0 for presets other
      than A1. So far the Pacer has only been seen on A1.
  - Not built yet: preset load-time MIDI settings,
    expression pedal ranges beyond step data, and copy/paste of
    steps/switches.
- **The editor changes a state, not a preset** (`store/editingSlice.ts`,
  `ui/editor/useEditTargets.ts`). A state can be several presets, the map
  draws them as one thing, and opening one from there to change it alone is
  how a state quietly comes apart — so everything the editor does goes
  through `applyPresetEdit`, which applies the change to every preset the
  current one behaves like, as **one undo step**. Keeping copies in step by
  hand is the work this project exists to remove; doing it here means the
  editor never has to know it's editing a state.
  - **Except where a jump goes.** A step's destination is the one thing the
    presets of a state are allowed to differ on — it's the return address,
    and the only thing that tells the copies apart (`analysis/states.ts`) —
    so `data` on a Preset Select or Inc/Dec step is written to the preset in
    front of you, and the step card says so. Everything else about that
    step (its type, channel, whether it's active, its LED) is shared, which
    is what stops an edit splitting the state by accident.
  - **The display says so too**: while an edit reaches every preset of a
    state, the number line reads `x2` rather than naming one slot, since
    naming one would be a lie about what's about to change. The hardware
    would never show this — it's the app saying what it's about to do, in
    the place you'd look to find out.
  - `editScope` narrows it to the one preset, which is the deliberate way
    to make a copy differ. The control appears in Program mode's context
    bar only while the current preset has siblings (`EditScopeControl`),
    and not on the map, where a route belongs to the state whatever this
    says. It resets with the session.
  - The preset panel says which it is: "D5 is one of 2 presets that behave
    alike — LOOPR on the map (C1, D5). Changes here go to all of them…".
- **Sessions:** loading a configuration (opening a snapshot, importing,
  pulling) starts a fresh simulator session.
  - `freshSession` in the store rebuilds all per-session state, and the
    device mode machine is restarted. The same function builds the initial
    state, so nothing is patched field by field.
  - The simulator views are keyed on `sessionId`, so React remounts them
    and no component state (a held press, the inspector tab) survives the
    switch.
- **Layout** (`src/App.tsx`): the header and context bar stay put and
  everything below them scrolls in one container, `.app-scroll`, whose
  scrollbar gutter is always reserved. The faceplate scales with the width
  available to it, so a scrollbar appearing used to narrow it: switching
  to Program mode, which adds a band and the preset panel, made the
  hardware visibly resize. The gutter has to live on a scroll container of
  its own — Chrome honours `scrollbar-gutter` there but not on the
  viewport, where the page used to scroll.
  - The faceplate spans the full width as the
  overview, since it's wide and is what you point at. Programming is a
  drill-in: in Edit mode, tapping a switch replaces the faceplate with that
  control's editor across the whole width (`ui/editor/SwitchEditorView`),
  with a switch picker in its header so you can move between controls, and
  a Close that returns to the faceplate. The preset's name field sits with
  the faceplate, since it belongs to the preset rather than a switch.
  - Rear-jack controls sit with the faceplate (they're hardware, not a
    panel), rendered by the same `ui/panel/RearControl` the editor's live
    copy uses, so a control looks the same in both places.
  - **Choosing a preset happens on the display** (`ui/PresetChooser`),
    whose lower half — the preset number, which is where the preset lives
    on the hardware — opens a popover laid out as the hardware's own 4x6
    banks. Its badge takes the display's bottom-right corner, the same
    place every other programmable control carries one, so the faceplate
    keeps a single habit. The name line keeps the upper half for renaming,
    which is why renaming lost its full-display overlay and became a badge
    of its own — a smaller one, level with the name and just clear of its
    last character, since it belongs to that line rather than to the
    display as a whole.
  - In the switch editor the faceplate isn't on screen, so its header
    leads with the same chooser as a breadcrumb: `A1 PRGM1 › Stomp 1`.
    That also fills a gap — the editor never used to say which preset the
    switch it's editing belongs to.
  - **Two arrangements**: *by bank* is where the presets live, the order
    printed on the Pacer; *by state* groups the ones that behave alike, the
    way the map draws them, with the rest under "one preset each". Neither
    is a view of the other, so both are offered. In bank order a preset
    that shares a state carries a `×2` badge naming its siblings.
  - The popover marks which presets you've edited since opening the
    configuration (a filled dot) and which the Pacer hasn't been given yet
    (a hollow one). **Each mark says what it means** — a tooltip, and a
    legend under the grid naming only the marks in play. A glyph is a riddle
    on its own: being asked what the turquoise circles were is the answer to
    whether one explains itself — both from `changedPresets` against `savedConfig` and
    `sendBaseline`. The Current slot is listed separately, since it's the
    device's working copy rather than a front-panel preset. This retired a
    tab that showed the same 24 slots and nothing more; the faceplate's
    hold-[Preset]-bank-number path is still the hardware's own way.
  - What's left below is the output log, on its own: the preset chooser,
    the device drawer and the preset panel took the other tabs, and a
    strip with one tab in it is just a heading that can be clicked.
- **Browser navigation** (`ui/appHistory.ts`), without a router — the app
  has no URLs to speak of, but it has places, and Back used to leave it
  entirely because nothing was ever pushed.
  - A place is the mode, the control opened for programming, and whether
    the device drawer is showing. Each change pushes an entry; the first
    load replaces rather than pushes, so arriving costs nothing.
  - **The selected control counts only in Program mode.** While
    simulating, the same field just remembers the last switch pressed, so
    counting it would push an entry per press and make Back an undo of the
    performance. The loaded preset is excluded for the same reason: a
    Preset Select step changes it without anyone navigating.
  - In-app closes (the editor's ✕, the drawer's dismiss) go through
    `goBack`, so they land on the entry they came from instead of pushing
    a new one that Back would then reopen. It falls back to closing
    directly when the current entry isn't one of ours — on a fresh load,
    going back would leave the app.
  - The push effect skips when the store already matches `history.state`,
    which is what stops a Back from immediately re-pushing what it undid.
  - **A preset's own settings sit with the faceplate in Program mode**
    (`ui/PresetPanel`): the MIDI it sends when it loads, read-only for
    now. It's preset-level config, like the name edited on the display, so
    it doesn't belong inside a switch's editor and drilling into one
    leaves it behind. This replaced an Inspector tab whose per-control
    step table the editor had made redundant; the part worth keeping was
    this, which nothing else showed.
  - `ui/FirmwareModeNote` says when the firmware has taken the panel over
    (preset select, Track, Transport), since those presets aren't in the
    config and the faceplate would otherwise look like a preset whose
    switches can't be found anywhere.
  - **The device and its snapshots live in a drawer** (`ui/DeviceDrawer`):
    pulling, importing, the Pacer's MIDI ports, the firmware check and the
    saved configurations. All occasional, so none of it holds permanent
    space. Two ordinary buttons open it — the configuration's name, and
    the device status — because a status chip that turns out to be
    clickable is a trap. `deviceDrawerOpen` is part of `freshSession`, so
    loading a configuration closes the panel that loaded it.
  - **The header's right slot is the device slot.** It asks for MIDI
    access, then becomes the Pacer's status in the same place, so the
    question turns into its answer instead of leaving a gap: `Pacer
    connected` or `No Pacer found`, by whether its ports are chosen.
  - **The two MIDI connections are named, not just separated.** Simulate's
    output reads "Simulated MIDI output", and stays visible before MIDI is
    granted so the idea is discoverable at all. An unexplained port picker
    next to a device connection gets read as the same thing.
  - This replaced a two-column layout that gave the bulk of the width to
    panels nobody interacts with and squeezed the editor into a 360-440px
    side column.
  - **This shell is itself due to be replaced** — see "Planned UI
    reorganization" below. Build toward that shape rather than extending
    the Play/Edit toggle and the tab strip.
- **The preset map** (`src/ui/map/`) draws the configuration as the machine
  its author meant: presets that behave alike are one node however many
  copies the hardware needed, and a route that leads each copy back where
  it came from is drawn as a return.
  - **One toggle**: *Show* (designed routes / everything) hides the plain
    next/previous stepping most presets carry. Routes are always editable —
    drag between states, click a route to change it — because the pencil
    already says which gesture opens a preset, and a mode for it was a
    switch nobody needed.
  - **`RouteDialog`** is the one form for one switch on one state: which
    switch, where it leads, and taking it away. It describes each switch in
    what it already does ("free", "sends 2 messages", "selects the Track
    preset", "goes back to where it was entered from", "depends on the way
    in") and shows `editRoute`'s refusals rather than writing something
    that won't survive.
  - **It only asks when the question is real.** A copy is needed for one
    reason (a switch that leads somewhere different per way in), so drawing
    a route *into* a state asks nothing. Once a state has two ways in, its
    switch is one of: always goes to one state; goes back to wherever it
    was entered from; or depends on the way in (a table, a row per way in).
    A switch that already leads elsewhere starts with nothing chosen and
    says so, so nothing is assumed. Entering a state whose switches depend
    on the way in asks where they lead from the new way in, defaulting to
    back. The defaults and answers are per switch: picking A after the
    dialog opened on a free switch has to raise A's question.
  - **Every answer is priced** by running the edit dry (`planRoute`): a
    picker per needed copy, "Copy of LOOPR for MAIN1",
    offering empty presets first and then ones it may clear (see "What it
    refuses"), and the presets it frees.
  - **Replacing what a switch does** is a tick-box in the same dialog, since
    on a real device nearly every switch is busy. It says what it would
    clear ("Replace what A does (selects the Track preset)") and applies to
    every preset the state is.
  - **Which switch carries a route is part of the route**, so the picker is
    there for an existing one too: choose another and it moves, giving up
    the one it was on in the same edit (`RouteChange.moveFrom`). A move to
    the same destination costs nothing — it's the same way in, and the copy
    it leads to is the one this route made.
  - **Clearing a preset** is in Program mode, on the preset's own panel:
    it's how the device gets a slot to spare, and the confirm says what it
    empties.
  - **Every node carries the faceplate's pencil**, on the bottom-right
    corner like every other programmable thing, and it opens that preset in
    Program mode (double-clicking the node does the same). The map is where
    a preset is easiest to find; Program is where it's changed. For a state
    of several presets it opens the one the simulator is on, or the first.
  - **A state of several presets says that instead of listing slots**:
    "2 presets · one state", with the slots in the node's tooltip. Which
    slots the copies landed in is the app's bookkeeping — a twelve-origin
    looper is twelve numbers nobody chose — and the same wording is used
    wherever states are listed (the route dialog's target picker).
  - **`StateDetails`** is where those slots are on show: clicking a state
    lists its presets under the map, each with the presets that enter it,
    and buttons to load it, program it, or **move it to another slot**.
    Moving takes the routes with it (`movePreset`), which is the part that
    can't be done by hand without missing one. Empty slots come first; the
    presets `clearablePresets` allows come after, and choosing one opens a
    confirm before it's cleared and moved onto as one undo step
    (`movePresetToSlot`'s `clearFirst`; `movePreset` itself still refuses a
    preset with something in it).
  - Edge labels are the marking alone — "C", "1", "3". The rear-jack
    switches lose the "FS": a badge has room for a character, and a number
    on its own reads as a switch.
  - **Returns are drawn**, dashed, to each state they can lead back to,
    badged `A↩`; a byEntry switch draws each of its destinations the same
    way. The "↩ A returns" note on the node stays too (the owner missed
    returns with only the note, and an edge alone doesn't say it's one
    switch), and clicking it opens the route — to stop returning, say,
    which frees the copies. ↩ carries U+FE0E, or the platform font draws an
    emoji tile.
  - **Badges are placed across the whole map** (`labelBoard.ts`): each edge
    offers spots along itself, and the board places designed routes, then
    dashed, then stepping, each at its first spot clear of the rest. A
    return runs back along the route that entered its state, so the two
    cross near their middles, and midpoint badges hid one another.
  - **Opening a route loads the preset it leaves from**, so the faceplate
    beside you is the one the route is on, and the panel below follows it.
  - **The map carries the editing controls** (`ui/editor/EditingBar`, which
    Program mode uses too): the same undo stack, unsaved badge, Save and
    Send. It reroutes presets, so it can't be the one surface with no way
    back. This is what "configuring the state machine is an editing layer
    on the map" means in the plan below — not a fourth mode.
  - **Layout** (`layout.ts`): the states the designed routes connect are
    ranked left to right by dagre; the rest are parked in banks of six below
    it. On a real device a design is a corner of the 24, so threading the
    other presets through the ranking pushes it off screen. A ring (every
    state connected, none a beginning) is laid out as banks throughout.
    - **Laid out by the designed routes only, in both views.** Next/previous
      stepping makes every preset entered from its neighbour; unless that
      closed into a ring, dagre strung all 24 out in one row, wider than
      the map can zoom out to. Everything now just adds faint edges to the
      same picture, and switching views doesn't rearrange anything.
    - **The view re-fits when the layout changes** (`FitOnLayoutChange`):
      React Flow's `fitView` only runs on mount, so an edit that moved
      states left them outside the view. Keyed on positions, not on what
      nodes show, so clicking a state doesn't undo the reader's panning.
  - **Edge geometry** (`edgePath.ts`). `StateNode` carries a handle on all
    four sides, and an edge uses the sides that face each other (above or
    below → top and bottom, beside → left and right). React Flow's stock
    node has one source and one target, so every back edge looped around.
    - **Every edge end that shares a side of a node gets its own point on
      it** (`spreadEnds`), ordered by where the edge goes so they fan out
      without crossing. Otherwise several routes into one state, or the
      two halves of a pair, met at one point and their arrowheads stacked:
      two routes read as one. Edges between the same two states also get
      their own bows (`bowOffsets`).
    - **`pnpm check:map`** (`scripts/map-check.mjs`) measures every edge
      the real app draws across configurations that have broken it before,
      in both views and after an edit, and fails on stacked heads, edges
      running together, overlapping badges, states outside the view, or
      the wrong number of dashed return edges. Add a configuration
      whenever the map draws something wrong.
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
    before each pull, and automatically as soon as both of the Pacer's
    ports are known — on connect, on a re-plug, or when they're chosen by
    hand. It's a read-only inquiry with nothing to confirm, so there's no
    button: the drawer simply shows what the device said.
  - A device that doesn't answer keeps an "Ask again" button beside the
    message, since the automatic inquiry only runs when the ports change.
  - It's skipped while a send or pull is running, because nothing may
    reach the Pacer while writes are settling. The reverse doesn't hold:
    an inquiry in flight is only listening, so it no longer blocks a send
    (it used to, which made connecting and immediately sending do
    nothing).
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
    built-in factory defaults are always listed, and export like any other
    row (the fixture's bytes as captured, `factoryDefaultBytes`), since
    they're the natural starting point for handing a dump to an AI.
  - The last-opened configuration is reopened on reload.
  - Raw bytes rather than the JSON mirror: they're canonical and lossless,
    and about 3x smaller, which matters because localStorage allows about
    5 MB (~25 dumps).
  - Edits are saved as new snapshots or over the open one (see Save
    above); sending to the device is separate (see Send to Pacer).
- **Bringing presets in from a file** (`editing/mergePresets.ts`,
  `ui/configurations/ImportPresetsDialog.tsx`): a `.syx` needn't be a whole
  dump — an AI asked for one preset writes one preset — and opening such a
  file as a configuration would leave it 23 presets short.
  - **Read the way the Pacer reads it: a message sets what it addresses and
    nothing else.** `mergePresets` writes each chosen preset over the one in
    the same slot, field by field, so a preset the file doesn't mention is
    left alone and so is a step or light that a mentioned preset's messages
    don't cover. Sending the file to a Pacer holding the configuration and
    bringing it in here come to the same thing.
  - **It's an edit, not a load**: one `applyEdit`, so it's undoable, unsaved
    until saved, and the presets it changed are what the chooser's dots and
    Send's "Changed" show. No new snapshot, no new session.
  - Only the 24 user presets. Current (idx 0) and global settings in the file
    are left out, as Send leaves them out.
  - Two ways in. **Import presets…** takes any file. **Import .syx** given a
    file that doesn't address all 24 presets (`PresetFile.whole`) opens the
    same dialog rather than a broken configuration.
  - **The dialog ticks the presets that would actually change**
    (`presetsMergeWouldChange`) and lists them first, so a whole dump an AI
    changed two presets of offers those two without anyone naming them. It
    can't know which the AI *meant* to change — there's no base to compare
    with — so a preset edited here since opening also differs and is ticked;
    the row says so, since that's the one case where bringing a preset in
    loses work.
  - The `import-presets` screenshot scene runs it in the real app on
    `fixtures/ai-looper.syx` and fails unless exactly A1 and C1 change.
  - **Tutorial 4 works this way**, and the walkthrough follows it with both
    of the AI example's files: the whole dump through Import presets…, and
    `fixtures/ai-looper-presets.syx` (only the 66 messages the example
    changed) through Import .syx. Both must come to the same A1 and C1.
- **Expression pedals are swept, not pressed**: a `BoardEvent` carries a
  `position` (0 = heel, 1 = toe) and a "move" phase, and where each pedal
  sits is device state (`BoardState.pedals`), not component state — a
  pedal's position is physical, so it survives preset changes and every
  view of that pedal agrees. The continuous types (MIDI CC, Pitch Bend,
  Channel Aftertouch) interpolate between the step's own min and max.
  - **Pitch Bend is 14-bit, the stored range is 7-bit.** A step's min and
    max are single SysEx bytes (0-127), but pitch bend carries two data
    bytes (LSB then MSB, 0-16383, centre 8192), so the firmware has to
    spread one across the other. Measured on 1.01.12 by sweeping a pedal
    assigned Pitch Bend: the 7-bit value becomes the **MSB with a zero
    LSB**, except at full scale, where LSB 127 goes out too so the top is
    exactly 16383 rather than 16256. 735 messages, MSB covering 0-127, no
    exceptions. `bendFrom7Bit` in `simulator/midiMessages.ts`.
  - The app used to put the 7-bit value straight into the 14-bit field, so
    a full sweep moved under 1% of the range, all of it below centre. The
    test that covered it used `[0, 0, 16383]` — a step no dump could
    hold — which is why it passed. The
  UI renders them as sliders. A press or release still means toe or heel,
  so a pedal driven as a button behaves as before.
- **A preset's load-time MIDI is simulated** (`simulator/presetLoad.ts`):
  recalling a preset fires the messages stored with it, in slot order,
  before anything else the new preset does. They're recorded in the
  remembered values like any other message, so a load-time Program Change
  lights a switch that sends the same program. Loading a *configuration*
  isn't a recall — `createBoardState` stays silent, so opening a file
  sends nothing.
  - Every path that recalls a preset goes through one store helper
    (`recallPreset`), so the firmware's preset select, returning from a
    DAW preset and the app's own jump can't diverge on this.
  - The byte layouts are the preset's own, from the User Guide's MIDI
    Configuration chart: a preset CC is (controller, value) where a step's
    CC Toggle is (controller, press 1, press 2). Crossing the two tables
    would send the wrong value, so there's a test for exactly that.
  - Assumed: a preset's Note setting sends note-on only. The guide gives
    it a velocity but no duration or note-off, and the hardware has no
    obvious moment to release it.
  - Not modeled: the guide's "Nektar DAW Control" setting type, whose byte
    we don't know. LED `midiFeedback` steps are modeled as far as they can
  be without a MIDI input path (see the LED model above).
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`.

### User docs (`docs/`)

The user documentation lives in `docs/` as Markdown, which GitHub renders as
it is, and is published as a website on softdoglabs.com (below). **The app
links to the site rather than carrying a copy** (`ui/DocsLink.tsx`, the
header's Docs link): one canonical page per topic, nothing to keep in step,
and nothing a search engine sees twice.
- **The site's address is written in two places**: `src/docsSite.ts`, which
  the app's Docs link and the VitePress config both read, and the Markdown URL
  of `reference/programming-the-pacer.md` in `guide/working-with-ai.md`'s
  prompt (an AI fetches it from there, so it has to be absolute). If the site
  moves, update both.
- **They're also built as a website** (`pnpm docs:build`, VitePress,
  `docs/.vitepress/config.ts`) for `softdoglabs.com/docs/pacer-programmer/`,
  into `build/docs-site/docs/pacer-programmer/`. The Markdown stays written
  for GitHub; the config adapts it rather than the other way round:
  - `README.md` pages become each folder's index (`rewrites`). That renames
    files but not links, so a markdown-it rule repoints `…/README.md` links.
  - Heading anchors are slugged GitHub's way (`githubSlug`). VitePress's own
    turns an apostrophe into a hyphen, which broke every `#…cant…` link.
  - The sidebar is read from `docs/README.md`'s Contents section, so the
    pages are listed and ordered in one place. Add a page there and it's in
    the sidebar.
  - Every page gets a canonical URL on softdoglabs.com, there's a sitemap,
    and the raw `.md` files are copied out at their repository paths, so an
    AI can be pointed at the Markdown on the site.
  - `scripts/docs-site-check.mjs` runs after the build (and in CI): every
    link, image and `#anchor` on every built page must resolve the way the
    Worker will serve it. `docsLinks.test.ts` checks the same links as GitHub
    shows them; this one checks what VitePress made of them.
 (one page per part of the app, each
  led by an annotated screenshot, plus troubleshooting and a glossary),
  `guide/` is short task pages, `tutorials/` builds the looper from factory
  defaults, and `why-a-state-machine.md` is the rationale. `README.md` is the
  entry point the app links to.
- **The intro lives in three places on purpose**: the repository's
  `README.md` (what GitHub shows first, which also points to the guide),
  `docs/README.md` and `docs/guide/README.md` all open with the same text and
  the simulator screenshot, so each still makes sense on its own, including
  the guide built and hosted away from GitHub. Edit all three together (only
  the relative paths differ). The repository's README alone puts a link to the
  live app above it (owner's call), since that's the page people land on from
  GitHub.
- **So does the "Not Affiliated with Nektar" section**, word for word, at
  the end of the same three pages and for the same reason: a page hosted on
  its own still has to say it. Edit all three together.
- **Screenshots are generated**, never hand-made: `pnpm docs:screenshots
  [scene]` drives the real app in headless Chrome
  (`scripts/docs-screenshots.mjs`). MIDI is staged with the test suite's
  fakes, including a Pacer that answers the identity inquiry and a full pull.
  The tutorial scenes build their configuration with the same editing and
  authoring functions the UI calls, so each picture is what following the
  steps produces. Re-run a scene after changing the UI it shows.
- **The tutorials are walked, not just pictured**: `pnpm docs:walkthrough`
  (`scripts/docs-walkthrough.mjs`) follows tutorials 1-4 click by click in
  the real app, finding controls by the words the text uses, asserts what
  each step says you'll see, and compares the result with the configuration
  the screenshots were built from. Run it after changing the editor or the
  tutorials; it's how a step that no longer matches the UI gets caught. The
  browser plumbing both scripts share is `scripts/docs-browser.mjs`.
  - **It's a hand transcription of the tutorials, not a reader of them**,
    by choice: reading the markdown was judged overkill while edits keep the
    two in step. So **when a tutorial changes, change the walkthrough with
    it** (and vice versa). It catches the UI drifting from the docs; it can't
    catch the docs drifting from it. The data the tutorials state lives in
    four places that must agree: tutorial 1's switch/CC/colour table, the
    walkthrough's `LOOPER`, `loadLooperTutorial` in `docs-browser.mjs`
    (which the screenshots are built from), and `docs-ai-example.mjs`. The
    labels the text tells you to click are typed into the walkthrough, and
    its `r.at(...)` step names match the tutorials' section headings word for
    word.
  - Tutorial 4's AI step is played by `scripts/docs-ai-example.mjs`, which
    writes `fixtures/ai-looper.syx` from the format page alone (no app code);
    the walkthrough exports the factory defaults through the real button,
    imports that file through the real file input, and finishes the tutorial
    on it. If Programming the Pacer gets something wrong, this is where it
    shows.
  - The guide's examples are tests: `store/__tests__/guideExamples.test.ts`,
    each quoting the sentence it checks.
- **Voice**: conversational, in the owner's own voice, with "you" for the
  reader and contractions. "I" and "my" only for motivation (why the app
  exists, how the looper problem came up); the examples themselves stay
  generic: "a Quad Cortex", "the looper in these docs", never "my Quad
  Cortex". Avoid the AI tells: em dashes (keep them to quoted UI
  text and the odd one), "not X, it's Y" contrasts, bold-led bullets,
  reflexive triads, and summing-up closers. Don't invent anecdotes for him.
  Headings, and the page names in contents lists and indexes, are in title
  case (articles, short conjunctions and prepositions lowercase unless first,
  last or after a colon); links in running prose stay in prose case.
  The front page leads with both halves of the app, the simulator (try a
  change against real MIDI without sending to the Pacer) and the state
  machine, with the `simulator` scene's screenshot.
- **Checked by tests**: `src/test/docsLinks.test.ts` fails on any relative
  link or `#anchor` in `docs/` that doesn't resolve (GitHub's slugging), and
  `protocol/__tests__/docsExamples.test.ts` decodes every byte example in
  Programming the Pacer. Links name the page (`tutorials/README.md`), never a
  folder: GitHub shows a folder as a file listing first, and the test refuses
  one.

### Running locally

```
pnpm install
pnpm dev
```

Opens the Vite dev server. MIDI needs a browser with Web MIDI and SysEx; the
docs and the app say just that and **don't name browsers**, since any list
would be incomplete and go stale. The simulator works with no hardware
attached; connecting a real Pacer over USB enables live send/receive against
the device.

### Deploying

The build is static files (`pnpm build` → `dist/`), served at
`pacer-programmer.softdoglabs.com` by a Cloudflare Worker that only serves those
files and runs no code of its own (`wrangler.jsonc`, `pnpm deploy:app`). Static
asset requests are free on Cloudflare's free plan.
- **One address only**: `workers_dev` is off. Saved snapshots live in
  localStorage, which belongs to one origin, so a second address (as Pages'
  `*.pages.dev` always is) would hold a second, separate library. Chosen over
  Pages for exactly this.
- **Pull request previews** (owner's call, 2026-10-20): `preview_urls` is on
  for both Workers. A pull request from this repository has its branded app
  and docs uploaded as versions (`wrangler versions upload --preview-alias`),
  which doesn't touch the live site, at workers.dev addresses that stay the
  same for the life of the pull request. CI comments them on the pull request
  only when they differ from the last comment it left (found by a hidden
  marker). Fork pull requests get no secrets and so no preview.
  - **The alias can't be worked out from the number**: `pr-<n>-<16 hex>`, an
    HMAC of the number keyed by the `PREVIEW_KEY` secret
    (`scripts/preview-alias.sh`). Without the secret there's no preview rather
    than one at `pr-<n>`.
  - **This hides less than it sounds in a public repository**: the preview
    comment is as public as the pull request, so anyone reading it has the
    address. What the key stops is listing every preview by counting up
    numbers. In a private repository, where the comment is private too, it's
    what keeps a preview private.
  - **Nothing removes a preview**: Cloudflare has no way to delete an alias,
    and keeps the 1000 most recently deployed. A closed pull request's preview
    stays up at its address (owner's call: that's fine).
  - Only `wrangler deploy` applies `preview_urls`, so a new Worker needs one
    deploy from main before its previews have addresses. They also need the
    account's workers.dev subdomain.
  - Every version, live ones included, gets a workers.dev address of its own.
    Nothing links to them, and each is a separate origin with an empty library.
  - Previews are public to anyone with the address. The app's are kept out of
    search results by a hostname rule in `public/_headers`
    (`https://:version.:subdomain.workers.dev/*` → `X-Robots-Tag: noindex`),
    which the live hostname doesn't match; tested with `wrangler dev
    --local-upstream <host>`, since a Host header alone isn't matched locally.
    The docs' pages name their softdoglabs.com address as canonical instead.
- **Response headers are in `public/_headers`**, which Vite copies into `dist/`
  and Cloudflare reads rather than serves. Its content security policy allows
  the app's own origin, `data:` for the assets Vite inlines, the inline styles
  libraries set, and two analytics services (owner's call, 2026-10-20):
  Cloudflare Web Analytics, whose beacon Cloudflare injects into the page, and
  Google Analytics 4, by the hosts Google lists. The app doesn't load GA itself
  yet. Checked by loading the built app under `wrangler
  dev` in headless Chrome with no violations; check again after adding anything
  loaded from elsewhere. `/assets/*` is cached for a day (content-hashed
  names; to become a year once it's confirmed whether a deploy keeps the
  previous one's files reachable); `index.html` is always revalidated.
- Node and pnpm are pinned (`.node-version`, `packageManager`), so CI builds what
  builds locally. pnpm refuses packages published within about a day (its
  minimum release age policy), which is why `wrangler` sits a release behind.
- **CI** (`.github/workflows/ci.yml`) is four jobs. **Checks** (lint,
  typecheck, format check, tests and both builds, neutral) and **Branded
  checks** (the tests and both builds with the brand kit) run side by side on
  every push and pull request, and are the checks a pull request must pass.
  Then **Deploy** (main) or **Preview** (a same-repository pull request) runs
  the branded build Branded checks saved as an artifact, so what goes out is
  exactly what was tested.
  - Job conditions can't read secrets, so Branded checks publishes only
    `true`/`false` for what may run, plus the preview alias (an HMAC, not the
    key, and posted in the PR anyway). Deploy and Preview read the secrets
    themselves, into the one step that uses each. The artifact is what the site
    serves anyway, kept a day.
  - Deploy is skipped (with a notice) until the repository has the
    `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, and only the
    wrangler steps are given the token, so no install script can read it.
  - Never `pull_request_target`: it gives fork PRs this repository's secrets. Deploys use
  the pinned `wrangler` from the lockfile rather than the Wrangler action.
  Checked with actionlint. The docs walkthrough and `check:map` need Chrome and
  aren't in CI yet.
- To do once deploys are live: check whether an old bundle URL still loads after
  a redeploy. If it does, raise `/assets/*` to a year.
- **The docs are a second Worker** (`wrangler.docs.jsonc`, `pnpm deploy:docs`)
  on the route `softdoglabs.com/docs/pacer-programmer*`: a path of the main
  site's own domain, which is what lets the docs count toward softdoglabs.com
  in search. The main site is deployed from its own repository and owns
  everything else there; it needs to do nothing for this path beyond linking
  to it. Served as it's built (clean URLs, folder redirects, its own 404, the
  raw `.md` as `text/markdown`), checked under `wrangler dev`.
  - CI deploys it on every push to main, like the app. The route only catches
    requests for a hostname whose DNS record is proxied, so softdoglabs.com
    needs one even before the main site exists (an `AAAA 100::` placeholder).
  - Not yet confirmed: that the route wins over the main site's Pages custom
    domain for that path. Test it on the first deploy.

### Branding (`src/brand/`, `TRADEMARKS.md`)

The code is GPL; the Soft Dog Labs brand isn't, and is kept out of the
repository so no fork receives a copy of it. `TRADEMARKS.md` says so, and the
README's license section states it as an added term under GPLv3 section 7(e),
which allows declining trademark rights. Not reviewed by a lawyer yet.
- **Every build credits the maker** (`maker.ts`): "by Soft Dog Labs", linking to
  softdoglabs.com, beside the app's name (`AppTitle`) and in the docs'
  footer. A branded app shows the kit's lockup in place of the words, still
  linking there. It's an author's credit, so it's code, branded or not (owner's call).
  The link opens a tab of its own (leaving would drop unsaved edits) and is
  `rel="noopener"` without `noreferrer`, so the visit is seen to come from here.
- **The brand's look comes from the kit**, the private `softdoglabs/brandkit`
  repository, when `PACER_BRAND_DIR` names a checkout of it (locally,
  `PACER_BRAND_DIR=../brandkit`). It's read as the kit lays it out
  (`KIT_FILES` in `vitePlugin.ts`), with no manifest of ours in it; a file it
  needs that's missing fails the build, so a deploy meant to be branded can't go
  out neutral. Without it: the neutral `public/favicon.svg` and VitePress's
  stock theme.
  - **The lockup, not the bare mark** (owner's call, 2026-10-20): the
    horizontal lockup, a divider, then "Pacer Programmer", in the app's header
    and the docs' nav. The lockup is 40px high, so its name can be read, with
    its built-in clear space (40 of 300 units each side) overlapping what's
    around it. On dark it's the kit's `dark-transparent/` version: the plain
    `dark/` one has a navy box baked in. The docs' sidebar is widened to 352px,
    since their title column is the sidebar's width.
  - The app also gets the navy app icon as favicon and home-screen icon, and
    the kit's dark navy palette under its own tokens (`src/brand/app.css`, via
    `virtual:brand-app.css`): page, panels, lines, text, and the preset map's
    canvas. **Teal stays** (Nektar's colour, the Pacer's own; owner's call),
    and so does the faceplate's hardware look. The plugin sets
    `data-theme="dark"` on the page, which both picks the kit's dark tokens
    and lets the mapping outrank `index.css` regardless of order.
  - The docs get both lockups (light and dark), the icons, and the kit's
    colour tokens and fonts, mapped onto VitePress's variables by
    `docs/.vitepress/theme/brand.css` (`virtual:brand-docs.css`, empty when
    neutral). The display face is all caps, so it's only the page titles.
  - The kit's tokens follow the OS unless `data-theme` on `<html>` says
    otherwise; the docs theme sets it from VitePress's light/dark switch. Its
    `sdl-theme-*` classes are for sections and lose to its dark-OS rule on the
    root, which is how a light choice on a dark OS first stayed dark.
  - **The docs' nav title is two links** (`docs/.vitepress/theme/NavBarTitle.vue`,
    swapped in for VitePress's `VPNavBarTitle` by an alias in the config): the
    lockup goes to softdoglabs.com, as in the app, and the name to the docs'
    front page. VitePress's own is one link around both.
  - **On a phone the dog mark stands in for the lockup** (below 480px, owner's
    call): the lockup, the name, search and the menu button don't fit in one
    bar, and the bar used to push the menu button off screen and scroll the page
    sideways. Measured from 320px up with `document.documentElement.scrollWidth`.
  - **"Open the programmer"** is on every docs page, for whoever arrives from a
    search: a button in the top bar (`nav`, styled in `theme/site.css`), and on
    phones, where the top bar folds nav into a menu, one above the page
    (`theme/OpenAppPhone.vue`, in the `doc-before` slot).
  - **Links to softdoglabs.com need `target="_self"`.** The docs share its
    origin, and VitePress's router takes any same-origin link without a target
    for one of its own pages, so the footer credit used to open as a missing
    page inside the docs.
  - VitePress runs its own older Vite, so its plugin is cast to that Vite's
    type in the docs config; the hooks are the same. It writes its own page
    HTML, so the icons go in through `head`, not `transformIndexHtml`.
- **CI checks both builds and deploys the branded one**: the `branded` job
  checks out the kit with the `BRANDKIT_TOKEN` secret (a fine-grained token
  limited to the brandkit repository, Contents read-only; owner's choice over a
  deploy key) and runs the tests and both builds with it.
  Without the secret (fork pull requests, or before it's added) that job only
  says so; a deploy without it fails. It follows the kit's main branch.

## Planned UI reorganization (agreed, not built)

The current shell — a Play/Edit toggle in the header and a tab strip of
support panels — has no room for the analysis views still to come
(preset-transition graph, template hierarchy), scatters the two unrelated
MIDI setups, and spends a whole tab on choosing a preset. This is the
agreed target shape. Build toward it; don't add to the old shell.

**Why two MIDI setups, permanently.** They point in opposite directions:
the simulator sends *out to the rig* (one output port — a Quad Cortex, a
DAW), while programming talks *to the Pacer* over SysEx (an in/out pair,
auto-detected by name). The store has always kept them apart
(`midi.outputId` vs `pacerPorts`); only the UI mixed them. They could
merge only if the Pacer reported its own state back, and it doesn't (see
the LED model: even `midiFeedback` is CC-only and USB-only). So the app
permanently holds two models — what the simulator thinks and what the
device has — and the UI should say so rather than imply they're one.

**Top level: a horizontal mode bar**, each mode owning a context bar with
exactly the controls it needs. That split is what separates the two MIDI
setups without a word of explanation.

```
Pacer Programmer  [Factory defaults v]                 Pacer: connected
( Simulate | Program | Preset map | Templates )
Simulate:  [A1 . PRGM1 v]  Output -> [Quad Cortex v]  [Reset MIDI state]
Program:   [A1 . PRGM1 v]  [undo redo] [Save...] [Send...]  3 differ from device
--- main: faceplate / switch editor / graph / tree ---
--- dock: Output log | Inspector ---
```

- This replaces the Play/Edit toggle. "Connect MIDI" shows only until
  access is granted, then gives way to the per-mode port pickers.
- The "N presets differ from the device" chip needs no new machinery:
  `sendBaseline` + `changedPresets` already compute it. It makes the
  two-models problem visible instead of implied.

**The preset chooser**: one button (`A1 . PRGM1 v`) in every mode's
context bar, opening a 4x6 grid laid out like the hardware's banks, each
cell showing number and name, marked for *edited since opened* and
*differs from device*. About 40px of permanent chrome instead of a tab,
and it retires the Presets tab. The faceplate's hold-[Preset]-bank-number
path stays: that one is the hardware, and the chooser is an app shortcut.

**One current preset everywhere** (decided). Simulate, Program and the
analysis views all point at the same preset; clicking a node in the map
moves it, and hovering covers inspect-without-loading. No second
selection: a single current preset is what makes the faceplate preview
the edits.

**Device and library move to a drawer** behind the config name in the
header — pull, import, snapshots, Pacer ports, firmware check are all
occasional. The header's Pacer status chip opens the same drawer at the
ports. This retires the Configurations tab.

**The dock** keeps Output log and Inspector, open by default in Simulate
(the log is the point there) and collapsed in Program.

**The analysis views are peers, not panels.** Both are whole-config and
full-width, with no faceplate:
- *Preset map* doubles as navigation — at 24 presets a graph beats any
  list. Click a node to make it current, double-click to open it in
  Program. It's where the "looper active" grouping (Purpose #3) surfaces.
- *Templates* highlights the presets in a selected shared-config group.
- **Configuring the state machine is an editing layer on the map**, not a
  fourth mode: dragging from a switch on preset A to preset B writes a
  Preset Select step through the same `src/pacer/editing` functions and
  the same undo stack.

**Build order**: the mode bar and context bars first (everything hangs off
them), then the device drawer (which empties the tab strip), then the
preset chooser, then the analysis views.
- Done: the mode bar with per-mode context bars, the device drawer, the
  Inspector's split (its preset MIDI moved into Program mode, the rest
  removed), and the preset chooser.
- Next: the analysis views. The chooser's dots made the "N presets differ
  from the device" chip redundant, so that idea is dropped.

## Open questions

- **License: GPL-3.0-only** (`LICENSE`, the FSF's text; the notice is
  in the top-level `README.md`, and `package.json` carries the SPDX id).
  Version 3 only, not "or later" (owner's choice). The copyright holder is
  Soft Dog Labs, LLC. Every file under `src/` and `scripts/` opens with
  `SPDX-License-Identifier: GPL-3.0-only` and the copyright line, after a
  shebang or `@vitest-environment` line where there is one;
  `src/test/licenseHeaders.test.ts` fails on a file without them.
  Chosen because the protocol was first learned from the GPLv3
  `pacer-editor`, and because the app is a promotional tool rather than a
  product. The source will be published on GitHub
  (`github.com/softdoglabs/pacer-programmer`; private for now).
- Whether v1 needs to cover **global config** and **NP-1/expression
  pedal/relay** settings, or start scoped to the 24 built-in presets only.
- Framing/checksum/field layout is now verified against a real factory
  dump (see hardware background above); what's *not* yet verified is
  writing Global settings, and the
  Global-config field semantics (currently preserved opaquely, not
  decoded). Preset writes over Web MIDI are confirmed (see Send to Pacer).
- Licensing: `francoisgeorgy/pacer-editor` is GPLv3, the same licence
  this project has chosen, so compatibility is no longer a concern. We
  still describe the protocol from our own verified facts rather than
  porting its source — that's what makes `docs/reference/programming-the-
  pacer.md` our own work, and the thing to point an AI at.
- The exact algorithm for the preset-analysis engine (template hierarchy +
  transition-graph grouping) is unspecified beyond the goals above — worth
  spiking on a few real preset dumps before committing to one approach.
