/*
 * Editing the machine, not the presets.
 *
 * A state can be several presets — one per place it returns to — so "make this switch lead there"
 * is a change to every copy at once. Doing it a preset at a time is exactly the hand work this
 * project exists to remove, and it's where the copies drift apart.
 *
 * Nothing is persisted but the dump, so every edit has to leave a configuration the recovery can
 * still read as the design meant. Each one is checked with `whatWasLost` before it's written, and
 * refused with the reason rather than written and discovered later.
 */

export * from "./change";
export * from "./switches";
export * from "./plan";
export * from "./editRoute";
export * from "./movePreset";
