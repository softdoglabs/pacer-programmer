import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Layering, enforced with import restrictions. Each layer may only import the ones before it.
 *   protocol (SysEx codec, domain types)
 *   -> simulator (engine) -> device (firmware mode machine)
 *   -> store / ui (React, Zustand)
 * Nothing under src/pacer may depend on React, Zustand, or app code.
 */
const noUiInDomain = {
  patterns: [
    {
      group: ["react", "react-dom", "zustand", "@xstate/react", "@react-aria/*"],
      message: "src/pacer is framework-free domain code.",
    },
    {
      group: ["**/store/**", "**/ui/**", "@/components/**", "@/lib/**"],
      message: "src/pacer must not depend on app/UI code.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", "src/components/ui"] },
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
  prettier,
);
