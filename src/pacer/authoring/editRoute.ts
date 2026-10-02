import { SwitchMessageType, isUserPresetIndex, presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { machineOf, whatWasLost } from "../analysis";
import { clearControl, copyPreset, setJump, setStepType, updateStep } from "../editing";
import type { RouteChange, RouteResult } from "./change";
import { firstJump } from "./switches";
import { involved, planRoute } from "./plan";

/**
 * Points a state's switch at another state, on every copy at once — or takes the route away.
 *
 * `into` says which presets the copies in `planRoute`'s answer may take, in its order. A route
 * that needs none takes none.
 */
export function editRoute(config: PacerConfig, change: RouteChange, into: readonly number[] = []): RouteResult {
  const before = machineOf(config);
  const from = before.states.find((s) => s.id === change.fromStateId);
  const members = before.members[change.fromStateId] ?? [];
  if (!from || members.length === 0) return { ok: false, error: `There's no state "${change.fromStateId}" here.` };

  const plan = planRoute(config, change);
  if (!plan.ok) return plan;

  if (plan.copies.length !== into.length) {
    const name = before.states.find((s) => s.id === change.toStateId)?.name?.trim() || change.toStateId;
    return {
      ok: false,
      error:
        plan.copies.length === 0
          ? "That route needs no presets of its own."
          : `"${name}" comes back to wherever it was entered from, so entering it from here needs ${plan.copies.length} more preset${plan.copies.length === 1 ? "" : "s"}. Say which.`,
    };
  }

  // Nothing a copy could take: the presets this route runs between, and the ones whose own routes
  // are being pointed at copies.
  const reserved = involved(before, [change.fromStateId, change.toStateId]);
  for (const copy of plan.copies) reserved.add(copy.entryFrom);
  for (const slot of into) {
    if (!isUserPresetIndex(slot)) return { ok: false, error: `${slot} isn't one of the Pacer's 24 presets.` };
    if (reserved.has(slot)) {
      return {
        ok: false,
        error: `${presetIndexToLabel(slot)} is one of the presets this route runs between, so a copy can't take it.`,
      };
    }
  }
  if (new Set(into).size !== into.length) return { ok: false, error: "Two copies can't go in the same preset." };

  /*
   * A press in the default mode fires every step but takes only the first jump it finds (the
   * engine warns about the rest). A route written after one would sit there and never happen —
   * most often behind the Track selector the factory set puts on switch A.
   */
  if (change.toStateId !== undefined && change.replace !== true) {
    for (const member of members) {
      const jump = firstJump(config, member, change.controlId);
      if (jump !== undefined && jump < change.stepNumber) {
        return {
          ok: false,
          error: `Step ${jump} on that switch already jumps somewhere, and a press only takes the first jump — a route on step ${change.stepNumber} would never fire.`,
        };
      }
    }
  }

  let edited = config;

  // Asked for: the switch stops doing whatever it did, on every preset the state is, and the
  // route is all that's left on it.
  if (change.replace === true) {
    for (const member of members) edited = clearControl(edited, member, change.controlId);
  }

  /*
   * The copies first, so the route has somewhere to lead. Each is the state as it already exists,
   * with its way back pointed at whatever enters this one — which is the only thing that tells the
   * copies of a returning state apart.
   */
  plan.copies.forEach((copy, at) => {
    const slot = into[at]!;
    edited = copyPreset(edited, copy.template, slot);
    for (const { controlId, stepNumber } of copy.returns) {
      edited = setJump(edited, slot, controlId, stepNumber, copy.entryFrom);
    }
    // A preset that was sharing the old copy now has one of its own, so its own switch follows.
    if (copy.repoint) {
      edited = setJump(edited, copy.entryFrom, copy.repoint.controlId, copy.repoint.stepNumber, slot);
    }
  });

  // Then the route itself: each preset the state is gets the same switch, leading to its own copy
  // when copies were made, or to the one preset the target state is when it needed none.
  const single = change.toStateId === undefined ? undefined : (before.members[change.toStateId] ?? [])[0];
  members.forEach((member, i) => {
    if (change.toStateId === undefined) {
      /*
       * Off and inactive, not merely inactive: an inactive step still counts towards what a preset
       * is, so a leftover Preset Select would keep two otherwise identical copies apart.
       */
      edited = setStepType(edited, member, change.controlId, change.stepNumber, "switch", SwitchMessageType.Off);
      if (change.stepNumber > 1)
        edited = updateStep(edited, member, change.controlId, change.stepNumber, { active: false });
      return;
    }
    edited = setJump(edited, member, change.controlId, change.stepNumber, plan.copies.length > 0 ? into[i]! : single!);
  });

  // Moved, not copied: the switch it used to be on gives it up in the same edit.
  const moveFrom = change.moveFrom;
  if (moveFrom && (moveFrom.controlId !== change.controlId || moveFrom.stepNumber !== change.stepNumber)) {
    for (const member of members) {
      edited = setStepType(edited, member, moveFrom.controlId, moveFrom.stepNumber, "switch", SwitchMessageType.Off);
      if (moveFrom.stepNumber > 1) {
        edited = updateStep(edited, member, moveFrom.controlId, moveFrom.stepNumber, { active: false });
      }
    }
  }

  const after = machineOf(edited);

  // Nothing lost but what this edit set out to change: the step on every copy, the step a moved
  // route left, and whatever was in the slots the copies took (see `whatWasLost`).
  const lost = whatWasLost(config, edited, {
    kind: "edit",
    steps: members.flatMap((presetIndex) => [
      { presetIndex, controlId: change.controlId, stepNumber: change.stepNumber },
      ...(moveFrom ? [{ presetIndex, ...moveFrom }] : []),
    ]),
    taken: into,
  });
  if (lost) return { ok: false, error: lost };

  /*
   * And the route itself reads back as the one asked for. This isn't a question of what was lost —
   * it's whether the edit did what it was asked — so it stays here rather than in `whatWasLost`.
   */
  const nowFrom = after.states.find((s) => (after.members[s.id] ?? []).includes(members[0]!));
  const route = nowFrom?.transitions.find(
    (t) => t.controlId === change.controlId && t.stepNumber === change.stepNumber,
  );
  if (change.toStateId === undefined) {
    if (route) return { ok: false, error: "That switch still leads somewhere afterwards." };
  } else {
    const landed = plan.copies.length > 0 ? into[0]! : single!;
    const lands = route?.to.kind === "state" ? (after.members[route.to.id] ?? []) : [];
    if (!lands.includes(landed)) {
      return { ok: false, error: `That route doesn't read back as going to ${presetIndexToLabel(landed)}.` };
    }
  }

  return { ok: true, config: edited };
}
