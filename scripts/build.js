import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = resolve(projectRoot, "src");
const outputDirectory = resolve(projectRoot, "dist");

// Guard the only destructive operation so it can never target an unexpected path.
if (basename(outputDirectory) !== "dist") {
  throw new Error(`Refusing to replace unexpected output directory: ${outputDirectory}`);
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
cpSync(sourceDirectory, outputDirectory, { recursive: true });

console.log("Built deployable site in dist/");
