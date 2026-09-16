// Node-only test adapter. Never imported by the application.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.__portalTestEnv = {};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env=globalThis.__portalTestEnv", shortCircuit: true };
    if (specifier === "@/lib/server-auth") return { url: "data:text/javascript,export async function getRequestUser(){return null}", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const base = resolve(root, specifier.slice(2));
      const path = [base + ".ts", resolve(base, "index.ts")].find(existsSync);
      if (path) return nextResolve(pathToFileURL(path).href, context);
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      if (existsSync(base + ".ts")) return nextResolve(pathToFileURL(base + ".ts").href, context);
    }
    return nextResolve(specifier, context);
  },
});
