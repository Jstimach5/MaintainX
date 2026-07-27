import { defineConfig, globalIgnores } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...coreWebVitals,
  ...nextTypescript,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "drizzle/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
