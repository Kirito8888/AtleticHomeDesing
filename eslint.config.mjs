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
    // Cliente Prisma generado
    "src/generated/**",
  ]),
  // Bloque 8: nada de `console` suelto en el código de la app; se usa `lib/log.ts`.
  { files: ["src/**/*.{ts,tsx}"], ignores: ["src/lib/log.ts", "**/*.test.ts"], rules: { "no-console": "error" } },
  // Bloque 9: sin diálogos nativos; se usa `confirmDialog` (components/ui/confirm-dialog.tsx).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", { name: "confirm", message: "Usa confirmDialog() de components/ui/confirm-dialog." }],
      "no-restricted-properties": ["error", { object: "window", property: "confirm", message: "Usa confirmDialog() de components/ui/confirm-dialog." }],
    },
  },
]);

export default eslintConfig;
