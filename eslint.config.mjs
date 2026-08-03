import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "android/app/build/**",
    "android/app/src/main/assets/**",
    "next-env.d.ts",
    "src/generated/prisma/**",
  ]),
]);
