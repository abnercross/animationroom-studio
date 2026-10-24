// A full ffmpeg for the studio. The copy inside the render engine is cut down (no tile, fps, afade, ebur128 or
// alimiter), so a computer with no ffmpeg of its own broke contact sheets, loudness checks and the sound mix. This
// module finds a full ffmpeg (the computer's own, else one kept in the studio folder) and, when there is none,
// installs one into the studio folder by itself. No password, nothing outside the studio folder changes.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { nodeEnv } from "./home.mjs";

// What the studio's scripts use. A copy missing any of these is not good enough.
const NEED_FILTERS = ["tile", "fps", "afade", "ebur128", "alimiter", "setpts", "asetpts", "atrim", "aresample", "loudnorm", "silencedetect", "concat", "scale", "format", "volume", "trim"];
const NEED_ENCODERS = ["libx264", "aac"];
const PACKAGE = "@ffmpeg-installer/ffmpeg@1.1.0"; // the program itself travels inside npm's per computer packages

const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const toolDir = (data) => path.join(data, "tools", "ffmpeg");

// True when this ffmpeg has every filter and encoder the studio needs.
export function isFull(bin) {
  const run = (a) => spawnSync(bin, ["-hide_banner", ...a], { encoding: "utf8", timeout: 30000, maxBuffer: 1e8 });
  const f = run(["-filters"]);
  if (f.error || f.status !== 0) return false;
  const filters = new Set((f.stdout.match(/^\s*[TSC.]{2,3}\s+(\S+)\s+[AVN|]+->/gm) || []).map((l) => l.trim().split(/\s+/)[1]));
  if (!NEED_FILTERS.every((n) => filters.has(n))) return false;
  const e = run(["-encoders"]);
  if (e.error || e.status !== 0) return false;
  const encoders = new Set((e.stdout.match(/^\s*[VAS][F.][S.][X.][B.][D.]\s+(\S+)/gm) || []).map((l) => l.trim().split(/\s+/)[1]));
  return NEED_ENCODERS.every((n) => encoders.has(n));
}

// The copy kept in the studio folder, if it was installed.
function studioCopy(data) {
  const scope = path.join(toolDir(data), "node_modules", "@ffmpeg-installer");
  if (!fs.existsSync(scope)) return null;
  for (const d of fs.readdirSync(scope)) {
    const p = path.join(scope, d, exe);
    if (d !== "ffmpeg" && fs.existsSync(p)) return p;
  }
  return null;
}

let memo; // looked up once per script run
// { bin, source: "system" | "studio" } or null when the computer has no full ffmpeg yet.
export function findFfmpeg(data) {
  if (memo !== undefined) return memo;
  const own = studioCopy(data);
  if (own && isFull(own)) return (memo = { bin: own, source: "studio" });
  if (isFull("ffmpeg")) return (memo = { bin: "ffmpeg", source: "system" });
  return (memo = null);
}

// npm that belongs to the Node running this script (works for the private copy too).
function npmCommand() {
  const real = fs.realpathSync(process.execPath);
  const cli = process.platform === "win32"
    ? path.join(path.dirname(real), "node_modules", "npm", "bin", "npm-cli.js")
    : path.join(path.dirname(path.dirname(real)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return fs.existsSync(cli) ? [process.execPath, [cli]] : [process.platform === "win32" ? "npm.cmd" : "npm", []];
}

let tried = false;
// Installs a full ffmpeg into the studio folder. Returns { bin, source } or { error }.
export function installFfmpeg(data) {
  const found = findFfmpeg(data);
  if (found) return found;
  if (tried) return { error: "the video tools could not be installed" };
  tried = true;
  const dir = toolDir(data);
  fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(dir, "package.json");
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: "studio-ffmpeg", private: true }));
  const [cmd, lead] = npmCommand();
  const r = spawnSync(cmd, [...lead, "install", PACKAGE, "--no-audit", "--no-fund", "--no-progress", "--loglevel=error"], {
    cwd: dir, encoding: "utf8", env: nodeEnv({ npm_config_update_notifier: "false" }), maxBuffer: 1e8,
  });
  if (r.status !== 0) return { error: `the video tools did not download: ${String(r.stderr || r.error || "").slice(-300)}` };
  const own = studioCopy(data);
  if (!own) return { error: "the video tools downloaded but this computer type has no copy of them" };
  if (process.platform !== "win32") { try { fs.chmodSync(own, 0o755); } catch { /* already runnable */ } }
  memo = undefined;
  const again = findFfmpeg(data);
  return again || { error: "the downloaded video tools do not run on this computer" };
}

// For scripts: a full ffmpeg, installed first if needed (it says so on stderr, it takes about a minute once).
// Returns the path, or null when it cannot be had (callers then fall back to the render engine's own copy).
export function ensureFfmpeg(data) {
  const found = findFfmpeg(data);
  if (found) return found.bin;
  if (!tried) console.error("Installing the video tools (about a minute, once)...");
  const r = installFfmpeg(data);
  if (r.error) { console.error(r.error); return null; }
  return r.bin;
}
