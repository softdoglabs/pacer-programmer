// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Editing the machine, not the presets.
 *
 * A state can be several presets — one per distinct set of places its switches lead, depending on
 * the way in — so "make this switch lead there" is a change to every copy at once, and can add or
 * free copies. Doing it a preset at a time is exactly the hand work this project exists to remove.
 *
 * Every edit changes the machine and then `realize`s it into presets. Nothing is persisted but the
 * dump, so the result is read back before it's written, and refused with the reason unless it
 * means what the machine says.
 */

export * from "./change";
export * from "./switches";
export * from "./plan";
export * from "./slots";
export * from "./editRoute";
export * from "./realize";
export * from "./movePreset";
