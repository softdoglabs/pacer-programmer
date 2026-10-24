// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { END_SPACING, bowDirection, bowOffsets, edgeGeometry, spreadEnds, type EndRequest } from "../edgePath";

/*
 * Positions as the map lays them out (top-left corners, flow units). The edge coordinates are the
 * handle points the app drew for these nodes.
 */
const PRGM2 = { x: 0, y: 0 };
const PRGM1 = { x: 0, y: 100 };
const LOOPR = { x: 300, y: 50 };
const LOOPR_LEFT_HANDLE = { x: 319, y: 103.5 };

describe("edges converging on one side of a state", () => {
  // PRGM1 and PRGM2 both route into LOOPR's left side: the tutorial 2 looper.
  const shifts = spreadEnds([
    { key: "PRGM2", node: "LOOPR", side: "l", toward: PRGM2.y, tie: 0 },
    { key: "PRGM1", node: "LOOPR", side: "l", toward: PRGM1.y, tie: 0 },
  ]);
  const into = (key: string, from: { x: number; y: number }) =>
    edgeGeometry({
      sourceX: from.x + 133,
      sourceY: from.y + 44,
      targetX: LOOPR_LEFT_HANDLE.x,
      targetY: LOOPR_LEFT_HANDLE.y,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      offset: 0,
      targetShift: shifts.get(key)!,
    });

  it("gives each its own point, so their arrowheads don't stack", () => {
    const a = into("PRGM2", PRGM2).end;
    const b = into("PRGM1", PRGM1).end;
    expect(a).not.toEqual(b);
    expect(Math.abs(a.y - b.y)).toBe(END_SPACING);
    // Still on LOOPR's side, so each head points straight in.
    expect(a.x).toBe(LOOPR_LEFT_HANDLE.x);
    expect(b.x).toBe(LOOPR_LEFT_HANDLE.x);
  });

  it("orders them by where they come from, so they fan out without crossing", () => {
    // PRGM2 is above PRGM1, so its edge arrives above.
    expect(shifts.get("PRGM2")!).toBeLessThan(shifts.get("PRGM1")!);
  });

  it("keeps a crowd on the node: many ends squeeze rather than run off a short side", () => {
    const crowd: EndRequest[] = Array.from({ length: 6 }, (_, i) => ({
      key: `e${i}`,
      node: "LOOPR",
      side: "l",
      toward: i * 50,
      tie: 0,
    }));
    const spread = [...spreadEnds(crowd).values()];
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThanOrEqual(28);
    expect(new Set(spread).size).toBe(6);
  });
});

describe("a pair of edges leading both ways", () => {
  // PRGM1 ↔ LOOPR: both ends on PRGM1's right side and on LOOPR's left, the halves bowed apart.
  const from = PRGM1;
  const to = LOOPR;
  const forwardBow = bowDirection(from, to, 26);
  const backBow = bowDirection(to, from, -26);
  const shifts = spreadEnds([
    { key: "forward:s", node: "PRGM1", side: "r", toward: to.y, tie: forwardBow.y },
    { key: "back:t", node: "PRGM1", side: "r", toward: to.y, tie: backBow.y },
    { key: "forward:t", node: "LOOPR", side: "l", toward: from.y, tie: forwardBow.y },
    { key: "back:s", node: "LOOPR", side: "l", toward: from.y, tie: backBow.y },
  ]);
  const left = { x: 133, y: 144 };
  const right = { x: 319, y: 103.5 };
  const forward = edgeGeometry({
    sourceX: left.x,
    sourceY: left.y,
    targetX: right.x,
    targetY: right.y,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    offset: 26,
    sourceShift: shifts.get("forward:s"),
    targetShift: shifts.get("forward:t"),
  });
  const back = edgeGeometry({
    sourceX: right.x,
    sourceY: right.y,
    targetX: left.x,
    targetY: left.y,
    sourcePosition: Position.Left,
    targetPosition: Position.Right,
    offset: -26,
    sourceShift: shifts.get("back:s"),
    targetShift: shifts.get("back:t"),
  });

  it("meets each node at two points, so neither head sits on the other edge's tail", () => {
    expect(Math.abs(forward.start.y - back.end.y)).toBe(END_SPACING);
    expect(Math.abs(forward.end.y - back.start.y)).toBe(END_SPACING);
  });

  it("puts each half's ends on the side its curve bows to, so the two don't cross", () => {
    // Measured against the straight line between the two handles.
    const sideOf = (p: { x: number; y: number }) => {
      const cross = (right.x - left.x) * (p.y - left.y) - (right.y - left.y) * (p.x - left.x);
      return Math.sign(cross);
    };
    expect(sideOf(forward.start)).toBe(sideOf(forward.label));
    expect(sideOf(forward.end)).toBe(sideOf(forward.label));
    expect(sideOf(back.start)).toBe(sideOf(back.label));
    expect(sideOf(back.end)).toBe(sideOf(back.label));
    expect(sideOf(forward.label)).toBe(-sideOf(back.label));
  });
});

describe("a lone edge", () => {
  it("starts and ends exactly at its handles", () => {
    const shifts = spreadEnds([
      { key: "s", node: "A", side: "r", toward: 0, tie: 0 },
      { key: "t", node: "B", side: "l", toward: 0, tie: 0 },
    ]);
    expect(shifts.get("s")).toBe(0);
    expect(shifts.get("t")).toBe(0);
    const g = edgeGeometry({
      sourceX: 133,
      sourceY: 44,
      targetX: 319,
      targetY: 44,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      offset: 0,
    });
    expect(g.start).toEqual({ x: 133, y: 44 });
    expect(g.end).toEqual({ x: 319, y: 44 });
  });
});

describe("edges between the same two states", () => {
  it("bow apart, a pair symmetric about the straight line", () => {
    const offsets = bowOffsets(
      [
        { id: "forward", source: "PRGM1", target: "LOOPR" },
        { id: "back", source: "LOOPR", target: "PRGM1" },
      ],
      52,
    );
    expect([offsets.get("forward"), offsets.get("back")].sort()).toEqual([-26, 26]);
  });

  it("bow apart when two switches lead the same way", () => {
    // A1's A and its C (wrapping around to D6, a copy of the looper) both reach LOOPR.
    const offsets = bowOffsets(
      [
        { id: "A", source: "PRGM1", target: "LOOPR" },
        { id: "C", source: "PRGM1", target: "LOOPR" },
        { id: "other", source: "PRGM2", target: "LOOPR" },
      ],
      52,
    );
    expect(offsets.get("A")).not.toBe(offsets.get("C"));
    expect(offsets.get("other")).toBe(0);
  });
});
