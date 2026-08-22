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
    // Los produce `python scripts/datos/construir.py`. Formatearlos no sirve
    // de nada: la siguiente corrida los reescribe igual.
    "**/*.generado.ts",
    "**/*.generada.ts",
  ]),
]);

export default eslintConfig;
