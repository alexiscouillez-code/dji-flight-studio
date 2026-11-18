// Copies CesiumJS static build (Workers, Assets, Widgets, ThirdParty, Cesium.js) to public/cesium.
// Cesium is loaded as a separate static script on the Virtual World page only — it is never
// bundled by webpack, which keeps build times and the other pages' JS small.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("cesium/package.json"));
const src = join(pkgDir, "Build", "Cesium");
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "cesium");
const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
const stamp = join(dest, ".version");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) {
  console.log(`[cesium] public/cesium already at ${version}`);
} else {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const part of ["Cesium.js", "Assets", "Workers", "ThirdParty", "Widgets"]) cpSync(join(src, part), join(dest, part), { recursive: true });
  writeFileSync(stamp, version);
  console.log(`[cesium] copied Cesium ${version} to public/cesium`);
}
