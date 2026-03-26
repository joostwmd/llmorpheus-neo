import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Load `.env` from the package root (parent of `src/`).
 * Safe to call from any entrypoint; does not override variables already set in the process env.
 */
export function loadPackageEnv() {
  dotenv.config({ path: path.join(pkgRoot, ".env") });
}
