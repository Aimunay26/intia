import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
export function load(file, mocks = {}, registry = new Map()) {
  let fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) {
    const base = fullPath.replace(/\.ts$/, "");
    fullPath = [base + ".tsx", path.join(base, "index.ts")].find(candidate => fs.existsSync(candidate)) ?? fullPath;
  }
  if (registry.has(fullPath)) return registry.get(fullPath).exports;
  const module = { exports: {} };
  registry.set(fullPath, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(fullPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX }, fileName: fullPath,
  });
  const resolve = name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`, mocks, registry) : name.startsWith(".") ? load(path.resolve(path.dirname(fullPath),name)+".ts",mocks,registry) : require(name);
  new Function("require", "module", "exports", outputText)(resolve, module, module.exports);
  return module.exports;
}
