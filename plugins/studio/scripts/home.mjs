// One studio per computer. Every script finds the studio's data folder here, so a member's license, render
// engines and speech engine are never lost because a command was run without --data, or because the plugin was
// installed a second way (store and file upload give two different data folders).
//
// Order: --data, then CLAUDE_PLUGIN_DATA, then the folder remembered in ~/.animationroom/home.json, then
// ~/.animationroom. A plugin data folder that is still empty adopts the remembered studio instead of starting over.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME_DIR = process.env.AR_HOME || path.join(os.homedir(), ".animationroom");
const POINTER = path.join(HOME_DIR, "home.json");

// A folder counts as a studio once it holds a saved config or an installed render engine.
const isStudio = (d) => {
  try {
    return fs.existsSync(path.join(d, "config.json")) || fs.existsSync(path.join(d, "runtime", ".installed.json"));
  } catch {
    return false;
  }
};
const remembered = () => {
  try {
    const d = JSON.parse(fs.readFileSync(POINTER, "utf8")).data;
    return d && isStudio(d) ? path.resolve(d) : "";
  } catch {
    return "";
  }
};

// Returns { data, via, wanted? }. via: explicit, adopted, remembered or default.
export function resolveData(optData) {
  const env = process.env.CLAUDE_PLUGIN_DATA ? path.resolve(process.env.CLAUDE_PLUGIN_DATA) : "";
  const asked = optData && optData !== true ? path.resolve(String(optData)) : env;
  const known = remembered();
  if (!asked) return { data: known || path.resolve(HOME_DIR), via: known ? "remembered" : "default" };
  // Only the plugin's own data folder may adopt: a folder chosen on purpose (tests, development) is used as it is.
  const fromPlugin = asked === env;
  if (fromPlugin && !isStudio(asked) && known && known !== asked && !process.env.AR_NO_ADOPT) return { data: known, via: "adopted", wanted: asked };
  return { data: asked, via: "explicit" };
}

// Remember this studio so any later run finds it. Only the plugin's own data folder is remembered.
export function rememberStudio(data) {
  try {
    const env = process.env.CLAUDE_PLUGIN_DATA ? path.resolve(process.env.CLAUDE_PLUGIN_DATA) : "";
    const d = path.resolve(data);
    if (process.env.AR_NO_ADOPT || !isStudio(d)) return;
    const inPlugins = d.split(path.sep).join("/").includes("/.claude/plugins/data/");
    if (d !== env && !inPlugins && d !== path.resolve(HOME_DIR)) return;
    if (remembered() === d) return;
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.writeFileSync(POINTER, JSON.stringify({ data: d, at: new Date().toISOString() }, null, 2));
  } catch {
    /* remembering is a convenience, never a reason to fail */
  }
}

// Say so once on stderr when an empty plugin folder was pointed at the existing studio.
export function noteAdopted(r) {
  if (r.via === "adopted") console.error(`Using your existing studio at ${r.data} (this chat's own folder was empty).`);
}

// The environment for a child process, with the folder of the Node that is running us first on the path. A private
// copy of Node lives inside the studio folder and is not on the path, but install steps of the render engine call
// plain "node", which is what failed on a beta member's Mac. Windows spells the variable "Path".
export function nodeEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") || "PATH";
  env[key] = path.dirname(process.execPath) + path.delimiter + (env[key] || "");
  return env;
}
