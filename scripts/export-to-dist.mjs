import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const exportDir = path.join(projectRoot, "out");
const distDir = path.join(projectRoot, "dist");

if (!existsSync(path.join(exportDir, "index.html"))) {
  throw new Error("Next static export did not produce out/index.html.");
}

if (
  path.basename(distDir) !== "dist" ||
  !distDir.startsWith(`${projectRoot}${path.sep}`)
) {
  throw new Error("Refusing to write outside the project dist directory.");
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(exportDir, distDir, { recursive: true });
