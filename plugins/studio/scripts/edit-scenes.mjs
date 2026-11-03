// Edit mode, the new way: Claude writes the scenes for this one video in a small Remotion project made from
// edit-starter. Everything else stays fixed: the layers, captions, sound mix, checks and versions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { DATA, PLUGIN_ROOT, ff, ffRaw, fail, opt, out, pos, probe, readConfig, readJson, writeJson } from "./edit-core.mjs";
import { nodeEnv } from "./home.mjs";
import { updateEngine } from "./engine-update.mjs";
import { makeCutout, ensureModel } from "./edit-cutout.mjs";
import { trackFace } from "./edit-track.mjs";
import { videoCheck } from "./edit-check.mjs";
import { finishedProjectName, jobNameOf, safeName } from "./projects.mjs";
import { SR, envelope, renderScore, rms, wav } from "./sound.mjs";

export const SCENE_COMMANDS = ["prepare", "cutout", "project", "scenecheck", "scenestills", "scenesample", "sceneopen", "scenerender", "scenegrade"];
const RUNTIME_EDIT = path.join(DATA, "runtime-edit");
const SKILLS_HOME = path.join(DATA, "edit-remotion");
const SKILLS_DIR = path.join(SKILLS_HOME, ".claude", "skills");
const CLI_ANIMATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "animate.mjs");
const importRuntime = (name) => import(pathToFileURL(createRequire(path.join(RUNTIME_EDIT, "package.json")).resolve(name)).href);

function requireEngine() {
  const want = readJson(path.join(PLUGIN_ROOT, "edit-runtime", "package.json")).version;
  let inst = null;
  try { inst = readJson(path.join(RUNTIME_EDIT, ".installed.json")); } catch {}
  if (inst?.version !== want && !updateEngine({ data: DATA, edit: true, from: inst?.version || "none", to: want }))
    fail("the Edit engine could not be installed by itself. Run: studio.mjs runtime install --engine edit");
}

// The official skills, from Remotion's own installer, in a folder of their own: they never join the member's list of skills.
function installSkills() {
  if (fs.existsSync(path.join(SKILLS_DIR, "remotion-best-practices", "SKILL.md"))) return "ready";
  fs.mkdirSync(SKILLS_HOME, { recursive: true });
  const win = process.platform === "win32";
  const r = spawnSync(win ? "npx.cmd" : "npx", ["--yes", "skills", "add", "remotion-dev/skills", "--agent", "claude-code", "-y"], { cwd: SKILLS_HOME, env: nodeEnv(), shell: win, encoding: "utf8", timeout: 180000 });
  return r.status === 0 && fs.existsSync(path.join(SKILLS_DIR, "remotion-best-practices", "SKILL.md")) ? "installed" : "missing";
}

function copyMissing(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyMissing(a, b);
    else if (!fs.existsSync(b)) fs.copyFileSync(a, b);
  }
}
const link = (a, b) => { fs.rmSync(b, { force: true }); try { fs.linkSync(a, b); } catch { fs.copyFileSync(a, b); } };

// The picture is 1080 wide: a 4K phone recording would only slow every frame down.
function stageVideo(edited, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (probe(edited).width <= 1080) { link(edited, file); return file; }
  if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < fs.statSync(edited).mtimeMs) {
    ff(["-v", "error", "-y", "-i", edited, "-an", "-vf", "scale=1080:-2", "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", file]);
  }
  return file;
}

function project(work) {
  // Three layouts the member picks from: above and around both cut the person out (scenes above their head, or
  // around and behind them, with a few pieces in front); frame puts them in a moving frame. "cutout" is the old name of around.
  const asked = String(opt.mode || ""), styleId = String(opt.style || "");
  const layout = asked === "cutout" ? "around" : asked;
  if (!["above", "around", "frame"].includes(layout)) fail("project needs --mode above, --mode around or --mode frame");
  const mode = layout === "frame" ? "frame" : "cutout";
  if (!styleId) fail("project needs --style <id>");
  const edited = path.join(work, "edited.mp4"), wordsFile = path.join(work, "edited.words.json");
  if (!fs.existsSync(edited) || !fs.existsSync(wordsFile)) fail("cut the video first: edited.mp4 and edited.words.json are missing from the work folder");
  const dir = path.join(work, "remotion");
  copyMissing(path.join(PLUGIN_ROOT, "edit-starter"), dir);
  const nm = path.join(dir, "node_modules");
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(RUNTIME_EDIT, "node_modules"), nm, process.platform === "win32" ? "junction" : "dir");
  const pub = path.join(dir, "public");
  fs.mkdirSync(pub, { recursive: true });
  const stage = stageVideo(edited, path.join(pub, "edited.mp4"));
  if (mode === "cutout") {
    const person = path.join(work, "person.webm");
    if (!fs.existsSync(person)) fail("the cutout look needs the cutout first: run edit.mjs cutout");
    link(person, path.join(pub, "person.webm"));
  }
  // The face: read from the guide once, then followed through the video.
  const given = opt.face ? String(opt.face).split(",").map(Number) : null;
  const faceFile = path.join(work, "face.json");
  let face = fs.existsSync(faceFile) ? readJson(faceFile) : null;
  if (given) {
    const f = { x: given[0], y: given[1], w: given[2] || 0.3 };
    const r = trackFace(edited, f);
    face = { ...f, track: r.track };
    writeJson(faceFile, face);
    if (r.lost > 0.2) console.log("warning: the face was lost in more than a fifth of the video. Check the numbers from the face guide");
  }
  if (!face) fail("project needs --face x,y,w the first time (read them from the face guide still)");
  // The style: the same files Animate reads. This only fetches them.
  const got = spawnSync(process.execPath, [CLI_ANIMATE, "style", styleId, "--data", DATA], { encoding: "utf8", env: nodeEnv() });
  const guide = (String(got.stdout).match(/^GUIDE=(.*)$/m) || [])[1];
  if (!guide || !fs.existsSync(guide)) fail(`the style ${styleId} could not be loaded: ${(String(got.stdout).match(/^REASON=(.*)$/m) || [])[1] || "unknown reason"}`);
  const style = readJson(path.join(path.dirname(guide), "style.json"));
  // Animate's own pieces (characters, props, drawings), so the video uses the style's real hero (pieces.tsx).
  // A fresh copy of the engine source each time; Animate itself is only read.
  const animSrc = path.join(PLUGIN_ROOT, "runtime", "src"), animDir = path.join(dir, "src", "animate");
  fs.rmSync(animDir, { recursive: true, force: true });
  fs.cpSync(animSrc, animDir, { recursive: true, filter: (f) => !/(index|Root|Hello)\.tsx?$/.test(f) });
  fs.copyFileSync(path.join(PLUGIN_ROOT, "scripts", "chibi-names.mjs"), path.join(animDir, "names.mjs"));
  for (const sub of ["fonts", "tex"]) copyMissing(path.join(PLUGIN_ROOT, "runtime", "public", sub), path.join(pub, sub));
  const m = probe(stage);
  const raw = readJson(wordsFile), words = (raw.words || raw).map((w) => [+(+w[0]).toFixed(2), +(+w[1]).toFixed(2), String(w[2]).trim()]);
  const fps = Math.round(m.fps) || 30;
  fs.writeFileSync(path.join(dir, "src", "data.ts"), `// Made by edit.mjs project. Do not edit: it is remade from the cut video.
export const MODE: "cutout" | "frame" = ${JSON.stringify(mode)};
export const LAYOUT: "above" | "around" | "frame" = ${JSON.stringify(layout)};
export const FPS = ${fps};
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const VIDEO_SECONDS = ${m.duration.toFixed(3)};
export const VIDEO_SHAPE = { width: ${m.width}, height: ${m.height} };
export const WORDS: [number, number, string][] = ${JSON.stringify(words)};
export const FACE: { x: number; y: number; w: number; track?: { step: number; x: number[]; y: number[] } } = ${JSON.stringify(face)};
export const TOKENS = ${JSON.stringify(style.tokens || {})} as any;
export const STYLE = ${JSON.stringify(style)} as any;
`);
  writeJson(path.join(work, "scenes.config.json"), { mode, layout, style: styleId, guide, sound: style.sound || {} });
  out("RESULT", "project_ready");
  out("PROJECT", dir);
  out("SCENES_FILE", path.join(dir, "src", "scenes.tsx"));
  out("SOUND_FILE", path.join(dir, "src", "sound.json"));
  out("STYLE_GUIDE", guide);
  out("MODE", mode);
  out("LAYOUT", layout);
  out("FPS", fps);
}

async function bundleProject(work) {
  const dir = path.join(work, "remotion");
  if (!fs.existsSync(path.join(dir, "src", "data.ts"))) fail("make the project first: edit.mjs project");
  const { bundle } = await importRuntime("@remotion/bundler");
  try {
    return { dir, serveUrl: await bundle({ entryPoint: path.join(dir, "src", "index.ts"), rootDir: dir, publicDir: path.join(dir, "public"), onProgress: () => {} }) };
  } catch (e) {
    fail(`the scene code does not compile: ${String(e.message || e).slice(0, 900).replace(/\n/g, " ")}`);
  }
}
async function compositionFor(serveUrl, props = {}) {
  const { selectComposition } = await importRuntime("@remotion/renderer");
  const browserExecutable = readConfig().browserExecutable || undefined;
  try { return { browserExecutable, composition: await selectComposition({ serveUrl, id: "Edit", inputProps: props, browserExecutable, logLevel: "error" }) }; }
  catch (e) { fail(`the scene code stops with an error: ${String(e.message || e).split("\n")[0]}`); }
}

const faceAt = (face, t) => {
  const tr = face.track;
  if (!tr) return { x: face.x, y: face.y };
  const i = Math.max(0, Math.min(tr.x.length - 1, Math.round(t / tr.step)));
  return { x: tr.x[i], y: tr.y[i] };
};

// Text is drawn pure magenta on a transparent page (no video at all, so this is fast), then measured against the
// face and the areas the phone's buttons cover. All spoken words and <Say> text are seen here.
async function sceneCheck(work) {
  const { dir, serveUrl } = await bundleProject(work);
  const { composition, browserExecutable } = await compositionFor(serveUrl, { check: true });
  const { renderStill, openBrowser } = await importRuntime("@remotion/renderer");
  const face = readJson(path.join(work, "face.json"));
  const fps = composition.fps, dur = composition.durationInFrames / fps;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-check-"));
  const browser = await openBrowser("chrome", { browserExecutable, logLevel: "error" });
  const times = [];
  for (let t = 0.2; t < dur; t += 0.4) times.push(+t.toFixed(2));
  const SCALE = 0.25, W = 270, H = 480;
  try {
    let i = 0;
    for (const t of times) {
      await renderStill({ composition, serveUrl, puppeteerInstance: browser, output: path.join(tmp, `c${String(i++).padStart(4, "0")}.png`), imageFormat: "png", frame: Math.min(composition.durationInFrames - 1, Math.round(t * fps)), inputProps: { check: true }, scale: SCALE, logLevel: "error" });
    }
  } catch (e) { fail(`the scene code stops with an error: ${String(e.message || e).split("\n")[0]}`); }
  await browser.close({ silent: true });
  const buf = ffRaw(["-v", "error", "-i", path.join(tmp, "c%04d.png"), "-start_number", "0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  fs.rmSync(tmp, { recursive: true, force: true });
  const hits = { face: [], frame: [], margin: [], bottom: [], right: [] };
  let textFrames = 0;
  const sizeFrame = W * H * 4;
  times.forEach((t, n) => {
    if ((n + 1) * sizeFrame > buf.length) return;
    const f = faceAt(face, t), hw = (face.w * 0.58) * W;
    const box = { x0: f.x * W - hw, x1: f.x * W + hw, y0: f.y * H - hw * 1.25, y1: f.y * H + hw * 1.15 };
    const c = { any: 0, face: 0, frame: 0, margin: 0, bottom: 0, right: 0 };
    const q = n * sizeFrame;
    const noPerson = buf[q + 3] > 200 && buf[q] < 60 && buf[q + 1] > 200 && buf[q + 2] < 60;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = n * sizeFrame + (y * W + x) * 4;
      if (buf[p + 3] > 200 && buf[p] > 200 && buf[p + 1] > 100 && buf[p + 1] < 170 && buf[p + 2] > 100 && buf[p + 2] < 170) { c.any++; c.frame++; continue; } // text under the see through frame
      if (buf[p + 3] < 120 || buf[p] < 170 || buf[p + 1] > 90 || buf[p + 2] < 170) continue;
      c.any++;
      if (!noPerson && x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) c.face++;
      if (x < 12 || x > W - 12) c.margin++;
      if (y > 1720 * SCALE) c.bottom++;
      if (x > W - 30 && y > 900 * SCALE) c.right++;
    }
    if (c.any) textFrames++;
    for (const k of ["face", "frame", "margin", "bottom", "right"]) if (c[k] > 6) hits[k].push(t);
  });
  const say = { face: "text over the face", frame: "text over the frame", margin: "text too close to the side of the picture", bottom: "text under the phone's bottom bar", right: "text under the phone's side buttons" };
  let count = 0;
  for (const [k, list] of Object.entries(hits)) if (list.length) { count++; console.log(`problem: ${say[k]} at ${list.slice(0, 12).join(", ")} s`); }
  if (!textFrames) console.log("warning: no text was found at all. Text and captions must use <Say> or <Captions>");
  out("RESULT", count ? "problems" : "clean");
  out("PROBLEMS", count);
  out("DURATION", dur.toFixed(1));
}

async function sceneStills(work) {
  const { serveUrl } = await bundleProject(work);
  const { composition, browserExecutable } = await compositionFor(serveUrl);
  const { renderStill, openBrowser } = await importRuntime("@remotion/renderer");
  const dur = composition.durationInFrames / composition.fps;
  const times = opt.at ? String(opt.at).split(",").map(Number) : Array.from({ length: 12 }, (_, i) => +(((i + 0.5) / 12) * dur).toFixed(2));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-stills-"));
  const browser = await openBrowser("chrome", { browserExecutable, logLevel: "error" });
  let i = 0;
  try {
    for (const t of times) await renderStill({ composition, serveUrl, puppeteerInstance: browser, output: path.join(tmp, `s${String(i++).padStart(3, "0")}.png`), frame: Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps)), scale: 0.3, logLevel: "error" });
  } catch (e) { fail(`the scene code stops with an error: ${String(e.message || e).split("\n")[0]}`); }
  await browser.close({ silent: true });
  const file = path.resolve(String(opt.out || path.join(work, "scene stills.png")));
  const cols = Math.min(times.length, 6);
  ff(["-v", "error", "-y", "-i", path.join(tmp, "s%03d.png"), "-vf", `tile=${cols}x${Math.ceil(times.length / cols)}:padding=8:color=white`, "-frames:v", "1", file]);
  fs.rmSync(tmp, { recursive: true, force: true });
  out("RESULT", "stills");
  out("TIMES", times.join(","));
  out("FILE", file);
}

// ---------- sound: the style's own score, a few quiet effects from sound.json, ducked under the voice ----------
const seq = (n, fn) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = fn(i / SR, i); return o; };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const FX = {
  pop: () => seq(0.1 * SR | 0, (t) => Math.sin(2 * Math.PI * (560 * t + 500 * t * t)) * Math.exp(-t * 42)),
  thump: () => seq(0.3 * SR | 0, (t) => Math.sin(2 * Math.PI * (58 * t + 1.2 * (1 - Math.exp(-t * 25)))) * Math.exp(-t * 12)),
  chime: () => seq(2 * SR | 0, (t) => (Math.sin(2 * Math.PI * 1319 * t) + 0.5 * Math.sin(2 * Math.PI * 2638 * t) * Math.exp(-t * 3)) * Math.exp(-t * 2.6) * 0.3),
  // kept very soft and dark on purpose: a loud whoosh was the first thing Abner asked to remove
  whoosh: () => { const d = 0.45, n = d * SR | 0; let v = 0; return seq(n, (t) => { v += 0.03 * (rnd() - v); return v * Math.sin((Math.PI * t) / d) ** 2 * 0.5; }); },
};
const FX_LEVEL = { pop: 0.35, thump: 0.6, chime: 0.35, whoosh: 0.5 };
const decodeMono = (file) => { const b = ffRaw(["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"]); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2); };
const loudness = (f, af = "anull") => { const all = String(ff(["-hide_banner", "-i", f, "-af", `${af},ebur128`, "-f", "null", "-"], { allowFail: true }).stderr).match(/I:\s+(-?[\d.]+) LUFS/g) || ["I: -23 LUFS"]; return parseFloat(all[all.length - 1].replace("I:", "")); };

function mixSound(work, silent, outFile, range = null) {
  const cfg = readJson(path.join(work, "scenes.config.json"));
  const events = (() => { try { return readJson(path.join(work, "remotion", "src", "sound.json")); } catch { return []; } });
  const list = events();
  const silentM = probe(silent);
  const start = range ? range[0] : 0;
  const total = silentM.duration;
  const full = range ? range[1] : total;
  const voice = decodeMono(path.join(work, "edited.mp4"));
  const D = Math.max(full, voice.length / SR) + 0.5, n = Math.ceil(D * SR);
  const sb = { duration: D, scenes: [{ start: 0, end: D, blocks: [] }] };
  const music = renderScore(sb, cfg.sound?.score);
  const fx = new Float32Array(n);
  for (const e of list) {
    const s = FX[e.kind]?.(); if (!s) { console.log(`warning: sound.json has an unknown effect "${e.kind}" (use pop, whoosh, thump or chime)`); continue; }
    const at = Math.round(e.at * SR), g = (e.g ?? 1) * FX_LEVEL[e.kind];
    for (let i = 0; i < s.length && at + i < n; i++) if (at + i >= 0) fx[at + i] += s[i] * g;
  }
  const env = envelope(voice), duck = cfg.sound?.duck ?? 0.45;
  const mg = (rms(voice) * 10 ** ((cfg.sound?.score?.level ?? -15) / 20)) / (rms(music) || 1);
  const fg = rms(voice) * 5.5; // effects follow the voice's level, so quiet recordings get quiet effects
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = (voice[i] ?? 0) + (music[i] ?? 0) * mg * (1 - duck * (env[i] ?? 0)) + fx[i] * fg;
  // a gentle ending: the music fades over the last second and a half
  const fadeFrom = (D - 0.5 - 1.5) * SR;
  for (let i = Math.max(0, fadeFrom | 0); i < n; i++) { const k = Math.max(0, 1 - (i - fadeFrom) / (1.5 * SR)); mix[i] = (voice[i] ?? 0) + (mix[i] - (voice[i] ?? 0)) * k; }
  const dir = path.dirname(silent), mixWav = path.join(dir, ".mix.wav");
  const slice = mix.subarray(Math.round(start * SR), Math.min(n, Math.round(full * SR)));
  fs.writeFileSync(mixWav, wav(slice));
  const chain = (g) => `volume=${g.toFixed(2)}dB,alimiter=limit=0.78:attack=2:release=40:level=false`;
  let gain = -14 - loudness(mixWav);
  gain += -14 - loudness(mixWav, chain(gain)); // second pass corrects for the limiter
  if (process.env.AR_DEBUG) console.error(`mix gain ${gain.toFixed(1)} dB`);
  ff(["-v", "error", "-y", "-i", silent, "-i", mixWav, "-af", chain(gain), "-ar", "48000", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", outFile]);
  fs.rmSync(mixWav, { force: true });
}

async function renderScenes(work, outFile, range = null) {
  const t0 = Date.now();
  const { serveUrl } = await bundleProject(work);
  const { composition, browserExecutable } = await compositionFor(serveUrl);
  const { renderMedia } = await importRuntime("@remotion/renderer");
  const silent = path.join(work, ".silent.mp4");
  let last = -1;
  const fr = range ? [Math.round(range[0] * composition.fps), Math.min(composition.durationInFrames - 1, Math.round(range[1] * composition.fps) - 1)] : null;
  try {
    await renderMedia({ composition, serveUrl, codec: "h264", crf: 18, colorSpace: "bt709", muted: true, outputLocation: silent, browserExecutable, logLevel: "error", concurrency: Math.max(2, Math.min(6, os.cpus().length - 2)), ...(fr ? { frameRange: fr } : {}),
      onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.error(`rendering ${p * 10}%`); } } });
  } catch (e) { fail(`the video could not be rendered: ${String(e.message || e).split("\n")[0]}`); }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  mixSound(work, silent, outFile, range);
  fs.rmSync(silent, { force: true });
  return { duration: composition.durationInFrames / composition.fps, seconds: (Date.now() - t0) / 1000 };
}

function saveScenesVersion(work, note) {
  const vdir = path.join(work, "versions");
  fs.mkdirSync(vdir, { recursive: true });
  const all = fs.readdirSync(vdir).filter((n) => /^V\d+$/.test(n)).sort();
  const v = "V" + String((all.length ? +all[all.length - 1].slice(1) : 0) + 1).padStart(2, "0");
  fs.cpSync(path.join(work, "remotion", "src"), path.join(vdir, v, "src"), { recursive: true });
  const log = path.join(work, "versions.csv");
  if (!fs.existsSync(log)) fs.writeFileSync(log, "version,date,note\n");
  fs.appendFileSync(log, `${v},${new Date().toISOString().slice(0, 16).replace("T", " ")},"${String(note).replace(/"/g, "'")}"\n`);
  return v;
}

// ---------- colour grade: always the member's choice, offered at the end. Nothing is graded until they say so ----------
// The default the member sees first (Abner, 3 Nov 2026, after comparing 1 and 1.6 with the preview fixed).
const GRADE_STRENGTH = 1;
function gradeFrom(hex, strength, saturate) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) fail("the colour grade needs --tint as a colour like #2f7bf6");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  // Tone the darks and the middle towards the tint, keep whites clean. Strength 1 is subtle; the default is GRADE_STRENGTH.
  const SHIFT = [0.03, 0.03, 0.04, 0.04, 0];
  const curve = (c) => [0, 0.25, 0.5, 0.75, 1].map((v, i) => +Math.max(0, Math.min(1, v + SHIFT[i] * strength * ((c - 0.5) / 0.46))).toFixed(3));
  return { saturate: saturate, r: curve(r), g: curve(g), b: curve(b) };
}
async function sceneGrade(work) {
  const file = path.join(work, "remotion", "src", "grade.json");
  if (!fs.existsSync(path.dirname(file))) fail("make the project first: edit.mjs project");
  if (opt.none) { fs.writeFileSync(file, "null\n"); out("RESULT", "no_grade"); return; }
  const grade = gradeFrom(opt.tint, opt.strength === undefined ? GRADE_STRENGTH : Number(opt.strength), opt.saturate === undefined ? 0.88 : Number(opt.saturate));
  if (opt.apply) { writeJson(file, grade); out("RESULT", "grade_applied"); return; }
  // The preview: the same frame without and with the grade, side by side.
  const { serveUrl } = await bundleProject(work);
  const { composition, browserExecutable } = await compositionFor(serveUrl);
  const { renderStill } = await importRuntime("@remotion/renderer");
  const frame = Math.min(composition.durationInFrames - 1, Math.round((Number(opt.at) || composition.durationInFrames / composition.fps / 3) * composition.fps));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-grade-"));
  const sheet = path.resolve(String(opt.out || path.join(work, "colour grade preview.png")));
  for (const [name, g] of [["a", null], ["b", grade]]) {
    // The still is drawn from the composition's own props, so the grade goes there (inputProps alone are not used).
    const props = { ...composition.props, grade: g };
    await renderStill({ composition: { ...composition, props }, serveUrl, output: path.join(tmp, `${name}.png`), frame, inputProps: props, browserExecutable, scale: 0.5, logLevel: "error" });
  }
  ff(["-v", "error", "-y", "-i", path.join(tmp, "a.png"), "-i", path.join(tmp, "b.png"), "-filter_complex", "[0][1]hstack", "-frames:v", "1", sheet]);
  fs.rmSync(tmp, { recursive: true, force: true });
  out("RESULT", "preview");
  out("LEFT", "without");
  out("RIGHT", "with");
  out("FILE", sheet);
}

const PREVIEW = path.join(DATA, ".scene-preview.json");
function stopOpen() { try { const { pid } = readJson(PREVIEW); try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); } } catch {} fs.rmSync(PREVIEW, { force: true }); }

export async function sceneCommand(cmd) {
  if (cmd === "sceneopen" && opt.stop) { stopOpen(); out("RESULT", "stopped"); return; }
  if (cmd === "prepare") {
    requireEngine();
    const skills = installSkills();
    if (opt.cutout) await ensureModel();
    out("RESULT", "ready");
    out("REMOTION_SKILLS", skills);
    if (skills !== "missing") out("REMOTION_SKILLS_FOLDER", SKILLS_DIR);
    return;
  }
  requireEngine();
  if (cmd === "cutout") {
    const video = path.resolve(pos[1] || "");
    if (!fs.existsSync(video)) fail("cutout needs the cut video (edited.mp4)");
    const file = path.resolve(String(opt.out || path.join(path.dirname(video), "person.webm")));
    const r = await makeCutout(stageVideo(video, path.join(path.dirname(file), "remotion", "public", "edited.mp4")), file);
    r.problems.forEach((p) => console.log(`warning: ${p}`));
    out("RESULT", "cut_out");
    out("QUALITY", r.quality);
    out("FRAMES", r.frames);
    out("FILE", file);
    return;
  }
  const work = path.resolve(pos[1] || "");
  if (!fs.existsSync(work) || !fs.statSync(work).isDirectory()) fail("give the work folder of this video");
  if (cmd === "project") return project(work);
  if (cmd === "scenecheck") return sceneCheck(work);
  if (cmd === "scenestills") return sceneStills(work);
  if (cmd === "scenegrade") return sceneGrade(work);
  if (cmd === "sceneopen") {
    stopOpen();
    const dir = path.join(work, "remotion"), port = Number(opt.port) || 3124;
    const cli = path.join(RUNTIME_EDIT, "node_modules", "@remotion", "cli", "remotion-cli.js");
    const log = fs.openSync(path.join(work, ".timeline.log"), "w");
    const child = spawn(process.execPath, [cli, "studio", "src/index.ts", `--port=${port}`, "--no-open"], { cwd: dir, detached: true, stdio: ["ignore", log, log] });
    child.unref();
    writeJson(PREVIEW, { pid: child.pid });
    const url = `http://localhost:${port}`;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { if ((await fetch(url)).ok) { out("RESULT", "open"); out("PREVIEW_URL", url); return; } } catch {}
    }
    fail("the timeline did not start");
  }
  if (cmd === "scenesample") {
    const range = opt.range ? String(opt.range).split(",").map(Number) : [0, 10];
    const file = path.join(work, `sample ${range[0]} to ${range[1]}.mp4`);
    const r = await renderScenes(work, file, range);
    out("RESULT", "rendered");
    out("FILE", file);
    out("SECONDS", r.seconds.toFixed(0));
    return;
  }
  // scenerender
  const finalMode = !!opt.final;
  const root = readConfig().videosFolder || path.dirname(path.dirname(work));
  const name = opt.name ? String(opt.name) : jobNameOf(path.basename(work));
  const nextVersion = () => { const d = path.join(work, "versions"), all = fs.existsSync(d) ? fs.readdirSync(d).filter((n) => /^V\d+$/.test(n)).sort() : []; return "V" + String((all.length ? +all[all.length - 1].slice(1) : 0) + 1).padStart(2, "0"); };
  const file = finalMode ? path.join(root, "Finished videos", finishedProjectName(path.basename(work)), `${safeName(name)} ${nextVersion()}.mp4`) : path.join(work, "draft.mp4");
  const r = await renderScenes(work, file);
  const version = finalMode ? saveScenesVersion(work, opt.note || "") : "";
  const raw = readJson(path.join(work, "edited.words.json"));
  const res = await videoCheck(file, { expectedDuration: r.duration, expectedWords: raw, transcript: finalMode });
  res.notes.forEach((n) => console.log(`note: ${n}`));
  res.warnings.forEach((w) => console.log(`warning: ${w}`));
  out("RESULT", "rendered");
  out("FILE", file);
  if (version) out("VERSION", version);
  out("DURATION", r.duration.toFixed(1));
  out("SECONDS", r.seconds.toFixed(0));
  out("CHECK", res.warnings.length ? `${res.warnings.length}_warnings` : "clean");
}
