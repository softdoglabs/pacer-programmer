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
being re-derived from the presets it compiled to. That constrains the
authoring side more than the analysis: the editor must refuse to express
anything `presetStates` and `presetTransitions` can't read back. The
acceptance test is a round trip, `recover(compile(model))` equalling the
model, and it should be written before the compiler, not after.

If some authorable shape turns out not to be recoverable, the fallback is
a saved design document plus tools to merge states — but that reintroduces
the bespoke save format this project set out to avoid, and two things that
can drift apart (the Pacer's front panel can edit presets behind it). Only
if the round trip can't be made to hold.

**Slot arithmetic is a hard constraint, not a detail.** A state entered
from twelve origins costs twelve presets on top of the twelve originals —
the whole device. The compiler has to price a design before writing
anything and refuse one that doesn't fit, rather than compiling half of
it.

### The compiler (`analysis/machine.ts`, `analysis/recover.ts`)

A machine is states with a body (controls, minus navigation) and
transitions. A transition leads to a named state, or **returns** — back to
whatever entered this state, the action the hardware doesn't have, and the
reason a state ever needs duplicating.

`compileMachine` expands it into presets, one per (state, continuation):
- **Only states that return multiply.** A tuner reached from everywhere is
  one preset, because its behaviour doesn't depend on where you came from.
  A looper that returns needs one copy per distinct continuation, and a
  state entered *from* such a copy multiplies in turn — which is how three
  states on a diagram can cost more than 24 presets.
- It refuses rather than half-compiling: a design over budget, a returning
  state nothing enters, a body containing a navigation step (that would be
  a transition the model doesn't know it has).
- Slots are allocated deterministically, so compiling twice puts
  everything in the same place.

`recoverMachine` reads one back. A group of look-alike presets is a state;
a transition is a **return** when every copy leads back to whatever entered
it, and a fixed jump when every copy leads to the same state. Anything it
can't express becomes a `note` rather than a wrong answer.

**Two states are the same when they differ in nothing but where their
navigation leads** — the rule the recovery groups on, and therefore the
rule the model is held to. A state's *identity is its behaviour*, not its
name: two states may share a name as long as they do something different,
which matters on a five-character display. Names that repeat are still
qualified by their starting slot when ids are needed as keys, but that's
presentation, not identity.

**The invariant is checked, not assumed.** `compileMachine` recovers its
own output and refuses if it didn't get the same machine back
(`whatWontSurvive`). Hand-derived rules about what survives are guesses;
this is the property itself, and it costs one pass over 24 presets. What
it catches:
- Two states that behave alike apart from their navigation, which come
  back as one, because by the rule they *are* one.
**What the invariant actually demands is that the recovered machine
*means* the same thing, not that it has the same shape.** A return from a
state only one place enters comes back as a jump to that one place — and
with a single origin those are the same machine: recompiling what came
back produces the identical presets. It's allowed, and there's a test that
recompiles the recovered model and compares the presets. The two only part
company once a second origin exists, and a return is expressible and
recovers as one from then on.

An earlier version refused it on structural grounds, which conflated a
harmless restatement with a real loss and would have stopped a design
being built up one origin at a time. The verifier still compares
structure, with that one equivalence allowed explicitly; the recompile is
what justifies it.


### Putting a machine into a configuration that exists (`analysis/apply.ts`)

`compileMachine` builds its presets from nothing, which is the right thing
to reason about but not a thing you can send: a real configuration also
carries global settings, and usually presets the machine has no opinion
about. `applyMachine` writes the slots the machine occupies and leaves
everything else exactly as it was.

The invariant is then checked against the **merged** configuration rather
than the compiled one, because the presets around a machine change what it
means:
- A switch on an untouched preset that jumps into a copy gives that copy a
  second way in, and a return is only recognisable while each copy has
  exactly one.
- An untouched preset that behaves like one of the states joins it, giving
  the state a copy the machine never made and, if it returns, somewhere
  else to come back from. Refused first, naming the preset, because the
  symptoms it causes further down read as the design's fault.
- Whatever those presets already say on their own — an unreadable jump of
  their own making — is the user's business and isn't judged. Only notes
  about the machine's own slots refuse it.

**Plain stepping isn't an entrance.** Next/previous names a direction, not
a preset, so it says nothing about which state a press meant to reach, and
it doesn't count as entering one for the purpose of spotting a return. It
can't: every slot has neighbours and C/D step on nearly every preset, so
counting it would mean no state on a real device could ever be seen to
return — dropping a looper into the factory set would be refused. It's the
same distinction the map's "hide default stepping" filter draws.

**Neither is the Current slot** (idx 0). It's the device's working copy of
whichever preset is loaded, so its switches are a second copy of that
preset's, and every dump from real hardware has one. Counting it gave
everything the loaded preset leads to a phantom second way in, which is
precisely what stops a return being recognised — on the owner's device it
hid the return of the one hand-built looper there is. Found by running the
map on that dump, not by reading the code.

**Copies step to their own neighbours, and that isn't a disagreement.**
Two presets of the same state sit in different slots, so C and D lead to
different places from each — B6 from one, D4 from another. That's where a
copy happens to live rather than something the state does, so the slot is
left undrawn and unremarked. Calling it "copies that lead to different
states" made every multi-copy state on a real device unreadable the moment
it was created.


### The rules a machine is read by (`analysis/returns.ts`)

What enters a preset and what it means for a state to come back, written
once and used by recovery and authoring alike. They used to be written out
where each was needed, and two of the bugs found on the owner's device were
a fix reaching one copy and not the other.

- `presetEntrants` / `soleEntrant`: the presets that lead to one *by name*
  — not plain stepping, not the Current slot, not itself.
- `readsAsReturn`: every copy of a state leading back to the one preset that
  entered it. Never true of a single copy, deliberately.
- `wayBack`: the switches that carry a state's way back. **Two readings,
  named as such:** with copies, the returns the recovery found (settled);
  with one copy, the switches leading to something that enters it — the
  answer to "if it does come back, by which switch?", which is what lets a
  second way in *offer* to make it a return without the recovery claiming
  to know.

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

A new layer where `analysis` and `editing` meet, which neither may depend
on the other to reach. `editRoute` points a state's switch at another
state — on **every copy of it at once**, which is the part that can't be
done a preset at a time without the copies drifting apart. `switchUses`
says what each switch already carries, so a route lands somewhere it will
actually fire.

Refusals are checked, not guessed:
- **Entering a state that returns needs another copy of it**, with its own
  way back — a preset. That's priced rather than refused: `planRoute` says
  what a route would cost without writing anything, and `editRoute` takes
  the slots to put the copies in (`into`). A slot already in use can be
  chosen, and the presets the route itself runs between can't.
- **Whether a state comes back is a question only a second way in can
  settle.** While it's entered from one place, "comes back to wherever it
  was entered from" and "always goes to A1" are the same preset, and the
  dump doesn't record which was meant (the equivalence the verifier allows,
  above). So `RoutePlan.choice` reports the question and `RouteChange.
  asReturn` answers it: no is free and shares the preset, yes costs one.
  The answer starts at no, because it's the one that takes nothing.
- **Saying yes gives every origin its own copy.** A state shared by two
  presets can only lead back to one of them, so making it come back means a
  copy per origin: the preset that's there keeps the origin it already
  leads to, and the ones that have been sharing it get copies and have
  their own switches repointed (`NeededCopy.repoint`). That's the hand work
  this project exists to remove, and it's what turns a jump into a state.
- **One level deep.** A state that comes back *and* leads on to another
  state that comes back would need copies of that one too. The compiler
  refuses to write that shape at all — with the outer copies leading to
  different copies of the inner state, nothing says which of the two
  switches is the way back — so there's nothing to plan for.
- **Everything else is judged by recovering the machine before and after.**
  A return that no longer reads as a return refuses, and so does anything
  the recovery couldn't read afterwards that it could read before. Returns
  are what's worth guarding: nothing stores them — a copy returns because
  one preset leads to it and it leads back — so breaking one is invisible
  on the hardware.
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
    - Unknown: Preset Select whose target is the current preset, and
      explicit colors on a Track/Transport selector.
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
`src/components/ui/` (Button, Tabs, Select, plus a static Badge). There's
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
  it came from is drawn as a return on the node it leaves.
  - **One toggle**: *Show* (designed routes / everything) hides the plain
    next/previous stepping most presets carry. Routes are always editable —
    drag between states, click a route to change it — because the pencil
    already says which gesture opens a preset, and a mode for it was a
    switch nobody needed.
  - **`RouteDialog`** is the one form for both: which switch carries the
    route, where it goes, and taking it away. It describes each switch in
    what it already does ("free", "sends 2 messages", "selects the Track
    preset", "comes back to where it was entered from") and shows
    `editRoute`'s refusals rather than writing something that won't survive.
  - **A route that costs a preset says so and asks which.** When the state
    being entered comes back, the dialog names the cost and gives a picker
    per copy, listing the empty presets first and the rest as "in use —
    would be overwritten". When it's still an open question whether that
    state comes back (one preset, see the authoring notes), a toggle asks —
    "Comes back here" against "Always goes to A1" — starting on the free
    answer. Presets already sharing it are named, since they get copies too.
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
    and buttons to load it, program it, or **move it to an empty slot**.
    Moving takes the routes with it (`movePreset`), which is the part that
    can't be done by hand without missing one.
  - Edge labels are the marking alone — "C", "1", "3". The rear-jack
    switches lose the "FS": a badge has room for a character, and a number
    on its own reads as a switch.
  - **Opening a route loads the preset it leaves from**, so the faceplate
    beside you is the one the route is on, and the panel below follows it.
  - **The map carries the editing controls** (`ui/editor/EditingBar`, which
    Program mode uses too): the same undo stack, unsaved badge, Save and
    Send. It reroutes presets, so it can't be the one surface with no way
    back. This is what "configuring the state machine is an editing layer
    on the map" means in the plan below — not a fourth mode.
  - **Layout** (`layout.ts`): the states the drawn routes connect are ranked
    left to right by dagre; the rest are parked in banks of six below it.
    On a real device a design is a corner of the 24, so threading the other
    presets through the ranking pushes it off screen. A ring — every state
    connected and none of them a beginning, which is the whole factory set
    with stepping shown — is laid out as banks throughout, since there's no
    direction to read it in.
  - **Layout drives the geometry**: it says which way each node faces, and
    `StateNode` carries a handle on all four sides so an edge meets the
    side it's travelling towards. React Flow's stock node has one source
    and one target, so every back edge — which is every return — left the
    far side and looped around, arriving at a slant with its head under the
    node.
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
    built-in factory defaults are always listed.
  - The last-opened configuration is reopened on reload.
  - Raw bytes rather than the JSON mirror: they're canonical and lossless,
    and about 3x smaller, which matters because localStorage allows about
    5 MB (~25 dumps).
  - Edits are saved as new snapshots or over the open one (see Save
    above); sending to the device is separate (see Send to Pacer).
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

### Running locally

```
pnpm install
pnpm dev
```

Opens the Vite dev server. Requires a Chromium-based browser (Chrome, Edge,
Opera) for Web MIDI + SysEx support — Firefox/Safari support is
inconsistent. The simulator works with no hardware attached; connecting a
real Pacer over USB enables live send/receive against the device.

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
