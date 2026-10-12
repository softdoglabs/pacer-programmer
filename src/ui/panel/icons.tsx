// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { IconId } from "@/pacer/hardware";

/**
 * Our own drawings of the Pacer's printed icons, each in a 24x24 box centered on the origin
 * (so callers can position them with a single translate). Not traced from Nektar artwork.
 */
export function IconGlyph({ icon, fill }: { icon: IconId; fill: string }) {
  switch (icon) {
    case "play":
      return <path d="M-6,-8 L8,0 L-6,8 Z" fill={fill} />;
    case "stop":
      return <rect x={-7} y={-7} width={14} height={14} fill={fill} />;
    case "record":
      return <circle r={8} fill={fill} />;
    case "rewind":
      return <path d="M0,-7 L-10,0 L0,7 Z M10,-7 L0,0 L10,7 Z" fill={fill} />;
    case "fastForward":
      return <path d="M0,-7 L10,0 L0,7 Z M-10,-7 L0,0 L-10,7 Z" fill={fill} />;
    case "arrowUp":
      return <path d="M-9,6 L0,-8 L9,6 Z" fill={fill} />;
    case "arrowDown":
      return <path d="M-9,-6 L0,8 L9,-6 Z" fill={fill} />;
    case "loop":
      return (
        <g fill="none" stroke={fill} strokeWidth={2.6} strokeLinecap="round">
          <path d="M-8,2 A8,6 0 0 1 6,-5" />
          <path d="M8,-2 A8,6 0 0 1 -6,5" />
          <path d="M3,-8 L7,-5 L3,-2" />
          <path d="M-3,8 L-7,5 L-3,2" />
        </g>
      );
  }
}
