#!/usr/bin/env node
// Animation Room Studio: Animate mode. Uses the runtime and speech engine that setup installed.
//
//   node animate.mjs styles                                   list styles in the catalog (plus personal styles, see personalStylesDir)
//   node animate.mjs style <id>                               fetch a style (style.json + guide.md)
//   node animate.mjs transcribe <audio> [words.json] [--language pt]   word timings (language is detected when left out)
//   node animate.mjs validate <storyboard.json> --words <words.json>
//   node animate.mjs stills <storyboard.json> --words <w.json> [--at 1,4,8] [--out sheet.png] [--scale 1]
//   node animate.mjs review <video.mp4> [--count 10] [--out sheet.png]   frames of a finished video on one sheet
//   node animate.mjs render <storyboard.json> --words <w.json> --vo <audio> --out <file.mp4>
//
// Every command takes --data <folder> (or reads CLAUDE_PLUGIN_DATA). The last lines printed are KEY=value.

import { updateEngine } from "./engine-update.mjs";
import { resolveData, noteAdopted } from "./home.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transcribeWords } from "./speech.mjs";
import { SR, renderScore, renderSfx, envelope, rms, wav } from "./sound.mjs";
import { expandChibi } from "./chibi-names.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.AR_API || "https://animationroom.app/api"; // Placeholder until the server is live.
const BLOCK_TYPES = ["path", "morph", "dot", "label", "text", "note", "counter", "ruler", "mark", "travel", "cutout", "ransom", "face", "shape", "prop", "person", "badge", "caption", "group", "hero", "splat", "stamp", "frame", "posterWord", "posterHero", "posterRing", "posterCards", "posterBanner", "posterArrow", "posterSparks", "posterStars", "posterPanel", "posterBar", "posterButton", "posterTile", "posterSlots", "posterSplit", "posterGauge", "posterSteps", "posterRecap", "posterJourney", "bean", "beanTitle", "beanBadge", "beanProp", "beanDraw", "beanInfo", "voxCard", "voxTag", "voxText", "voxHighlight", "voxLine", "voxStamp", "voxChip", "voxMark", "voxNumbers", "voxList", "voxNetwork", "voxSparks", "voxArt", "voxDraw", "voxSubscribe", "voxGroup"];
// engine 1.7 Happy Bean: names the validator checks (the engine draws them in bean.tsx)
const BEAN_MOODS = ["happy", "grin", "joy", "laugh", "wink", "calm", "curious", "thinking", "surprised", "shocked", "worried", "sad", "crying", "angry", "determined", "proud", "sleepy", "love", "confused", "shy"];
const BEAN_POSES = ["stand", "wave", "point", "pointup", "cheer", "shrug", "think", "hips", "hold", "read", "hug", "open", "highfive", "facepalm", "sad", "walk", "run", "climb", "jump", "fall", "sit", "sleep", "peek", "carry", "tiptoe", "holdhand", "bothhands"];
const BEAN_BUILDS = ["bean", "round", "tall", "kid", "elder"];
const BEAN_HAIR = ["tuft", "bow", "curl", "bun", "sprout", "grey", "pony"];
const BODY_PARTS = ["head", "temple", "eye", "jaw", "neck", "shoulder", "chest", "heart", "belly", "back", "hip", "arm", "hand", "knee", "foot"];
const INFO_KINDS = ["list", "compare", "myth", "counter", "percent", "pie", "timeline", "quote"];
const DRAW_ANIMS = ["none", "bob", "spin", "pulse", "shake", "sway", "float"];
const BEAN_ITEMS = ["cane", "book", "flag", "heart", "coin", "phone", "bulb", "balloon", "trophy", "pencil", "star"];
const BEAN_WEAR = ["headband", "cap", "glasses", "crown", "grad"];
const BEAN_PROPS = ["ground", "disc", "network", "stairs", "sunburst", "book", "bubble", "podium", "finish", "mountain", "phone", "laptop", "desk", "bulb", "clock", "calendar", "heart", "coins", "chart", "cloud", "plant", "door", "signpost", "magnifier", "trophy", "arrow", "sparks", "star", "check", "cross", "crowd", "gift", "rocket", "house", "bed", "scale", "puzzle", "target", "battery", "shield", "chain", "cup"];
// engine 1.8 raw Vox look: names the validator checks (the engine draws them in vox.tsx)
const VOX_ART = ["head", "brain", "mind", "person", "leader", "giant", "crowd", "anvil", "hammer", "iron", "fire", "thermometer", "book", "bible", "scroll", "tablets", "map", "pin", "target", "chart", "magnifier", "calendar", "daynight", "tally", "road", "bubble", "thought", "cloud", "mountain", "speaker", "cycle", "sun", "moon", "star", "heart", "bulb", "key", "shield", "sword", "crown", "dove", "lamp", "tent", "wall", "trumpet", "cross", "sheep", "mug", "bell", "cursor"];
const VOX_FONTS = ["print", "serif", "italic", "hand", "hebrew"];
const VOX_MARKS = ["tick", "cross", "circle", "underline", "box"];
const VOX_TONES = ["dark", "light", "red", "white"];
const VOX_ENTER = ["pop", "rise", "drop", "left", "right", "fade", "none"];
const HERO_SHAPES = ["circle", "square", "triangle", "hexagon", "gem", "star", "drop", "heart", "arrow", "shield", "pill", "cross", "house", "leaf"];
const FRAME_FAMILIES = ["rough", "dashed", "cloud", "zigzag", "corners"];
const FORMATS = { "9:16": [1080, 1920], "16:9": [1920, 1080] };
const TRANSITIONS = ["cut", "iris", "page", "swipe", "slide", "pan", "zoom"];
const MARK_KINDS = ["circle", "box", "underline", "cross", "tick", "burst"];
const PATTERNS = ["plain", "dots", "lines", "halftone", "print"];
const PROP_KINDS = ["heart", "star", "bulb", "cloud", "rock", "coin", "weight", "diamond", "flag", "clock", "check", "bolt", "bubble", "desk", "chair", "plant", "books", "sign", "ff", "shop", "umbrella", "compass", "arrow", "calendar", "rays", "buddy", "thought", "sun", "ribbon", "figure", "moon", "field", "stars", "block", "lens"];
const STAMP_KINDS = ["star", "heart", "bolt", "arrow", "burst", "drop", "cloud"];
const EYES = ["open", "wide", "happy", "closed", "sad", "squint", "spiral", "x"];
const MOUTHS = ["smile", "big", "sad", "o", "flat", "wobble", "smirk", "grit"];
const BROWS = ["normal", "up", "worried", "angry", "flat", "none"];
const MOODS = ["smile", "grin", "flat", "wince", "surprised", "relief"];

// ---------- args, output ----------
const argv = process.argv.slice(2);
const pos = [], opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) opt[k] = v;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) opt[k] = argv[++i];
    else opt[k] = true;
  } else pos.push(a);
}
const out = (k, v) => console.log(`${k}=${v}`);
const fail = (reason) => {
  out("RESULT", "failed");
  out("REASON", reason);
  process.exit(1);
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const semverGte = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return true;
};

// ---------- studio folders (same layout as studio.mjs) ----------
const HOME = resolveData(opt.data);
noteAdopted(HOME);
const DATA = HOME.data;
const RUNTIME = path.join(DATA, "runtime");
const TEMPLATE = readJson(path.join(PLUGIN_ROOT, "runtime", "package.json"));
const ENGINE_VERSION = TEMPLATE.studioEngine || "1.0.0";
const readConfig = () => {
  try {
    return readJson(path.join(DATA, "config.json"));
  } catch {
    return {};
  }
};

function requireRuntime() {
  let inst;
  try {
    inst = readJson(path.join(RUNTIME, ".installed.json"));
  } catch {
    fail("the render engine is not installed yet. Run the studio setup first (say: set up my studio).");
  }
  if (inst.version !== TEMPLATE.version) {
    if (!updateEngine({ data: DATA, from: inst.version, to: TEMPLATE.version }))
      fail(`the render engine is out of date (installed ${inst.version}, this plugin needs ${TEMPLATE.version}) and could not be updated by itself. Run: studio.mjs runtime install`);
  }
}
const runtimeRequire = () => createRequire(path.join(RUNTIME, "package.json"));
const importRuntime = (name) => import(pathToFileURL(runtimeRequire().resolve(name)).href);
const remotionCli = () => path.join(RUNTIME, "node_modules", "@remotion", "cli", "remotion-cli.js");

// ffmpeg: the computer's own if it has one, otherwise the copy that ships with the render engine.
function ff(args, { encoding = "buffer", allowFail = false } = {}) {
  const sys = spawnSync("ffmpeg", ["-version"]).status === 0;
  const [cmd, full] = sys ? ["ffmpeg", args] : [process.execPath, [remotionCli(), "ffmpeg", ...args]];
  const r = spawnSync(cmd, full, { encoding, maxBuffer: 1e9 });
  if (r.status !== 0 && !allowFail) fail(`audio or video processing failed: ${String(r.stderr).slice(-400)}`);
  return r;
}
function browser() {
  const cfg = readConfig();
  if (cfg.browserExecutable) return cfg.browserExecutable;
  if (process.env.AR_BROWSER) return process.env.AR_BROWSER;
  const pw = "/opt/pw-browsers"; // Claude's cloud workspace ships a headless browser here.
  if (fs.existsSync(pw)) {
    const d = fs.readdirSync(pw).find((x) => x.startsWith("chromium_headless_shell"));
    if (d) return path.join(pw, d, "chrome-linux", "headless_shell");
  }
  return null; // Remotion uses the browser that setup downloaded.
}

// ---------- styles: server, local dev folder, then cache ----------
// Development: a local copy of the style library (config stylesDir, or AR_STYLES_DIR) instead of the server.
const localStyles = () => readConfig().stylesDir || process.env.AR_STYLES_DIR || "";
// Personal styles: a folder on this computer only (config personalStylesDir, or AR_PERSONAL_STYLES) with its own
// catalog.json and styles/<id>/ files. They are never on the website; they sit next to the library styles and win on the same id.
const personalStyles = () => readConfig().personalStylesDir || process.env.AR_PERSONAL_STYLES || "";
function withPersonal(c) {
  const dir = personalStyles();
  if (!dir) return c;
  let mine;
  try {
    mine = readJson(path.join(dir, "catalog.json")).styles.map((s) => ({ ...s, personal: true }));
  } catch {
    out("PERSONAL_STYLES", "unreadable");
    return c;
  }
  return { ...c, styles: [...mine, ...c.styles.filter((s) => !mine.some((m) => m.id === s.id))] };
}

async function fetchText(url, binary = false) {
  const lic = readConfig().license || {};
  const r = await fetch(url, { headers: { "x-license-key": lic.key || "", authorization: lic.token ? `Bearer ${lic.token}` : "", "x-studio-engine": ENGINE_VERSION } });
  if (r.status === 401 || r.status === 403) {
    let said = "";
    try { said = (await r.json()).message || ""; } catch {}
    // A saved key that worked before is not a reason to ask for it again: servers hiccup. Only a refused or unknown key needs the member.
    fail(`${said || "the license server did not accept the saved license key."} If this studio was activated before, do not ask for the key again: try the command once more in a minute. Only when the message says the key was not recognised, refunded or ended, ask the person for their key (or the new one) and run the activate step, and point them to support@animationroom.app if it keeps failing.`);
  }
  if (r.status === 503) fail("the license server could not be reached just now. Nothing is wrong with the license: try the command again in a minute.");
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}
async function catalog() {
  return withPersonal(await libraryCatalog());
}
async function libraryCatalog() {
  if (localStyles()) return readJson(path.join(localStyles(), "catalog.json"));
  const cached = path.join(DATA, "catalog.json");
  try {
    const c = JSON.parse(await fetchText(`${API}/catalog`));
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(cached, JSON.stringify(c, null, 2));
    return c;
  } catch (e) {
    if (fs.existsSync(cached)) return readJson(cached);
    fail(`could not reach the Animation Room style library (${e.message}). Check the internet connection and try again.`);
  }
}
async function getStyle(id) {
  const c = await catalog();
  if (c.latestEngine && !semverGte(ENGINE_VERSION, c.latestEngine)) out("UPDATE_AVAILABLE", c.latestEngine);
  const entry = c.styles.find((s) => s.id === id);
  if (!entry) fail(`the style "${id}" is not in your library. Available: ${c.styles.map((s) => s.id).join(", ")}`);
  if (!semverGte(ENGINE_VERSION, entry.minEngine)) {
    out("UPDATE_REQUIRED", entry.minEngine);
    fail(`the ${entry.name} style needs a newer studio (engine ${entry.minEngine}, you have ${ENGINE_VERSION}). Run /plugin update studio, restart Claude, then try again.`);
  }
  const dir = path.join(DATA, "styles", id, entry.version);
  const src = entry.personal ? personalStyles() : localStyles();
  if (src || !fs.existsSync(path.join(dir, "style.json"))) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of entry.files) {
      // Reference sheets (png) are pictures: copy their bytes, never read them as text.
      const binary = !/\.(json|md)$/.test(f);
      const body = src
        ? fs.readFileSync(path.join(src, "styles", id, f), binary ? null : "utf8")
        : await fetchText(`${API}/styles/${id}/${entry.version}/${f}`, binary);
      fs.writeFileSync(path.join(dir, f), body);
    }
  }
  return { dir, entry, style: readJson(path.join(dir, "style.json")) };
}

// ---------- transcription (shared with Edit mode, see speech.mjs) ----------
async function transcribe(audio, outFile, language) {
  if (!audio || !fs.existsSync(audio)) fail("voiceover file not found");
  const words = await transcribeWords({ input: audio, data: DATA, ff, fail, out, language });
  fs.writeFileSync(outFile, JSON.stringify(words));
  console.log(words.map((w) => `${w[0].toFixed(2)} ${w[2]}`).join("\n"));
  out("RESULT", "transcribed");
  out("WORDS", words.length);
  out("FILE", path.resolve(outFile));
}

// ---------- validation and word references ----------
// Accents are folded so "@nao" and "@não" both find não; letters of any language are kept.
const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
function resolveTime(v, words, where) {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.startsWith("@")) throw new Error(`${where}: time must be a number or "@word", got ${JSON.stringify(v)}`);
  // A plus offset may be any number, a minus offset needs a decimal point (-0.09) so hyphenated words like @1,000-kilogram still work.
  const m = v.match(/^@(.+?)(?:#(\d+))?(\+\d*\.?\d+|-\d*\.\d+)?$/);
  if (!m) throw new Error(`${where}: cannot read time ${v}`);
  const target = norm(m[1]);
  const nth = Number(m[2] ?? 1);
  let count = 0;
  for (const w of words) if (norm(w[2]) === target && ++count === nth) return +(w[0] + Number(m[3] ?? 0)).toFixed(3);
  throw new Error(`${where}: the word "${m[1]}"${nth > 1 ? ` (#${nth})` : ""} is not in the voiceover`);
}

// Shapes a storyboard draws for its hero: an outline of points around the middle (0, 0), x and y from -1.5 to 1.5.
// The hero morphs along rays from its middle, so every part of the outline has to be visible from there.
function checkShapes(sb, errors) {
  if (sb.shapes === undefined) return;
  if (typeof sb.shapes !== "object" || Array.isArray(sb.shapes)) return errors.push(`shapes must look like {"name": {"points": [[x, y], ...]}}`);
  const names = Object.keys(sb.shapes);
  if (names.length > 8) errors.push(`shapes: ${names.length} drawn shapes is too many, keep it to 8`);
  for (const name of names) {
    const where = `shapes.${name}`, def = sb.shapes[name];
    if (!/^[a-z][a-z0-9]*$/.test(name)) errors.push(`${where}: name a shape with lower case letters and numbers only`);
    if (HERO_SHAPES.includes(name)) errors.push(`${where}: "${name}" is already a ready made shape, pick another name`);
    const pts = def?.points;
    const num = (v) => typeof v === "number" && Number.isFinite(v);
    if (!Array.isArray(pts) || pts.length < 3 || pts.length > 160 || !pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(num))) {
      errors.push(`${where}: needs "points", 3 to 160 pairs like [0.5, -0.8]`);
      continue;
    }
    if (pts.some((p) => Math.abs(p[0]) > 1.5 || Math.abs(p[1]) > 1.5)) errors.push(`${where}: keep every point between -1.5 and 1.5`);
    if (Math.max(...pts.map((p) => Math.hypot(p[0], p[1]))) < 0.7) errors.push(`${where}: the outline is very small, let it reach about 1 from the middle`);
    if (def.soften !== undefined && !(num(def.soften) && def.soften >= 0 && def.soften <= 10)) errors.push(`${where}: soften goes from 0 (sharp corners) to 10 (very round)`);
    if (def.lines !== undefined && !(Array.isArray(def.lines) && def.lines.length <= 12 && def.lines.every((l) => Array.isArray(l) && l.length === 4 && l.every(num)))) errors.push(`${where}: lines are up to 12 inner strokes like [x1, y1, x2, y2]`);
    // count how often a ray from the middle crosses the outline
    let none = 0, folded = 0;
    for (let i = 0; i < 180; i++) {
      const th = (i / 180) * Math.PI * 2, dx = Math.sin(th), dy = -Math.cos(th);
      const hits = [];
      for (let j = 0; j < pts.length; j++) {
        const [ax, ay] = pts[j], [bx, by] = pts[(j + 1) % pts.length];
        const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const tt = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
        if (tt > 1e-6 && u >= 0 && u <= 1) hits.push(tt);
      }
      const far = Math.max(0, ...hits);
      if (!hits.length) none++;
      else if (hits.some((h) => far - h > 0.08)) folded++;
    }
    if (none > 2) errors.push(`${where}: the middle (0, 0) is outside the outline. Draw the shape around its own middle`);
    else if (folded > 8) errors.push(`${where}: part of the outline hides behind another part when seen from the middle (0, 0), so it cannot morph cleanly. Use a simpler silhouette that is visible whole from its middle (a hook, ring or crescent will not work), or build that symbol from "shape" blocks instead`);
  }
}

const COLOR_NAMES = (style) => ["ink", "mid", "soft", "fill", "dark", "bg", "hatch", ...Object.keys(style.tokens?.palette ?? {})];

function validate(sbPath, wordsPath, style) {
  const sb = readJson(sbPath);
  const words = wordsPath ? readJson(wordsPath) : [];
  const errors = [], warnings = [];
  const T = (v, where) => {
    try {
      return resolveTime(v, words, where);
    } catch (e) {
      errors.push(e.message);
      return 0;
    }
  };
  checkShapes(sb, errors);
  if (sb.format !== undefined) {
    if (!FORMATS[sb.format]) errors.push(`format must be one of ${Object.keys(FORMATS).join(", ")}`);
    else if (style.formats && !style.formats.includes(sb.format)) errors.push(`the ${style.name} style is made for ${style.formats.join(" and ")}, not ${sb.format}`);
    else [sb.width, sb.height] = FORMATS[sb.format];
  }
  if (sb.fps === undefined && style.tokens?.motion?.fps) sb.fps = style.tokens.motion.fps;
  const lastWord = words.length ? words[words.length - 1][1] : 0;
  if (sb.duration === undefined || sb.duration === "auto") sb.duration = +(lastWord + (style.tokens?.tail ?? 0.9)).toFixed(2);
  if (sb.duration < lastWord) warnings.push(`duration ${sb.duration}s ends before the last word (${lastWord}s)`);

  const dash = /[\u2010-\u2015-]/;
  const checkText = (s, where) => {
    if (typeof s === "string" && dash.test(s)) errors.push(`${where}: on screen text must not contain hyphens or dashes: "${s}"`);
  };
  // the lowest things may sit: above the Instagram caption area in 9:16, above the bottom edge in 16:9
  const LOW = (sb.height ?? 1920) === 1920 ? 1560 : sb.height - 60, LOW_TEXT = (sb.height ?? 1920) === 1920 ? 1500 : sb.height - 80;
  const walk = (b, where, scene) => {
    if (!BLOCK_TYPES.includes(b.type)) errors.push(`${where}: unknown block type "${b.type}" (engine ${ENGINE_VERSION} knows ${BLOCK_TYPES.join(", ")})`);
    if (b.at !== undefined) b.at = T(b.at, where);
    if (b.out !== undefined) b.out = T(b.out, `${where}.out`);
    if (b.markerAt !== undefined) b.markerAt = T(b.markerAt, `${where}.markerAt`);
    if (b.keys) b.keys.forEach((k, i) => (k.t = T(k.t, `${where}.keys[${i}]`)));
    if (b.type === "morph" && b.at === undefined) b.at = b.keys?.[0]?.t;
    ["text", "kicker", "caption", "unit", "sub"].forEach((f) => checkText(b[f], `${where}.${f}`));
    (b.lines ?? []).forEach((l, i) => checkText(l, `${where}.lines[${i}]`));
    if ((b.type === "path" || b.type === "travel") && !b.d) errors.push(`${where}: ${b.type} needs "d"`);
    if (b.type === "cutout") {
      if (!style.tokens?.paper) errors.push(`${where}: the ${style.name} style has no paper pieces, so it cannot use "cutout"`);
      if (!b.d && !((["circle", "ellipse", "rect"].includes(b.shape) || STAMP_KINDS.includes(b.kind)) && typeof b.x === "number" && typeof b.y === "number")) errors.push(`${where}: cutout needs "d", or "shape" (circle, ellipse, rect), or "kind" (${STAMP_KINDS.join(", ")}), with "x" and "y"`);
      if (b.pattern !== undefined && !PATTERNS.includes(b.pattern)) errors.push(`${where}: pattern must be one of ${PATTERNS.join(", ")}`);
      if (!b.color) errors.push(`${where}: cutout needs a "color"`);
      checkText(b.text, `${where}.text`);
      (b.blocks ?? []).forEach((c, i) => { if (c.at === undefined) c.at = b.at; walk(c, `${where}.blocks[${i}]`, scene); });
    }
    if (b.type === "ransom") {
      if (!style.tokens?.paper) errors.push(`${where}: the ${style.name} style has no paper pieces, so it cannot use "ransom"`);
      if (!b.text && !b.lines?.length) errors.push(`${where}: ransom needs "text" or "lines"`);
      if (typeof b.y !== "number") errors.push(`${where}: ransom needs "y"`);
      if ((b.lines ?? []).length > 2) errors.push(`${where}: a ransom title has two rows at most`);
    }
    if (b.type === "face") {
      if (typeof b.x !== "number" || typeof b.y !== "number") errors.push(`${where}: face needs "x" and "y" (the middle of the head)`);
      for (const m of [b.mood, ...(b.moods ?? []).map((x) => x.mood)]) if (m !== undefined && !MOODS.includes(m)) errors.push(`${where}: mood "${m}" is not one of ${MOODS.join(", ")}`);
      (b.moods ?? []).forEach((m, i) => (m.t = T(m.t, `${where}.moods[${i}]`)));
    }
    if (["shape", "prop", "person", "badge"].includes(b.type) && !style.tokens?.rig) errors.push(`${where}: the ${style.name} style cannot use "${b.type}"`);
    if (b.type === "shape" && !b.d && !(["circle", "ellipse", "rect"].includes(b.shape) && typeof b.x === "number" && typeof b.y === "number")) errors.push(`${where}: shape needs "d", or "shape" (circle, ellipse, rect) with "x" and "y"`);
    if (b.type === "prop" && b.draw !== undefined) {
      // engine 1.9: draw anything. The drawing lives once in the storyboard's "drawings"; the engine reads it from the block.
      const def = sb.drawings?.[b.draw], colors = COLOR_NAMES(style);
      if (!def) errors.push(`${where}: prop "draw" must name a drawing in the storyboard's "drawings" (${Object.keys(sb.drawings ?? {}).join(", ") || "none yet"})`);
      else {
        b.parts = def.parts;
        if (!Array.isArray(def.parts) || !def.parts.length) errors.push(`drawings.${b.draw}: needs "parts"`);
        for (const [i, pt] of (def.parts ?? []).entries()) {
          const w = `drawings.${b.draw}.parts[${i}]`;
          if (pt.text !== undefined) { checkText(pt.text, `${w}.text`); continue; }
          if (!(typeof pt.d === "string" && /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/.test(pt.d) && /^\s*[Mm]/.test(pt.d))) errors.push(`${w}: "d" must be an SVG path starting with M`);
          if (!pt.line && pt.fill === undefined) errors.push(`${w}: needs "fill" (a colour name) or "line": true`);
          if (pt.fill !== undefined && !colors.includes(pt.fill)) errors.push(`${w}: fill "${pt.fill}" is not in the ${style.name} style. Use one of ${colors.join(", ")}`);
        }
      }
      if (b.kind === undefined) b.kind = "drawing";
    }
    if (b.type === "prop") {
      if (b.draw === undefined && !PROP_KINDS.includes(b.kind)) errors.push(`${where}: prop needs "kind", one of ${PROP_KINDS.join(", ")}, or "draw" with a drawing from the storyboard's "drawings"`);
      if (typeof b.x !== "number" || typeof b.y !== "number") errors.push(`${where}: prop needs "x" and "y"`);
      if (b.litAt !== undefined) b.litAt = T(b.litAt, `${where}.litAt`);
      if (b.marksAt !== undefined) b.marksAt = T(b.marksAt, `${where}.marksAt`);
      checkText(b.sub, `${where}.sub`);
      checkText(b.text, `${where}.text`);
    }
    if (b.type === "person") {
      if (typeof b.x !== "number" || typeof b.y !== "number") errors.push(`${where}: person needs "x" and "y" (where the feet stand)`);
      if (b.who && !sb.cast?.[b.who]) errors.push(`${where}: "${b.who}" is not in the storyboard's cast`);
      for (const st of [b, ...(b.keys ?? [])]) {
        for (const e of expandChibi(st)) errors.push(`${where}: ${e}`);
        if (st.eyes !== undefined && !EYES.includes(st.eyes)) errors.push(`${where}: eyes "${st.eyes}" is not one of ${EYES.join(", ")}`);
        if (st.mouth !== undefined && !MOUTHS.includes(st.mouth)) errors.push(`${where}: mouth "${st.mouth}" is not one of ${MOUTHS.join(", ")}`);
        if (st.brows !== undefined && !BROWS.includes(st.brows)) errors.push(`${where}: brows "${st.brows}" is not one of ${BROWS.join(", ")}`);
      }
      if (b.keys) b.keys.sort((x, y) => x.t - y.t);
    }
    if (b.type === "caption") {
      if (b.to === undefined) errors.push(`${where}: caption needs "to" (the last word it shows, like "@head")`);
      else {
        b.to = T(b.to, `${where}.to`);
        b.words = words.filter((w) => w[0] >= b.at - 0.01 && w[0] <= b.to + 0.01).map((w) => [w[0], w[1], w[2].replace(/[\u2010-\u2015-]/g, " ")]);
        if (!b.words.length) errors.push(`${where}: no spoken words between its "at" and "to"`);
        else if (b.out === undefined) b.out = +(b.words[b.words.length - 1][1] + 0.5).toFixed(2);
      }
      if (typeof b.y !== "number") errors.push(`${where}: caption needs "y"`);
      else if (b.y > LOW_TEXT) errors.push(`${where}: caption y ${b.y} is too low (keep above ${LOW_TEXT})`);
    }
    if (b.type.startsWith("poster")) {
      // engine 1.6 poster blocks: words, a hero object, a counting ring, cards, a banner. Times inside lists are resolved here.
      const colors = COLOR_NAMES(style);
      if (b.type === "posterWord") {
        if (!b.text) errors.push(`${where}: posterWord needs "text"`);
        if (b.mode !== undefined && !["ink", "register", "stamp", "kicker", "pill"].includes(b.mode)) errors.push(`${where}: mode must be ink, register, stamp, kicker or pill`);
        if (b.y > 1560) errors.push(`${where}: y ${b.y} falls in the Instagram caption area (keep above 1560)`);
      }
      if (b.type === "posterHero") {
        if (b.kind !== undefined && !["cube", "orb", "pyramid"].includes(b.kind)) errors.push(`${where}: hero kind must be cube, orb or pyramid`);
        if (b.tone !== undefined && !["orange", "teal", "mustard", "navy"].includes(b.tone)) errors.push(`${where}: hero tone must be orange, teal, mustard or navy`);
      }
      if (b.type === "posterRing" && !(typeof b.value === "number" && Number.isFinite(b.value))) errors.push(`${where}: posterRing needs a number "value"`);
      for (const f of ["color", "shadow", "fill"]) if (b[f] !== undefined && !colors.includes(b[f])) errors.push(`${where}: ${f} "${b[f]}" is not in the ${style.name} style. Use one of ${colors.join(", ")}`);
      // every time field in a poster block (at, out, anything ending in At, also inside lists like items, texts, readouts, cards, top, bottom)
      const resolveAts = (o, w) => {
        if (Array.isArray(o)) return o.forEach((x, i) => resolveAts(x, `${w}[${i}]`));
        if (!o || typeof o !== "object") return;
        for (const [key, v] of Object.entries(o)) {
          if (key === "keys") continue;
          if ((key === "at" || key === "out" || key === "until" || /At$/.test(key)) && (typeof v === "string" || typeof v === "number")) o[key] = T(v, `${w}.${key}`);
          else if (v && typeof v === "object") resolveAts(v, `${w}.${key}`);
        }
      };
      for (const f of ["items", "texts", "readouts", "cards", "top", "bottom"]) if (b[f] !== undefined) resolveAts(b[f], `${where}.${f}`);
      for (const [key, v] of Object.entries(b)) if (key !== "at" && key !== "out" && (key === "until" || /At$/.test(key)) && (typeof v === "string" || typeof v === "number")) b[key] = T(v, `${where}.${key}`);
      const listed = { posterCards: "items", posterBanner: "texts", posterSteps: "items", posterRecap: "cards" }[b.type];
      if (listed) {
        if (!Array.isArray(b[listed]) || !b[listed].length) errors.push(`${where}: ${b.type} needs "${listed}"`);
        for (const [i, it] of (b[listed] ?? []).entries()) {
          if (b.type !== "posterRecap" && it.at === undefined) errors.push(`${where}.${listed}[${i}]: needs "at" (the word that brings it in)`);
          for (const f of ["text", "label", "big", "word"]) checkText(it[f], `${where}.${listed}[${i}].${f}`);
        }
        if (b.type === "posterCards" && b.items.length > 4) errors.push(`${where}: posterCards takes 2 to 4 items`);
        if (b.type === "posterSteps" && (b.items.length < 2 || b.items.length > 5)) errors.push(`${where}: posterSteps takes 2 to 5 items`);
        if (b.type === "posterRecap" && b.cards.length !== 2) errors.push(`${where}: posterRecap takes exactly 2 cards`);
      }
      if (b.type === "posterSplit") for (const side of ["top", "bottom"]) { if (!b[side]?.word) errors.push(`${where}: posterSplit needs ${side}.word`); for (const f of ["label", "word"]) checkText(b[side]?.[f], `${where}.${side}.${f}`); }
      if (b.type === "posterSplit" && b.badge !== undefined && !["neq", "vs", "plus", "arrow"].includes(b.badge)) errors.push(`${where}: badge must be neq, vs, plus or arrow`);
      if (b.type === "posterButton") { if (!b.text) errors.push(`${where}: posterButton needs "text"`); checkText(b.text, `${where}.text`); }
      if (b.type === "posterJourney") for (const [i, r] of (b.readouts ?? []).entries()) for (const f of ["label", "value", "unit"]) checkText(r[f], `${where}.readouts[${i}].${f}`);
      for (const f of ["kicker", "pill", "gravityLabel", "lowerLabel"]) checkText(b[f], `${where}.${f}`);
      if (b.type === "posterTile" && b.tone !== undefined && !["teal", "orange"].includes(b.tone)) errors.push(`${where}: posterTile tone must be teal or orange`);
      if (b.type === "posterHero" || b.type === "posterGauge" || b.type === "posterJourney" || b.type === "posterRecap" || b.type === "posterTile") {
        if (b.kind !== undefined && !["cube", "orb", "pyramid"].includes(b.kind)) errors.push(`${where}: hero kind must be cube, orb or pyramid`);
      }
    }
    if (b.type.startsWith("bean")) {
      if (!style.tokens?.bean) errors.push(`${where}: the ${style.name} style cannot use "${b.type}"`);
      const H = sb.height ?? 1920, low = H === 1920 ? 1560 : H - 60, lowText = H === 1920 ? 1500 : H - 80;
      const colors = COLOR_NAMES(style);
      // every time inside the block (at, out, until, anything ending in At), also inside lists like items, points, parts, spots, pains, left, right
      const resolveAts = (o, w) => {
        if (Array.isArray(o)) return o.forEach((x, i) => resolveAts(x, `${w}[${i}]`));
        if (!o || typeof o !== "object") return;
        for (const [key, v] of Object.entries(o)) {
          if ((key === "at" || key === "out" || /At$/.test(key)) && (typeof v === "string" || typeof v === "number")) o[key] = T(v, `${w}.${key}`);
          else if (v && typeof v === "object" && key !== "keys") resolveAts(v, `${w}.${key}`);
        }
      };
      for (const f of ["items", "points", "parts", "spots", "pains", "left", "right"]) if (b[f] !== undefined) resolveAts(b[f], `${where}.${f}`);
      for (const [key, v] of Object.entries(b)) if (key !== "at" && key !== "out" && /At$/.test(key) && (typeof v === "string" || typeof v === "number")) b[key] = T(v, `${where}.${key}`);
      const texts = (o, w) => { if (Array.isArray(o)) return o.forEach((x, i) => texts(x, `${w}[${i}]`)); if (!o || typeof o !== "object") return; for (const [key, v] of Object.entries(o)) { if (["text", "title", "label", "center", "by", "myth", "fact", "prefix", "suffix", "text2", "sub"].includes(key)) checkText(v, `${w}.${key}`); else if (v && typeof v === "object") texts(v, `${w}.${key}`); } };
      texts(b, where);
      if (b.type === "bean") {
        if (typeof b.x !== "number" || typeof b.y !== "number") errors.push(`${where}: bean needs "x" and "y" (where the feet stand)`);
        for (const st of [b, ...(b.keys ?? [])]) {
          if (st.mood !== undefined && !BEAN_MOODS.includes(st.mood)) errors.push(`${where}: mood "${st.mood}" is not one of ${BEAN_MOODS.join(", ")}`);
          if (st.pose !== undefined && !BEAN_POSES.includes(st.pose)) errors.push(`${where}: pose "${st.pose}" is not one of ${BEAN_POSES.join(", ")}`);
          if (st.view !== undefined && !["front", "side"].includes(st.view)) errors.push(`${where}: view must be front or side`);
        }
        if (b.build !== undefined && !BEAN_BUILDS.includes(b.build)) errors.push(`${where}: build "${b.build}" is not one of ${BEAN_BUILDS.join(", ")}`);
        if (b.hair !== undefined && !BEAN_HAIR.includes(b.hair)) errors.push(`${where}: hair "${b.hair}" is not one of ${BEAN_HAIR.join(", ")}`);
        if (b.hold !== undefined && !BEAN_ITEMS.includes(b.hold)) errors.push(`${where}: hold "${b.hold}" is not one of ${BEAN_ITEMS.join(", ")}`);
        for (const w of [].concat(b.wear ?? [])) if (!BEAN_WEAR.includes(w)) errors.push(`${where}: wear "${w}" is not one of ${BEAN_WEAR.join(", ")}`);
        for (const [i, sp] of (b.spots ?? []).entries()) { if (!BODY_PARTS.includes(sp.part)) errors.push(`${where}.spots[${i}]: part "${sp.part}" is not one of ${BODY_PARTS.join(", ")}`); if (sp.at === undefined) errors.push(`${where}.spots[${i}]: needs "at"`); }
        for (const [i, pn] of (b.pains ?? []).entries()) { for (const f of ["from", "to"]) if (!BODY_PARTS.includes(pn[f])) errors.push(`${where}.pains[${i}]: ${f} "${pn[f]}" is not one of ${BODY_PARTS.join(", ")}`); if (pn.at === undefined) errors.push(`${where}.pains[${i}]: needs "at"`); }
        if (b.y > low) errors.push(`${where}: bean feet at y ${b.y} are too low (keep at or above ${low})`);
        if (b.keys) b.keys.sort((x, y) => x.t - y.t);
      }
      if (b.type === "beanTitle") {
        if (!b.text && !b.lines?.length) errors.push(`${where}: beanTitle needs "text" or "lines"`);
        if (typeof b.y !== "number") errors.push(`${where}: beanTitle needs "y"`);
        else if (b.y > lowText) errors.push(`${where}: beanTitle y ${b.y} is too low (keep above ${lowText})`);
      }
      if (b.type === "beanBadge") {
        if (b.kind !== undefined && !["tag", "pill", "number"].includes(b.kind)) errors.push(`${where}: beanBadge kind must be tag, pill or number`);
        if (b.text === undefined) errors.push(`${where}: beanBadge needs "text"`);
      }
      if (b.type === "beanProp" && !BEAN_PROPS.includes(b.kind)) errors.push(`${where}: beanProp needs "kind", one of ${BEAN_PROPS.join(", ")}. For anything else, draw it with beanDraw`);
      if (b.type === "beanDraw") {
        const def = sb.drawings?.[b.draw];
        if (!def) errors.push(`${where}: beanDraw needs "draw", the name of a drawing in the storyboard's "drawings" (${Object.keys(sb.drawings ?? {}).join(", ") || "none yet"})`);
        else {
          b.drawing = def; // the engine reads the drawing from the block
          if (!Array.isArray(def.parts) || !def.parts.length) errors.push(`drawings.${b.draw}: needs "parts"`);
          for (const [i, pt] of (def.parts ?? []).entries()) {
            if (pt.text === undefined && !(typeof pt.d === "string" && /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/.test(pt.d) && /^\s*[Mm]/.test(pt.d))) errors.push(`drawings.${b.draw}.parts[${i}]: "d" must be an SVG path starting with M`);
            for (const f of ["fill", "stroke"]) if (pt[f] !== undefined && pt[f] !== "none" && !colors.includes(pt[f])) errors.push(`drawings.${b.draw}.parts[${i}]: ${f} "${pt[f]}" is not in the ${style.name} style. Use one of ${colors.join(", ")}`);
            checkText(pt.text, `drawings.${b.draw}.parts[${i}].text`);
          }
        }
        if (b.anim !== undefined && !DRAW_ANIMS.includes(b.anim)) errors.push(`${where}: anim must be one of ${DRAW_ANIMS.join(", ")}`);
        if (b.enter !== undefined && !["pop", "draw", "none"].includes(b.enter)) errors.push(`${where}: enter must be pop, draw or none`);
        if (typeof b.x !== "number" || typeof b.y !== "number") errors.push(`${where}: beanDraw needs "x" and "y"`);
      }
      if (b.type === "beanInfo") {
        if (!INFO_KINDS.includes(b.kind)) errors.push(`${where}: beanInfo needs "kind", one of ${INFO_KINDS.join(", ")}`);
        const need = { list: "items", timeline: "points", pie: "parts" }[b.kind];
        if (need && (!Array.isArray(b[need]) || !b[need].length)) errors.push(`${where}: beanInfo ${b.kind} needs "${need}"`);
        if (b.kind === "list" && b.items?.length > 6) errors.push(`${where}: a list takes 6 items at most`);
        if (b.kind === "myth" && (!b.myth || !b.fact)) errors.push(`${where}: beanInfo myth needs "myth" and "fact"`);
        if (b.kind === "compare" && (!b.left || !b.right)) errors.push(`${where}: beanInfo compare needs "left" and "right"`);
        if (b.kind === "counter" && typeof b.to !== "number") errors.push(`${where}: beanInfo counter needs a number "to"`);
        if (b.kind === "percent" && typeof b.value !== "number") errors.push(`${where}: beanInfo percent needs a number "value"`);
        if (b.kind === "quote" && !b.text) errors.push(`${where}: beanInfo quote needs "text"`);
        if (typeof b.y === "number" && b.y > lowText) errors.push(`${where}: beanInfo y ${b.y} is too low (keep above ${lowText})`);
        for (const list of [b.items, b.points, b.parts, [b.left, b.right]]) for (const it of list ?? []) if (it?.color !== undefined && !colors.includes(it.color)) errors.push(`${where}: color "${it.color}" is not in the ${style.name} style`);
      }
    }
    if (b.type.startsWith("vox")) {
      if (!style.tokens?.vox) errors.push(`${where}: the ${style.name} style cannot use "${b.type}"`);
      const colors = COLOR_NAMES(style);
      // every time inside the block: at, out, until, anything ending in At, the time lists flips and hits, and times inside mark, underline, strike, circle, items, bends
      for (const f of ["flips", "hits"]) if (Array.isArray(b[f])) b[f] = b[f].map((v, i) => T(v, `${where}.${f}[${i}]`));
      const resolveAts = (o, w) => {
        if (Array.isArray(o)) return o.forEach((x, i) => resolveAts(x, `${w}[${i}]`));
        if (!o || typeof o !== "object") return;
        for (const [key, v] of Object.entries(o)) {
          if ((key === "at" || key === "out" || key === "until" || /At$/.test(key)) && (typeof v === "string" || typeof v === "number")) o[key] = T(v, `${w}.${key}`);
          else if (v && typeof v === "object" && !["keys", "blocks", "nodes", "links", "values", "flips", "hits", "drawing"].includes(key)) resolveAts(v, `${w}.${key}`);
        }
      };
      resolveAts(b, where);
      const texts = (o, w) => { if (Array.isArray(o)) return o.forEach((x, i) => texts(x, `${w}[${i}]`)); if (!o || typeof o !== "object") return; for (const [key, v] of Object.entries(o)) { if (["text", "sub", "done", "title"].includes(key)) checkText(v, `${w}.${key}`); else if (key === "labels" && Array.isArray(v)) v.forEach((x, i) => checkText(x, `${w}.labels[${i}]`)); else if (v && typeof v === "object" && key !== "blocks" && key !== "drawing") texts(v, `${w}.${key}`); } };
      texts(b, where);
      const num = (v) => typeof v === "number" && Number.isFinite(v);
      if (["voxTag", "voxText", "voxStamp", "voxChip", "voxSubscribe"].includes(b.type) && (b.text === undefined || b.text === "")) errors.push(`${where}: ${b.type} needs "text" (words the voice says, in the voiceover's language)`);
      if (["voxTag", "voxText", "voxStamp", "voxChip", "voxSubscribe", "voxMark", "voxNumbers", "voxList", "voxSparks", "voxHighlight"].includes(b.type) && !(num(b.x) && num(b.y))) errors.push(`${where}: ${b.type} needs "x" and "y"`);
      if (b.type === "voxText" && b.font !== undefined && !VOX_FONTS.includes(b.font)) errors.push(`${where}: font must be one of ${VOX_FONTS.join(", ")}`);
      if (b.type === "voxMark" && b.kind !== undefined && !VOX_MARKS.includes(b.kind)) errors.push(`${where}: voxMark kind must be one of ${VOX_MARKS.join(", ")}`);
      if (b.type === "voxHighlight" && !(num(b.w) && num(b.h))) errors.push(`${where}: voxHighlight needs "w" and "h"`);
      if (b.type === "voxLine" && typeof b.d !== "string") errors.push(`${where}: voxLine needs "d" (an SVG path)`);
      if (b.type === "voxCard" && !(num(b.x) && num(b.y) && num(b.w) && num(b.h))) errors.push(`${where}: voxCard needs "x", "y", "w" and "h"`);
      if (b.type === "voxCard" && b.from !== undefined && !["below", "above", "left", "right", "pop", "none"].includes(b.from)) errors.push(`${where}: from must be below, above, left, right, pop or none`);
      if (b.type === "voxCard" && b.outTo !== undefined && !["left", "right", "up", "down"].includes(b.outTo)) errors.push(`${where}: outTo must be left, right, up or down`);
      if (b.type === "voxList") {
        if (!Array.isArray(b.items) || !b.items.length) errors.push(`${where}: voxList needs "items" [{"at": "@word", "text": "..."}]`);
        for (const [i, it] of (b.items ?? []).entries()) if (it.at === undefined || !it.text) errors.push(`${where}.items[${i}]: needs "at" and "text"`);
        if (b.style !== undefined && !["numbers", "checks"].includes(b.style)) errors.push(`${where}: style must be numbers or checks`);
      }
      if (b.type === "voxNetwork" && !(Array.isArray(b.nodes) && b.nodes.every((p) => Array.isArray(p) && p.length === 2 && p.every(num)))) errors.push(`${where}: voxNetwork needs "nodes" [[x, y], ...] and "links" [[from, to], ...]`);
      if (b.type === "voxArt") {
        if (!VOX_ART.includes(b.kind)) errors.push(`${where}: voxArt needs "kind", one of ${VOX_ART.join(", ")}. For anything else, draw it with voxDraw`);
        if (!(num(b.x) && num(b.y))) errors.push(`${where}: voxArt needs "x" and "y" (the middle of the picture)`);
      }
      if ((b.type === "voxArt" || b.type === "voxDraw" || b.type === "voxGroup") && b.enter !== undefined && !VOX_ENTER.includes(b.enter) && !(b.type === "voxDraw" && b.enter === "draw")) errors.push(`${where}: enter must be one of ${VOX_ENTER.join(", ")}${b.type === "voxDraw" ? " or draw" : ""}`);
      if (b.type === "voxDraw") {
        const def = sb.drawings?.[b.draw];
        if (!def) errors.push(`${where}: voxDraw needs "draw", the name of a drawing in the storyboard's "drawings" (${Object.keys(sb.drawings ?? {}).join(", ") || "none yet"})`);
        else {
          b.drawing = def; // the engine reads the drawing from the block
          if (!Array.isArray(def.parts) || !def.parts.length) errors.push(`drawings.${b.draw}: needs "parts"`);
          for (const [i, pt] of (def.parts ?? []).entries()) {
            if (pt.text === undefined && !(typeof pt.d === "string" && /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/.test(pt.d) && /^\s*[Mm]/.test(pt.d))) errors.push(`drawings.${b.draw}.parts[${i}]: "d" must be an SVG path starting with M`);
            for (const f of ["fill", "stroke"]) if (pt[f] !== undefined && pt[f] !== "none" && !colors.includes(pt[f])) errors.push(`drawings.${b.draw}.parts[${i}]: ${f} "${pt[f]}" is not in the ${style.name} style. Use one of ${colors.join(", ")}`);
            if (pt.tone !== undefined && !VOX_TONES.includes(pt.tone)) errors.push(`drawings.${b.draw}.parts[${i}]: tone must be one of ${VOX_TONES.join(", ")}`);
            if (pt.font !== undefined && !VOX_FONTS.includes(pt.font)) errors.push(`drawings.${b.draw}.parts[${i}]: font must be one of ${VOX_FONTS.join(", ")}`);
            checkText(pt.text, `drawings.${b.draw}.parts[${i}].text`);
          }
        }
        if (b.anim !== undefined && !DRAW_ANIMS.includes(b.anim)) errors.push(`${where}: anim must be one of ${DRAW_ANIMS.join(", ")}`);
        if (!(num(b.x) && num(b.y))) errors.push(`${where}: voxDraw needs "x" and "y"`);
      }
      for (const f of ["subColor", "textColor"]) if (b[f] !== undefined && !colors.includes(b[f])) errors.push(`${where}: ${f} "${b[f]}" is not in the ${style.name} style`);
      for (const f of ["mark", "underline", "strike", "circle"]) if (b[f]?.color !== undefined && !colors.includes(b[f].color)) errors.push(`${where}.${f}: color "${b[f].color}" is not in the ${style.name} style`);
      if (b.type === "voxCard" || b.type === "voxGroup") (b.blocks ?? []).forEach((c, i) => { if (c.at === undefined) c.at = b.at; walk(c, `${where}.blocks[${i}]`, scene); });
    }
    if (b.type === "hero") {
      const known = [...HERO_SHAPES, ...Object.keys(sb.shapes ?? {})];
      if (b.shape !== undefined && !known.includes(b.shape)) errors.push(`${where}: hero shape "${b.shape}" is not one of ${known.join(", ")}. Draw a new one in the storyboard's "shapes"`);
      if (sb.shapes) b.shapes = sb.shapes; // the engine reads drawn shapes from the block
      for (const [i, kf] of (b.keys ?? []).entries()) {
        if (kf.shape !== undefined && !known.includes(kf.shape)) errors.push(`${where}.keys[${i}]: shape "${kf.shape}" is not one of ${known.join(", ")}. Draw a new one in the storyboard's "shapes"`);
        if (kf.color !== undefined && !COLOR_NAMES(style).includes(kf.color)) errors.push(`${where}.keys[${i}]: color "${kf.color}" is not in the ${style.name} style`);
      }
      if (b.keys) b.keys.sort((x, y) => x.t - y.t);
    }
    if (b.type === "splat" && (typeof b.x !== "number" || typeof b.y !== "number")) errors.push(`${where}: splat needs "x" and "y"`);
    if (b.type === "stamp" && (typeof b.x !== "number" || typeof b.y !== "number")) errors.push(`${where}: stamp needs "x" and "y"`);
    if (b.type === "frame" && b.family !== undefined && !FRAME_FAMILIES.includes(b.family)) errors.push(`${where}: frame family must be one of ${FRAME_FAMILIES.join(", ")}`);
    if (b.type === "badge" && b.text === undefined) errors.push(`${where}: badge needs "text" (the chapter number)`);
    if (b.type === "mark") {
      if (!MARK_KINDS.includes(b.kind)) errors.push(`${where}: mark needs "kind", one of ${MARK_KINDS.join(", ")}`);
      if (typeof b.x !== "number" || typeof b.y !== "number") errors.push(`${where}: mark needs "x" and "y" (the centre of the thing it marks)`);
    }
    for (const f of ["color", "fill", "color2"]) {
      if (b[f] !== undefined && !(b.type === "shape" && b[f] === "none") && !COLOR_NAMES(style).includes(b[f])) errors.push(`${where}: ${f} "${b[f]}" is not in the ${style.name} style. Use one of ${COLOR_NAMES(style).join(", ")}`);
    }
    if ((b.type === "note" || b.type === "mark") && b.y > LOW) errors.push(`${where}: ${b.type} at y ${b.y} falls in the caption area (keep above ${LOW})`);
    if (b.type === "label") {
      const y = b.labelY ?? b.target?.[1];
      if (y > LOW) errors.push(`${where}: label at y ${y} falls in the caption area (keep above ${LOW})`);
    }
    if (b.type === "text" && b.y > LOW_TEXT) errors.push(`${where}: headline y ${b.y} is too low (keep above ${LOW_TEXT})`);
    if (scene && b.at !== undefined && (b.at < scene.start - 0.01 || b.at > scene.end))
      warnings.push(`${where}: starts at ${b.at}s, outside its scene (${scene.start} to ${scene.end})`);
    if (b.type === "group") (b.blocks ?? []).forEach((c, i) => walk(c, `${where}.blocks[${i}]`, scene));
  };
  checkText(sb.header?.left, "header.left");
  checkText(sb.header?.right, "header.right");
  if (sb.header?.out !== undefined) sb.header.out = T(sb.header.out, "header.out");
  if (!sb.scenes?.length) errors.push("storyboard has no scenes");
  (sb.scenes ?? []).forEach((s, i) => {
    s.start = T(s.start, `scenes[${i}].start`);
    s.end = s.end === "end" ? sb.duration : T(s.end, `scenes[${i}].end`);
    if (i > 0 && Math.abs(s.start - sb.scenes[i - 1].end) > 0.05) warnings.push(`scene ${s.id} starts at ${s.start}s but the previous ended at ${sb.scenes[i - 1].end}s`);
    (s.cam ?? []).forEach((c, j) => {
      c.t = T(c.t, `scenes[${i}].cam[${j}]`);
      if (c.zoom !== undefined && c.zoom < 1) errors.push(`scenes[${i}].cam[${j}]: zoom must be 1 or more`);
    });
    if (s.transition !== undefined && !TRANSITIONS.includes(s.transition)) errors.push(`scenes[${i}](${s.id}): transition must be one of ${TRANSITIONS.join(", ")}`);
    if (s.tint !== undefined && !style.tokens?.tints?.[s.tint]) errors.push(`scenes[${i}](${s.id}): tint "${s.tint}" is not in the ${style.name} style. Use one of ${Object.keys(style.tokens?.tints ?? {}).join(", ") || "none"}`);
    s.blocks.forEach((b, j) => walk(b, `scenes[${i}](${s.id}).blocks[${j}]`, s));
  });
  (sb.overlay ?? []).forEach((b, i) => walk(b, `overlay[${i}]`));
  const last = sb.scenes?.[sb.scenes.length - 1];
  if (last && last.end < sb.duration - 0.05) warnings.push(`last scene ends at ${last.end}s but the video runs to ${sb.duration}s`);
  for (const [name, c] of Object.entries(sb.palette ?? {})) {
    if (style.tokens?.palette?.[name] === undefined) errors.push(`palette: "${name}" is not a colour name in the ${style.name} style`);
    else if (!/^#[0-9a-fA-F]{6}$/.test(String(c))) errors.push(`palette: "${name}" must be a hex colour like #ff4fa3`);
  }
  if (sb.variant && !style.variants?.[sb.variant]) errors.push(`style ${style.id} has no variant "${sb.variant}"`);

  warnings.forEach((w) => console.log(`warning: ${w}`));
  if (errors.length) {
    console.log(errors.map((e) => `problem: ${e}`).join("\n"));
    fail(`the storyboard has ${errors.length} problem(s), listed above`);
  }
  if (style.tokens?.rig || style.tokens?.bean) sb.speech = words.map((w) => [w[0], w[1]]); // lets characters lip sync
  const resolved = sbPath.replace(/\.json$/, ".resolved.json");
  fs.writeFileSync(resolved, JSON.stringify(sb, null, 2));
  return sb;
}

// ---------- rendering ----------
async function prepare(sb, style) {
  const { bundle } = await importRuntime("@remotion/bundler");
  const { selectComposition, renderStill, renderMedia } = await importRuntime("@remotion/renderer");
  const serveUrl = await bundle({ entryPoint: path.join(RUNTIME, "src", "index.ts"), publicDir: path.join(RUNTIME, "public"), onProgress: () => {} });
  const inputProps = { style, storyboard: sb, silent: true };
  const browserExecutable = browser();
  const composition = await selectComposition({ serveUrl, id: "Animate", inputProps, browserExecutable, logLevel: "error" });
  return { serveUrl, inputProps, browserExecutable, composition, renderStill, renderMedia };
}

async function stills(sb, style, times, outFile, scale = 0.5) {
  const r = await prepare(sb, style);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-st-"));
  for (const [i, t] of times.entries()) {
    const frame = Math.min(r.composition.durationInFrames - 1, Math.round(t * r.composition.fps));
    await r.renderStill({ composition: r.composition, serveUrl: r.serveUrl, output: path.join(tmp, `s${String(i).padStart(2, "0")}.png`), frame, inputProps: r.inputProps, browserExecutable: r.browserExecutable, scale, logLevel: "error" });
  }
  const cols = Math.min(5, times.length), rows = Math.ceil(times.length / cols);
  ff(["-v", "error", "-y", "-i", path.join(tmp, "s%02d.png"), "-vf", `tile=${cols}x${rows}:padding=12:color=white`, "-frames:v", "1", outFile]);
  out("RESULT", "stills");
  out("TIMES", times.join(","));
  out("FILE", path.resolve(outFile));
}

// A contact sheet of evenly spaced frames from the finished video, for the first version review.
function review(video, count, outFile) {
  if (!video || !fs.existsSync(video)) fail("video file not found");
  const info = String(ff(["-hide_banner", "-i", video], { encoding: "utf8", allowFail: true }).stderr);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  if (!m) fail("could not read the length of the video");
  const dur = +m[1] * 3600 + +m[2] * 60 + +m[3];
  const n = Math.max(4, Math.min(16, count));
  const times = Array.from({ length: n }, (_, i) => +(((i + 0.5) / n) * dur).toFixed(2));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-rv-"));
  times.forEach((t, i) => ff(["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=-2:640", path.join(tmp, `r${String(i).padStart(2, "0")}.png`)]));
  const cols = Math.min(5, n), rows = Math.ceil(n / cols);
  ff(["-v", "error", "-y", "-i", path.join(tmp, "r%02d.png"), "-vf", `tile=${cols}x${rows}:padding=10:color=white`, "-frames:v", "1", outFile]);
  out("RESULT", "review");
  out("DURATION", dur.toFixed(1));
  out("TIMES", times.join(","));
  out("FILE", outFile);
}

function decodeMono(file) {
  const buf = ff(["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"]).stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
function loudness(file, af = "anull") {
  const r = ff(["-hide_banner", "-i", file, "-af", `${af},ebur128`, "-f", "null", "-"], { encoding: "utf8", allowFail: true });
  const all = String(r.stderr).match(/I:\s+(-?[\d.]+) LUFS/g) || ["I: -23 LUFS"];
  return Number(all.pop().match(/-?[\d.]+/)[0]);
}

async function render(sb, style, vo, outFile) {
  const r = await prepare(sb, style);
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); // a new project's finished folder may not exist yet
  // Never write over a video that is already there (the member's own, or an earlier version): take the next free name.
  if (fs.existsSync(outFile)) {
    const stem = outFile.replace(/\.mp4$/i, "");
    let n = 2;
    while (fs.existsSync(`${stem} ${n}.mp4`)) n++;
    outFile = `${stem} ${n}.mp4`;
    out("NOTE", `a file with that name already existed, so this video was saved as ${path.basename(outFile)}`);
  }
  const base = outFile.replace(/\.mp4$/i, "");
  // Working files go to a scratch folder, so the finished videos folder only ever receives finished files.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ar-render-"));
  const silent = path.join(scratch, "picture.mp4");
  const t0 = Date.now();
  let last = -1;
  await r.renderMedia({
    composition: r.composition, serveUrl: r.serveUrl, inputProps: r.inputProps, browserExecutable: r.browserExecutable,
    codec: "h264", crf: 15, x264Preset: "slow", pixelFormat: "yuv420p", outputLocation: silent, muted: true, logLevel: "error",
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) (last = p), console.error(`  rendering ${p * 10}%`);
    },
  });

  // Audio: score and SFX from the storyboard, music ducked under the voice, then loudness for social.
  const voBuf = decodeMono(vo);
  const n = Math.ceil(sb.duration * SR);
  const music = renderScore(sb, style.sound?.score);
  const fx = renderSfx(sb, style.sound?.sfx);
  const env = envelope(voBuf);
  const duck = style.sound?.duck ?? 0.45;
  const mg = (rms(voBuf) * Math.pow(10, (style.sound?.score?.level ?? -15) / 20)) / (rms(music) || 1);
  const fg = Math.min(3, (rms(voBuf) * Math.pow(10, -12 / 20)) / (rms(fx) || 1));
  const musicOut = new Float32Array(n), fxOut = new Float32Array(n), mix = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    musicOut[i] = (music[i] ?? 0) * mg * (1 - duck * (env[i] ?? 0));
    fxOut[i] = (fx[i] ?? 0) * fg;
    mix[i] = (voBuf[i] ?? 0) + musicOut[i] + fxOut[i];
  }
  const dir = path.dirname(outFile);
  // named after the video, so several versions in one project folder never overwrite each other
  const musicFile = path.join(dir, `${path.basename(base)} music only.wav`), fxFile = path.join(dir, `${path.basename(base)} effects only.wav`);
  fs.writeFileSync(musicFile, wav(musicOut));
  fs.writeFileSync(fxFile, wav(fxOut));
  const mixWav = path.join(scratch, "mix.wav");
  fs.writeFileSync(mixWav, wav(mix));
  const chain = (g) => `volume=${g.toFixed(2)}dB,alimiter=limit=0.78:attack=2:release=40:level=false`;
  let gain = -14 - loudness(mixWav);
  gain += -14 - loudness(mixWav, chain(gain)); // second pass corrects for the limiter
  ff(["-v", "error", "-y", "-i", silent, "-i", mixWav, "-af", chain(gain), "-ar", "48000", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", outFile]);
  fs.rmSync(scratch, { recursive: true, force: true });
  out("RESULT", "rendered");
  out("FILE", outFile);
  out("MUSIC_STEM", musicFile);
  out("SFX_STEM", fxFile);
  out("SECONDS", ((Date.now() - t0) / 1000).toFixed(1));
}

// ---------- main ----------
async function main() {
  const cmd = pos[0];
  if (cmd === "styles") {
    const c = await catalog();
    c.styles.filter((s) => (s.modes || ["animate"]).includes("animate")).forEach((s) => console.log(`${s.id}  ${s.name}  v${s.version}  (${(s.modes || ["animate"]).join(", ")}${s.personal ? ", personal" : ""})  ${s.summary}`));
    out("RESULT", "listed");
    out("COUNT", c.styles.filter((s) => (s.modes || ["animate"]).includes("animate")).length);
    return;
  }
  if (cmd === "style") {
    const { dir, entry } = await getStyle(pos[1]);
    out("RESULT", "ready");
    out("STYLE", `${entry.id} ${entry.version}`);
    if (entry.personal) out("PERSONAL", "yes");
    out("GUIDE", path.join(dir, "guide.md"));
    return;
  }
  if (["transcribe", "stills", "render", "review"].includes(cmd)) requireRuntime();
  if (cmd === "review") return review(pos[1], Number(opt.count) || 10, path.resolve(String(opt.out || String(pos[1]).replace(/\.[^.]+$/, ".review.png"))));
  if (cmd === "transcribe") return transcribe(pos[1], pos[2] || "words.json", opt.language ? String(opt.language) : undefined);
  if (!["validate", "stills", "render"].includes(cmd)) fail("unknown command. Use: styles, style, transcribe, validate, stills, review, render");
  const sbPath = pos[1];
  if (!sbPath || !fs.existsSync(sbPath)) fail("storyboard file not found");
  const { style } = await getStyle(readJson(sbPath).style || "blueprint");
  const sb = validate(sbPath, opt.words, style);
  if (cmd === "validate") {
    out("RESULT", "valid");
    out("SCENES", sb.scenes.length);
    out("DURATION", sb.duration);
    return;
  }
  if (cmd === "stills") {
    const times = opt.at
      ? String(opt.at).split(",").map(Number)
      : sb.scenes.flatMap((s) => [s.start + (s.end - s.start) * 0.55, s.end - 0.45]).map((t) => +t.toFixed(2));
    return stills(sb, style, times, path.resolve(String(opt.out || sbPath.replace(/\.json$/, ".sheet.png"))), opt.scale ? Number(opt.scale) : 0.5);
  }
  if (!opt.vo || !fs.existsSync(opt.vo)) fail("render needs --vo <voiceover file>");
  return render(sb, style, opt.vo, path.resolve(String(opt.out || "animation.mp4")));
}
main().catch((e) => (process.env.AR_DEBUG && console.error(e.stack || e), fail(String(e && e.message ? e.message : e).split("\n")[0])));
