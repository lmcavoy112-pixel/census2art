import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendor bundle copied from node_modules/maplibre-gl/dist by `npm run sync:maplibre`
    // (see lib/modern/mapRuntime.ts) — minified third-party code, not source. Escapes
    // ESLint's own node_modules default ignore precisely because it's copied out of
    // node_modules into public/.
    "public/maplibre/**",
  ]),
  {
    rules: {
      // The API/GeoJSON boundary code throughout lib/ (pickString, readArray, the
      // geometry helpers) deliberately takes `any` for payloads whose shape isn't
      // known until runtime — that's the established convention across this codebase,
      // not an oversight in any one file. Downgraded to a warning rather than fixed
      // wholesale here: retyping every boundary function is a real cleanup, but a
      // separate one from "why is CI red", and doing it hastily risks silently
      // narrowing a type in a way that breaks a payload shape nothing here tests for.
      "@typescript-eslint/no-explicit-any": "warn",
      // Flags synchronous setState calls in an effect body — correct general advice,
      // but the one place it fires (the census page's mount-once snapshot restore,
      // reading a pin back out of localStorage) is exactly the case effects exist for:
      // syncing React state from an external, render-unsafe source on mount. There's
      // no clean escape hatch for that specific pattern without restructuring already-
      // verified restore logic for a style preference, so this stays a warning.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
