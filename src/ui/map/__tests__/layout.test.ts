import { describe, expect, it } from "vitest";
import { layoutStates, type LayoutInput } from "../layout";

const node = (id: string, leadsTo: string[] = [], isEntry = false): LayoutInput => ({ id, leadsTo, isEntry });

describe("laying out a machine", () => {
  it("puts a design's beginning on the left and what follows to its right", () => {
    const placed = layoutStates([node("main", ["looper"], true), node("looper", ["main"]), node("tuner", [], false)]);
    const x = Object.fromEntries(placed.map((p) => [p.id, p.x]));
    expect(x.main).toBeLessThan(x.looper!);
    // Nothing leads to the tuner from the entry, so it starts a column of its own rather than
    // being stacked on top of the beginning.
    expect(placed.find((p) => p.id === "tuner")).toBeDefined();
  });

  it("doesn't loop forever on a state that returns to where it came from", () => {
    const placed = layoutStates([node("a", ["b"], true), node("b", ["a"])]);
    expect(placed.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("lays a ring out as banks, since there's no beginning to read it from", () => {
    // The factory set: every preset steps to its neighbours, so nothing is an entry and layering
    // by depth would string all 24 across the screen.
    const ring = Array.from({ length: 24 }, (_, i) => node(`p${i}`, [`p${(i + 1) % 24}`]));
    const placed = layoutStates(ring);
    expect(new Set(placed.map((p) => p.x)).size).toBe(4); // four banks
    expect(new Set(placed.map((p) => p.y)).size).toBe(6); // six each
  });

  it("spreads a rank out without letting nodes overlap", () => {
    // Nine states entered from one place: what a machine with a much-used state looks like, and
    // the case where placing by hand fell over.
    const wide = [
      node(
        "start",
        Array.from({ length: 9 }, (_, i) => `n${i}`),
        true,
      ),
    ];
    for (let i = 0; i < 9; i++) wide.push(node(`n${i}`));
    const placed = layoutStates(wide);
    const start = placed.find((p) => p.id === "start")!;
    const rank = placed.filter((p) => p.id.startsWith("n"));
    expect(rank.every((p) => p.x > start.x)).toBe(true); // all downstream of the beginning
    expect(new Set(rank.map((p) => p.y)).size).toBe(9); // and none on top of another
  });

  it("gives every node a place, even one nothing reaches", () => {
    const placed = layoutStates([node("a", ["b"], true), node("b"), node("stray")]);
    expect(placed.map((p) => p.id).sort()).toEqual(["a", "b", "stray"]);
    expect(placed.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
