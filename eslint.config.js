// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Layering, enforced with import restrictions. Each layer may only import the ones before it.
 *   protocol (SysEx codec, domain types)
 *   -> hardware (static description of the physical controls)
 *   -> simulator (engine) -> device (firmware mode machine)
 *   -> panel (what the hardware shows, computed from all of the above)
 *   -> store / ui (React, Zustand)
 * Nothing under src/pacer may depend on React, Zustand, or app code.
 */
const noUiInDomain = {
  patterns: [
    {
      group: ["react", "react-dom", "zustand", "@xstate/react", "react-aria", "react-aria-components", "@react-aria/*"],
      message: "src/pacer is framework-free domain code.",
    },
    {
      group: ["**/store/**", "**/ui/**", "**/midi/**", "@/components/**", "@/lib/**"],
      message: "src/pacer must not depend on app, I/O, or UI code.",
    },
  ],
};

/**
 * One state machine per configuration (see `analysis/machineOf.ts`). Recovering it afresh is how
 * two parts of one screen came to hold different ideas of what the states are, so outside the
 * analysis layer — and its tests, which are about recovery itself — it's asked for, not rebuilt.
 */
const oneMachine = {
  group: ["**/analysis", "@/pacer/analysis"],
  importNames: ["recoverMachine"],
  message: "Use machineOf(config), or useMachine() in a component: one machine object per configuration.",
};

export default tseslint.config(
  { ignores: ["dist", "build", ".brandkit", "docs/.vitepress/cache", "src/components/ui"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The docs site's theme is Vue, where use* names a composable, not a React hook.
    files: ["docs/.vitepress/**/*.ts"],
    rules: Object.fromEntries(Object.keys(reactHooks.configs.recommended.rules).map((rule) => [rule, "off"])),
  },
  {
    // Tooling that runs under Node, outside the app: the docs' screenshot script.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/pacer/**/*.ts"],
    rules: { "no-restricted-imports": ["error", noUiInDomain] },
  },
  {
    files: ["src/pacer/protocol/**/*.ts"],
    ignores: ["src/pacer/protocol/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            {
              group: ["**/simulator/**", "**/device/**", "**/simulator", "**/device"],
              message: "protocol is the bottom layer.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pacer/hardware/**/*.ts"],
    ignores: ["src/pacer/hardware/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            {
              group: ["**/simulator/**", "**/device/**", "**/simulator", "**/device"],
              message: "hardware is a static description; it may only depend on protocol.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pacer/editing/**/*.ts"],
    ignores: ["src/pacer/editing/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            {
              group: ["**/simulator/**", "**/device/**", "**/panel/**", "**/simulator", "**/device", "**/panel"],
              message: "editing works on the config alone; it may only depend on protocol.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pacer/analysis/**/*.ts"],
    ignores: ["src/pacer/analysis/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            {
              group: ["**/simulator/**", "**/device/**", "**/panel/**", "**/simulator", "**/device", "**/panel"],
              message: "analysis derives views from the config alone; it may only depend on protocol.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pacer/authoring/**/*.ts"],
    ignores: ["src/pacer/authoring/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            {
              group: ["**/simulator/**", "**/device/**", "**/panel/**", "**/simulator", "**/device", "**/panel"],
              message: "authoring is where analysis and editing meet; it may depend on those and protocol.",
            },
            oneMachine,
          ],
        },
      ],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}", "src/store/**/*.ts"],
    ignores: ["**/__tests__/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [oneMachine] }] },
  },
  {
    files: ["src/pacer/simulator/**/*.ts"],
    ignores: ["src/pacer/simulator/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            { group: ["**/device/**", "**/device"], message: "simulator must not depend on device." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pacer/device/**/*.ts"],
    ignores: ["src/pacer/device/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...noUiInDomain.patterns,
            { group: ["**/panel/**", "**/panel"], message: "device must not depend on panel." },
          ],
        },
      ],
    },
  },
  prettier,
);
