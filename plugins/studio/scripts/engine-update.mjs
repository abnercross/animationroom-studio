// Brings an installed render engine up to the version this plugin ships, without the member doing anything.
// A plugin update replaces the plugin only; the engine lives in the data folder. Animate and Edit call this
// when their engine is older than the plugin's, then carry on with the command that needed it.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nodeEnv } from "./home.mjs";

const STUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), "studio.mjs");

// Returns true when the engine was reinstalled, false (with the reason on stderr) when it could not be.
export function updateEngine({ data, edit = false, from, to }) {
  let browser = "";
  try { browser = JSON.parse(fs.readFileSync(path.join(data, "config.json"), "utf8")).browserExecutable || ""; } catch {}
  const args = [STUDIO, "runtime", "install", "--data", data];
  if (edit) args.push("--engine", "edit");
  if (browser && fs.existsSync(browser)) args.push("--browser", browser); // reuse the browser, no second download
  console.error(`Updating the ${edit ? "Edit" : "Animate"} render engine (${from} to ${to}). This only happens once per update, up to a few minutes...`);
  const r = spawnSync(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"], env: nodeEnv() });
  return r.status === 0;
}
