// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/**
 * The SVG filters the panel's lights glow with. Referenced by id from every switch's own SVG
 * (`SwitchView`) and the display, so they're rendered once wherever a switch appears — including
 * the editor's live control, which isn't inside the faceplate.
 */
export function FaceplateDefs() {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        <filter id="led-glow" x="-30%" y="-200%" width="160%" height="500%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="legend-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="display-glow" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
