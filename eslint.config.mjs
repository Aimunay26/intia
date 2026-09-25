import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  { ignores: [".next/**", ".next-dev/**", ".audit/**", ".workflow-data/**", "src/app/.well-known/workflow/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { files: ["tests/**"], rules: { "@next/next/no-assign-module-variable": "off" } },
  { rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }], "react/no-unescaped-entities": "off" } },
];
export default config;
