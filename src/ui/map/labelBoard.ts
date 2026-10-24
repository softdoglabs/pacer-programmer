// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";

/*
 * Where each edge's badge sits, decided for the whole map at once.
 *
 * A badge belongs on its own edge, so each edge can only say where along itself it could go; what
 * it can't know is where the others went. Edges that cross near their middles — a return running
 * back along the route that entered its state, four mains fanning into one looper — put their
 * badges on the same spot, and one hides the other. So every edge hands its candidate spots to this
 * board, which places them in order of importance (designed routes, then the dashed ones, then
 * stepping), each at its first spot clear of those already placed.
 */

type Point = { x: number; y: number };

/** Where along an edge a badge may go, best first: the middle, then out toward either end. */
export const LABEL_SPOTS = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8, 0.13, 0.87] as const;

/** How far apart two badges' centers have to be, in flow units: a badge is 24 across, plus a little air. */
const CLEARANCE = 28;

interface Entry {
  spots: Point[];
  /** Lower goes first, and so gets the middle when two want it. */
  rank: number;
}

export class LabelBoard {
  private entries = new Map<string, Entry>();
  private placed = new Map<string, number>();
  private listeners = new Set<() => void>();
  private pending = false;

  offer(id: string, spots: Point[], rank: number) {
    const was = this.entries.get(id);
    if (
      was &&
      was.rank === rank &&
      was.spots.length === spots.length &&
      was.spots.every((p, i) => p.x === spots[i]!.x && p.y === spots[i]!.y)
    )
      return;
    this.entries.set(id, { spots, rank });
    this.schedule();
  }

  withdraw(id: string) {
    if (this.entries.delete(id)) this.schedule();
  }

  /** Which of its spots this edge's badge goes in: an index into what it offered. */
  spotOf(id: string): number {
    return this.placed.get(id) ?? 0;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  // Every edge offers in the same commit, so they're placed together once they all have.
  private schedule() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.place();
    });
  }

  private place() {
    const order = [...this.entries].sort(([a, x], [b, y]) => x.rank - y.rank || (a < b ? -1 : a > b ? 1 : 0));
    const taken: Point[] = [];
    const next = new Map<string, number>();
    for (const [id, { spots }] of order) {
      const room = (p: Point) => Math.min(Infinity, ...taken.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
      // The first spot that's clear; failing that, the one with the most room.
      let best = spots.findIndex((p) => room(p) >= CLEARANCE);
      if (best < 0) best = spots.reduce((b, p, i) => (room(p) > room(spots[b]!) ? i : b), 0);
      next.set(id, best);
      taken.push(spots[best]!);
    }
    const changed = next.size !== this.placed.size || [...next].some(([id, i]) => this.placed.get(id) !== i);
    this.placed = next;
    if (changed) for (const listener of this.listeners) listener();
  }
}

export const LabelBoardContext = createContext<LabelBoard | null>(null);

/** Offers an edge's badge spots to the map's board, and says which one it got. */
export function useLabelSpot(id: string, spots: Point[], rank: number): number {
  const board = useContext(LabelBoardContext);
  useLayoutEffect(() => {
    board?.offer(id, spots, rank);
  });
  useLayoutEffect(() => () => board?.withdraw(id), [board, id]);
  return useSyncExternalStore(board?.subscribe ?? noSubscribe, () => board?.spotOf(id) ?? 0);
}

const noSubscribe = () => () => {};
