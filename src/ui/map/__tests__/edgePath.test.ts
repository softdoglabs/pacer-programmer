import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { END_SPREAD, edgeGeometry } from "../edgePath";

/*
 * A pair of states that lead to each other, laid out as the map lays them out: left to right, the
 * forward edge leaving the left node's right side for the right node's left side, and the return
 * leaving the right node's left side for the left node's right side. The two halves get opposite
 * offsets (see PresetMap). These are the coordinates the app drew for PRGM1 and LOOPR.
 */
const LEFT = { x: 133, y: 44.25 };
const RIGHT = { x: 319, y: 44.25 };
const forward = edgeGeometry({
  sourceX: LEFT.x,
  sourceY: LEFT.y,
  targetX: RIGHT.x,
  targetY: RIGHT.y,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  offset: 26,
});
const back = edgeGeometry({
  sourceX: RIGHT.x,
  sourceY: RIGHT.y,
  targetX: LEFT.x,
  targetY: LEFT.y,
  sourcePosition: Position.Left,
  targetPosition: Position.Right,
  offset: -26,
});

describe("a pair of edges between two states", () => {
  it("meets each node at two different points, so neither head sits on the other edge's tail", () => {
    // At the left node: where the forward edge leaves and where the return arrives (its head).
    expect(forward.start).not.toEqual(back.end);
    expect(Math.abs(forward.start.y - back.end.y)).toBe(2 * END_SPREAD);
    // At the right node: the forward edge's head and the return's tail.
    expect(forward.end).not.toEqual(back.start);
    expect(Math.abs(forward.end.y - back.start.y)).toBe(2 * END_SPREAD);
  });

  it("keeps every end on the node's side, so each head still points straight in", () => {
    for (const p of [forward.start, back.end]) expect(p.x).toBe(LEFT.x);
    for (const p of [forward.end, back.start]) expect(p.x).toBe(RIGHT.x);
  });

  it("spreads each edge's ends towards the side its curve bows to, so the two never cross", () => {
    // The forward edge's middle sits on one side of the centre line and its ends lean the same way;
    // the return's middle and ends are on the other side.
    const sideOf = (y: number) => Math.sign(y - LEFT.y);
    expect(sideOf(forward.label.y)).toBe(sideOf(forward.start.y));
    expect(sideOf(forward.label.y)).toBe(sideOf(forward.end.y));
    expect(sideOf(back.label.y)).toBe(sideOf(back.start.y));
    expect(sideOf(back.label.y)).toBe(sideOf(back.end.y));
    expect(sideOf(forward.label.y)).toBe(-sideOf(back.label.y));
  });

  it("spreads along the side for a pair stacked top to bottom too", () => {
    const top = { x: 100, y: 0 };
    const bottom = { x: 100, y: 200 };
    const down = edgeGeometry({
      sourceX: top.x,
      sourceY: top.y,
      targetX: bottom.x,
      targetY: bottom.y,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      offset: 26,
    });
    const up = edgeGeometry({
      sourceX: bottom.x,
      sourceY: bottom.y,
      targetX: top.x,
      targetY: top.y,
      sourcePosition: Position.Top,
      targetPosition: Position.Bottom,
      offset: -26,
    });
    expect(down.start.y).toBe(top.y);
    expect(Math.abs(down.start.x - up.end.x)).toBe(2 * END_SPREAD);
    expect(Math.abs(down.end.x - up.start.x)).toBe(2 * END_SPREAD);
  });
});

describe("a single edge", () => {
  it("starts and ends exactly at its handles", () => {
    const g = edgeGeometry({
      sourceX: LEFT.x,
      sourceY: LEFT.y,
      targetX: RIGHT.x,
      targetY: RIGHT.y,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      offset: 0,
    });
    expect(g.start).toEqual(LEFT);
    expect(g.end).toEqual(RIGHT);
  });
});
