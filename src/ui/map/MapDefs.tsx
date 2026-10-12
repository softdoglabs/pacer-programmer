// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/**
 * Our own arrowhead for the map's edges.
 *
 * React Flow's built-in one is a squat triangle — 5 long and 8 across — which reads as a blob
 * where several edges converge on a node. This is a dart: longer than it is wide, with a notched
 * tail so the point stays legible at the scale `fitView` settles on.
 *
 * A marker is referenced by document-wide id, so it can live in its own `<svg>` rather than inside
 * the flow's — the same arrangement as the faceplate's glow filters.
 *
 * Two details it fixes as well as the shape:
 * - `markerUnits="userSpaceOnUse"` keeps the head one size. The default scales with stroke width,
 *   so faded stepping edges would get smaller heads than designed ones, which reads as a second
 *   meaning nobody intended.
 * - `context-stroke` takes the colour from whichever edge references it, so one marker serves the
 *   faded and the solid edges alike.
 */
export const MAP_ARROW = "map-arrow";

export function MapDefs() {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        <marker
          id={MAP_ARROW}
          viewBox="-13 -5 14 10"
          markerWidth={14}
          markerHeight={10}
          refX={0}
          refY={0}
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0,0 L -12,-3.4 L -9,0 L -12,3.4 Z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
  );
}
