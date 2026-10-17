// Shared by the Edit mode scripts: arguments, KEY=value output, ffmpeg, measuring a video, the videos folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { openProject } from "./projects.mjs";
import { resolveData, noteAdopted } from "./home.mjs";

const argv = process.argv.slice(2);
export const pos = [], opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
    let val;
    if (eq >= 0) val = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) val = argv[++i];
    else val = true;
    // A repeated option collects into a list (for example several --set).
    opt[k] = k in opt ? [].concat(opt[k], val) : val;
  } else pos.push(a);
}
export const out = (k, v) => console.log(`${k}=${v}`);
export const fail = (reason) => {
  out("RESULT", "failed");
  out("REASON", reason);
  process.exit(1);
};
export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

export const PLUGIN_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HOME = resolveData(opt.data);
noteAdopted(HOME);
export const DATA = HOME.data;
export const readConfig = () => { try { return readJson(path.join(DATA, "config.json")); } catch { return {}; } };

// ---------- ffmpeg: the computer's own, otherwise the copy inside the render engine ----------
const remotionCli = () =>
  ["runtime-edit", "runtime"].map((d) => path.join(DATA, d, "node_modules", "@remotion", "cli", "remotion-cli.js")).find((f) => fs.existsSync(f)) || "";
const hasSystem = (bin) => spawnSync(bin, ["-version"]).status === 0;
export function ff(args, { allowFail = false } = {}) {
  const [cmd, full] = hasSystem("ffmpeg") ? ["ffmpeg", args] : [process.execPath, [remotionCli(), "ffmpeg", ...args]];
  const r = spawnSync(cmd, full, { encoding: "utf8", maxBuffer: 1e9 });
  if (r.status !== 0 && !allowFail) fail(`video processing failed: ${String(r.stderr).slice(-400)}`);
  return r;
}

// Raw bytes from ffmpeg (for reading the sound itself).
export function ffRaw(args) {
  const [cmd, full] = hasSystem("ffmpeg") ? ["ffmpeg", args] : [process.execPath, [remotionCli(), "ffmpeg", ...args]];
  const r = spawnSync(cmd, full, { maxBuffer: 1e9 });
  if (r.status !== 0) fail(`video processing failed: ${String(r.stderr).slice(-300)}`);
  return r.stdout;
}

// ---------- measuring a video ----------
export function probe(video) {
  if (!video || !fs.existsSync(video)) fail("video file not found");
  // ffmpeg prints the stream facts on stderr when given no output; that works with either copy of ffmpeg.
  const info = ff(["-hide_banner", "-i", video], { allowFail: true }).stderr;
  const v = info.match(/Stream #.*Video:.*?, (\d{2,5})x(\d{2,5})/);
  const fps = info.match(/(\d+(?:\.\d+)?) fps/);
  const dur = info.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (!v || !dur) fail("this file does not look like a video");
  const rot = info.match(/rotate\s*:\s*(-?\d+)/);
  let w = +v[1], h = +v[2];
  if (rot && Math.abs(+rot[1]) % 180 === 90) [w, h] = [h, w];
  return { width: w, height: h, fps: fps ? +fps[1] : 30, duration: +dur[1] * 3600 + +dur[2] * 60 + +dur[3], audio: /Stream #.*Audio:/.test(info) };
}

// The sound, lined up with the picture (some phones start the sound a little late).
export const ALIGN = "aresample=async=1:first_pts=0";

// ---------- the member's videos folder ----------
const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi)$/i;
export function videosFolder() {
  const f = readConfig().videosFolder;
  if (f && fs.existsSync(f)) return f;
  fail("the videos folder is not set up yet. Run: studio.mjs folders");
}
// Originals are never changed. A video from elsewhere is copied into the drop folder, and the original is only
// moved (into the project's finished folder) after the member approves, by studio.mjs project --original.
export function start(given) {
  const root = videosFolder();
  const inbox = path.join(root, "Drop videos here");
  let video;
  if (given) {
    video = path.resolve(given);
    if (!fs.existsSync(video)) fail(`video not found: ${video}`);
    if (!video.startsWith(inbox + path.sep)) {
      const copy = path.join(inbox, path.basename(video));
      if (!fs.existsSync(copy)) fs.copyFileSync(video, copy);
      video = copy;
    }
  } else {
    const files = fs.readdirSync(inbox).filter((n) => VIDEO_EXT.test(n) && !n.startsWith(".")).map((n) => ({ n, t: fs.statSync(path.join(inbox, n)).mtimeMs }));
    if (!files.length) fail(`no video in ${inbox}. Put the recording there, or give its path.`);
    video = path.join(inbox, files.sort((a, b) => b.t - a.t)[0].n);
  }
  const name = path.basename(video).replace(/\.[^.]+$/, "");
  const p = openProject(root, name);
  return { video, work: p.work, finished: p.finished, project: p.folder, name };
}
