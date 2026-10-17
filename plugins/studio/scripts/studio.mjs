#!/usr/bin/env node
// Animation Room Studio helper. Cross platform, no dependencies beyond Node itself.
//
//   node studio.mjs config get [key]
//   node studio.mjs config set key=value [key=value ...]
//   node studio.mjs activate --key KEY [--email EMAIL]
//   node studio.mjs runtime install [--engine edit]
//   node studio.mjs runtime test --out FILE [--name NAME]
//   node studio.mjs transcriber install [--compile]            the speech engine and the multilingual speech model (1.5 GB, one download for every language)
//                                                               on a Mac the engine is downloaded ready made; --compile builds it instead (needs Apple's developer tools)
//   node studio.mjs folders [setup] [--path FOLDER]
//   node studio.mjs project --name "Name"                       start a project (work folder now, finished folder on export)
//   node studio.mjs project --project "20261013 Name" --original FILE   move the original out of Drop videos here
//   node studio.mjs autoupdate                                  turn on automatic studio updates in the Claude app's settings
//   node studio.mjs open FILE
//
// Every command takes --data <folder> (or reads CLAUDE_PLUGIN_DATA) and prints KEY=value lines.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FOLDER_NAMES as PROJECT_FOLDERS, moveOriginal, nextVersion, openProject } from "./projects.mjs";
import { SPEECH_MODEL } from "./speech.mjs";
import { resolveData, rememberStudio, noteAdopted, nodeEnv } from "./home.mjs";
import { fetchPrebuilt, proveEngine, useProgram, markProven, readPrebuiltState, hasAppleTools } from "./prebuilt-whisper.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Set AR_LICENSE_API to an empty value to save a key without checking it (offline tests).
const LICENSE_API = process.env.AR_LICENSE_API ?? "https://animationroom.app/api/license";
const WHISPER_CPP_VERSION = "1.5.5"; // On a Mac a ready made copy is downloaded (prebuilt-whisper.mjs); the compile fallback needs Apple's Command Line Tools alone (no cmake).
// One multilingual speech model for every language (SPEECH_MODEL, "medium"): whisper.cpp 1.5.5 supports exact word
// timing (DTW) for it, it finds the language by itself, and members download 1.5 GB once instead of two models.
// large-v3-turbo is newer than 1.5.5, so its word timing mode fails there.

// ---------- small helpers ----------
const out = (k, v) => console.log(`${k}=${v}`);
const fail = (reason, code = 1) => { out("RESULT", "failed"); out("REASON", reason); process.exit(code); };

function parseArgs(argv) {
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
  return { pos, opt };
}

const { pos, opt } = parseArgs(process.argv.slice(2));
const HOME = resolveData(opt.data);
noteAdopted(HOME);
const DATA = HOME.data;
const CONFIG = path.join(DATA, "config.json");
// Two separate render engines: Animate ("runtime") and Edit ("runtime-edit", --engine edit). They share the
// data folder, license, speech engine and browser, but have their own code, packages and version.
const EDIT = opt.engine === "edit";
const RUNTIME = path.join(DATA, EDIT ? "runtime-edit" : "runtime");

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { return { version: 1 }; }
}
function writeConfig(cfg) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = CONFIG + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG);
  rememberStudio(DATA);
}
function setDeep(obj, key, value) {
  const parts = key.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
}
function getDeep(obj, key) { return key.split(".").reduce((o, p) => (o == null ? undefined : o[p]), obj); }
const mask = (k) => (k && k.length > 4 ? "•••• " + k.slice(-4) : "••••");

function run(cmd, args, { cwd, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"], shell: false, env: nodeEnv({ npm_config_update_notifier: "false" }) });
    let buf = "";
    if (quiet) { child.stdout.on("data", (d) => (buf += d)); child.stderr.on("data", (d) => (buf += d)); }
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`${path.basename(cmd)} exited with code ${code}${buf ? ": " + buf.slice(-800) : ""}`))));
  });
}

// npm that belongs to the Node running this script (works for the private copy too)
function npmCli() {
  const exe = fs.realpathSync(process.execPath);
  const candidates = process.platform === "win32"
    ? [path.join(path.dirname(exe), "node_modules", "npm", "bin", "npm-cli.js")]
    : [path.join(path.dirname(path.dirname(exe)), "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  return candidates.find((p) => fs.existsSync(p)) || null;
}
async function npm(args, cwd) {
  const cli = npmCli();
  if (cli) return run(process.execPath, [cli, ...args], { cwd });
  return run(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd });
}
const remotionCli = () => path.join(RUNTIME, "node_modules", "@remotion", "cli", "remotion-cli.js");

function copyDir(src, dst, skip = new Set(["node_modules", ".installed.json"])) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, skip); else fs.copyFileSync(s, d);
  }
}

// ---------- commands ----------
async function cmdConfig() {
  const sub = pos[1];
  const cfg = readConfig();
  if (sub === "get") {
    const key = pos[2];
    const val = key ? getDeep(cfg, key) : cfg;
    const safe = JSON.parse(JSON.stringify(val ?? null));
    if (safe && typeof safe === "object" && safe.license && safe.license.key) safe.license.key = mask(safe.license.key);
    if (key === "license.key") return out("license.key", mask(val));
    return console.log(JSON.stringify(safe, null, 2));
  }
  if (sub === "set") {
    for (const pair of pos.slice(2)) {
      const i = pair.indexOf("=");
      if (i < 1) fail(`expected key=value, got "${pair}"`);
      const k = pair.slice(0, i), raw = pair.slice(i + 1);
      let v; try { v = JSON.parse(raw); } catch { v = raw; }
      setDeep(cfg, k, v);
    }
    cfg.updatedAt = new Date().toISOString();
    writeConfig(cfg);
    return out("RESULT", "saved");
  }
  fail("use: config get [key] | config set key=value");
}

async function cmdActivate() {
  const key = String(opt.key || "").trim().toUpperCase().replace(/\s+/g, " ");
  const email = opt.email ? String(opt.email).trim() : "";
  if (key.replace(/[^A-Z0-9]/g, "").length < 8) fail("that does not look like a license key. It is in your purchase receipt email.");
  const cfg = readConfig();
  if (!LICENSE_API) {
    setDeep(cfg, "license", { key, email, verified: false, mode: "preview", savedAt: new Date().toISOString() });
    writeConfig(cfg);
    out("RESULT", "saved");
    out("LICENSE", mask(key));
    out("VERIFIED", "no (preview build, the license server is not connected yet)");
    return;
  }
  let res;
  try {
    res = await fetch(LICENSE_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, email }) });
  } catch (e) { fail("could not reach the license server. Check the internet connection and try again."); }
  let body = {};
  try { body = await res.json(); } catch {}
  if (!res.ok || !body.valid) fail(body.message || "that license key was not recognised. Copy it again from your receipt email.");
  setDeep(cfg, "license", { key, email, verified: true, name: body.name || "", token: body.token || "", savedAt: new Date().toISOString() });
  writeConfig(cfg);
  out("RESULT", "activated");
  out("LICENSE", mask(key));
  if (body.name) out("NAME", body.name);
}

async function cmdRuntime() {
  const sub = pos[1];
  if (sub === "install") {
    const src = path.join(PLUGIN_ROOT, EDIT ? "edit-runtime" : "runtime");
    if (!fs.existsSync(path.join(src, "package.json"))) fail(`runtime template missing at ${src}`);
    const want = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8")).version;
    copyDir(src, RUNTIME);
    // Use the shipped lockfile when there is one, so every member gets exactly the tested versions.
    const hasLock = fs.existsSync(path.join(src, "package-lock.json"));
    if (!hasLock) fs.rmSync(path.join(RUNTIME, "package-lock.json"), { force: true });
    console.error("Installing the render engine. This takes one to three minutes...");
    try {
      await npm([hasLock ? "ci" : "install", "--no-audit", "--no-fund", "--loglevel=error"], RUNTIME);
    } catch (e) { fail("the render engine could not be installed: " + e.message.split("\n")[0]); }
    // --browser PATH uses a Chrome that is already on the computer instead of downloading one.
    let browser = opt.browser ? path.resolve(String(opt.browser)) : "";
    // The Edit engine reuses the video browser the Animate engine already downloaded (one 100 MB download, not two).
    if (EDIT && !browser) {
      const root = path.join(DATA, "runtime", "node_modules", ".remotion", "chrome-headless-shell");
      const exe = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
      const find = (d) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { const r = find(f); if (r) return r; } else if (e.name === exe) return f; } } catch {} return ""; };
      browser = find(root);
    }
    if (browser) {
      if (!fs.existsSync(browser)) fail(`no browser found at ${browser}`);
      const cfg = readConfig(); cfg.browserExecutable = browser; writeConfig(cfg);
    } else {
      console.error("Getting the video browser (about 100 MB)...");
      try { await run(process.execPath, [remotionCli(), "browser", "ensure"], { cwd: RUNTIME }); }
      catch (e) { fail("the video browser could not be downloaded: " + e.message.split("\n")[0]); }
    }
    fs.writeFileSync(path.join(RUNTIME, ".installed.json"), JSON.stringify({ version: want, node: process.version, browser: browser || "remotion", at: new Date().toISOString() }, null, 2));
    out("RESULT", "installed");
    out("RUNTIME_VERSION", want);
    out("ENGINE", EDIT ? "edit" : "animate");
    return;
  }
  if (sub === "test") {
    if (!fs.existsSync(remotionCli())) fail("the render engine is not installed yet. Run: runtime install");
    const outFile = path.resolve(String(opt.out || path.join(os.homedir(), "animationroom-test.mp4")));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const props = path.join(RUNTIME, ".test-props.json");
    fs.writeFileSync(props, JSON.stringify(EDIT ? { plan: { duration: 2, video: { src: "", width: 720, height: 1280 }, face: { x: 0.5, y: 0.4 }, words: [], moments: [] } } : { name: opt.name ? String(opt.name) : "" }));
    const t0 = Date.now();
    const args = [remotionCli(), "render", "src/index.ts", EDIT ? "Edit" : "Hello", outFile, `--props=${props}`, "--log=error"];
    const browserExe = readConfig().browserExecutable;
    if (browserExe) args.push(`--browser-executable=${browserExe}`);
    try {
      await run(process.execPath, args, { cwd: RUNTIME });
    } catch (e) { fail("the test video did not render: " + e.message.split("\n")[0]); }
    out("RESULT", "rendered");
    out("FILE", outFile);
    out("SECONDS", ((Date.now() - t0) / 1000).toFixed(1));
    return;
  }
  fail("use: runtime install | runtime test --out FILE [--name NAME]");
}

async function cmdTranscriber() {
  if (pos[1] !== "install") fail("use: transcriber install [--model NAME] [--compile]");
  // The speech engine is shared; build it with whichever render engine is installed.
  const pkg = [RUNTIME, path.join(DATA, "runtime"), path.join(DATA, "runtime-edit")]
    .map((r) => path.join(r, "node_modules", "@remotion", "install-whisper-cpp", "dist", "index.js"))
    .find((f) => fs.existsSync(f));
  if (!pkg) fail("the render engine is not installed yet. Run: runtime install");
  const { installWhisperCpp, downloadWhisperModel } = await import(pathToFileURL(pkg).href);
  const dir = path.join(DATA, "whisper");
  const models = path.join(dir, "models");
  const to = path.join(dir, "whisper.cpp");
  const exe = path.join(to, process.platform === "win32" ? "main.exe" : "main"); // where Remotion looks for whisper.cpp 1.5.5
  const modelFile = (m) => path.join(models, `ggml-${m}.bin`);
  const progress = () => { let last = -1; return (d, total) => { const p = Math.floor((d / total) * 10); if (p !== last) { last = p; console.error(`  ${p * 10}%`); } }; };
  // One multilingual model for every language. --language is still accepted (older instructions pass it) and changes nothing.
  const model = String(opt.model || SPEECH_MODEL);
  const say = (m) => console.error(m);

  // How the engine gets here. A Mac downloads a ready made copy (no Apple developer tools, no waiting for a build) and
  // proves it works below. Compiling is the fallback: it needs Apple's Command Line Tools on a Mac, git and a compiler on Linux.
  // Windows downloads its own ready made copy through Remotion.
  let engine = fs.existsSync(exe) && !readPrebuiltState(to) ? "existing" : readPrebuiltState(to) && fs.existsSync(exe) ? "prebuilt" : null;
  if (!engine && process.platform === "darwin" && !opt.compile && process.env.AR_WHISPER_PREBUILT !== "0") {
    const r = await fetchPrebuilt({ to, log: say });
    if (r.ok) engine = "prebuilt";
    else say(`The ready made speech engine could not be used (${r.reason}). Building it on this Mac instead.`);
  }
  async function buildEngine() {
    if (process.platform === "darwin" && !hasAppleTools()) {
      out("NEEDS_APPLE_TOOLS", "yes");
      fail("the speech engine has to be built on this Mac, which needs Apple's developer tools (run: xcode-select --install, wait for it to finish, then run this again)");
    }
    // A half finished earlier try would be skipped as "already there" and leave no program behind.
    if (fs.existsSync(to) && !fs.existsSync(exe)) fs.rmSync(to, { recursive: true, force: true });
    say("Building the transcription engine...");
    await installWhisperCpp({ to, version: WHISPER_CPP_VERSION, printOutput: false });
    if (!fs.existsSync(exe)) throw new Error("the speech engine was not built");
    engine = "built";
  }
  try {
    if (!engine) await buildEngine();
    fs.mkdirSync(models, { recursive: true }); // the downloader does not create it
    if (!fs.existsSync(modelFile(model))) {
      say(`Downloading the ${model} speech model. This is the big one (about 1.5 GB)...`);
      await downloadWhisperModel({ model, folder: models, printOutput: false, onProgress: progress() });
    }
    // Prove the downloaded engine on a few seconds of speech with the real model. If it does not work on this Mac, try
    // its other program (Intel has a plain build besides the AVX2 one), then fall back to building it.
    const state = readPrebuiltState(to);
    if (engine === "prebuilt" && state && !state.proven) {
      let result = null;
      for (const program of state.programs.slice(Math.max(0, state.programs.indexOf(state.active)))) {
        if (!useProgram(to, program)) continue;
        result = proveEngine({ to, model: modelFile(model), log: say });
        if (result.ok) { markProven(to, result); out("ENGINE_PROGRAM", program); out("ENGINE_GPU", result.gpu ? "yes" : "no"); break; }
        say(`  The ${program} program did not pass the test (${result.reason}).`);
      }
      if (!result || !result.ok) {
        say("The ready made speech engine did not pass its test on this Mac. Building it instead.");
        fs.rmSync(to, { recursive: true, force: true });
        engine = null;
        await buildEngine();
      }
    }
  } catch (e) { fail("the transcription engine could not be installed: " + String(e.message || e).split("\n")[0]); }
  fs.writeFileSync(path.join(dir, ".ready"), JSON.stringify({ whisperCpp: WHISPER_CPP_VERSION, model, engine, at: new Date().toISOString() }, null, 2));
  // Older installs also hold the English only model and a small language check model. The multilingual model replaces
  // both, so they are removed (only inside the studio's own speech folder) to give the space back.
  let freed = 0;
  if (!model.endsWith(".en") && model !== "tiny") {
    for (const old of ["medium.en", "tiny", "tiny.en", "base.en", "small.en", "large-v3-turbo"]) {
      const f = modelFile(old);
      try { if (fs.existsSync(f)) { freed += fs.statSync(f).size; fs.rmSync(f); } } catch { /* leave it */ }
    }
  }
  out("RESULT", "installed");
  out("ENGINE", engine);
  out("MODEL", model);
  if (freed) out("FREED_GB", (freed / 1e9).toFixed(1));
}

async function cmdOpen() {
  const file = pos[1];
  if (!file || !fs.existsSync(file)) fail("file not found");
  const [cmd, args] = process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
  try { await run(cmd, args, { quiet: true }); out("RESULT", "opened"); } catch { out("RESULT", "not_opened"); }
}

// The member's videos folder: where recordings go in and finished videos come out. Everything stays on this computer.
const FOLDER_NAMES = PROJECT_FOLDERS;
function defaultVideosFolder() {
  const home = os.homedir();
  const base = process.platform === "darwin" ? "Movies" : "Videos";
  return path.join(home, base, "Animation Room");
}
// Folders that cloud services sync can empty big files and stall video work.
function syncedWhere(p) {
  const low = p.toLowerCase();
  const home = os.homedir().toLowerCase();
  if (/mobile documents|icloud|onedrive|dropbox|google drive|googledrive/.test(low)) return "a cloud synced folder";
  if (process.platform === "darwin" && (low.startsWith(path.join(home, "desktop")) || low.startsWith(path.join(home, "documents")))) return "Desktop or Documents, which iCloud may sync";
  return "";
}
async function cmdFolders() {
  const cfg = readConfig();
  const root = path.resolve(String(opt.path || cfg.videosFolder || defaultVideosFolder()));
  const where = syncedWhere(root);
  if (where && !opt.allowSynced) {
    out("RESULT", "needs_other_folder");
    out("REASON", `${root} is in ${where}. Big video files can get emptied or stall there. Use ${defaultVideosFolder()} instead.`);
    process.exit(1);
  }
  for (const n of Object.values(FOLDER_NAMES)) fs.mkdirSync(path.join(root, n), { recursive: true });
  cfg.videosFolder = root;
  cfg.studioDir = root; // Animate uses the same folder: its work goes in Work in progress, its videos in Finished videos
  writeConfig(cfg);
  out("RESULT", "ready");
  out("VIDEOS_FOLDER", root);
  out("DROP_FOLDER", path.join(root, FOLDER_NAMES.inbox));
  out("FINISHED_FOLDER", path.join(root, FOLDER_NAMES.finished));
  out("WORK_FOLDER", path.join(root, FOLDER_NAMES.work));
}

// A project is one folder name ("20261013 Mass and force") in Work in progress and in Finished videos.
async function cmdProject() {
  const root = readConfig().videosFolder;
  if (!root || !fs.existsSync(root)) fail("the videos folder is not set up yet. Run: studio.mjs folders");
  if (opt.original) {
    if (!opt.project) fail("say which project: --project \"20261013 Name\"");
    const r = moveOriginal(root, String(opt.project), String(opt.original));
    out("RESULT", r.moved ? "moved" : "left");
    if (r.moved) out("MOVED_TO", r.to);
    else out("REASON", r.reason);
    return;
  }
  if (!opt.name || opt.name === true) fail("give the project a short name: --name \"Mass and force\"");
  const p = openProject(root, String(opt.name));
  const v = nextVersion(p.finished, p.name);
  out("RESULT", "ready");
  out("PROJECT", p.folder);
  out("WORK_FOLDER", p.work);
  out("FINISHED_FOLDER", p.finished);
  out("NEXT_VERSION", v);
  out("OUT_FILE", path.join(p.finished, `${p.name} ${v}.mp4`));
}

// The studio comes from the animationroom.app plugin marketplace. The Claude app only updates a marketplace by itself when
// "autoUpdate" is true on its entry in the user settings file, and that is off by default, so setup switches it on.
// Edits one entry, keeps everything else in the file, and keeps a copy of the file first.
const MARKETPLACE_NAME = "animationroom";
// The Claude app's Add marketplace window only takes GitHub, GitLab or Bitbucket addresses, so the store lives in a public GitHub repository.
const MARKETPLACE_REPO = "abnercross/animationroom-studio";
async function cmdAutoupdate() {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const file = path.join(dir, "settings.json");
  let settings = {};
  if (fs.existsSync(file)) {
    try { settings = JSON.parse(fs.readFileSync(file, "utf8") || "{}"); }
    catch { out("RESULT", "skipped"); out("REASON", "the Claude settings file could not be read, so it was left alone"); return; }
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) { out("RESULT", "skipped"); out("REASON", "the Claude settings file has an unexpected shape, so it was left alone"); return; }
  }
  const known = (settings.extraKnownMarketplaces && typeof settings.extraKnownMarketplaces === "object") ? settings.extraKnownMarketplaces : {};
  const entry = known[MARKETPLACE_NAME] && typeof known[MARKETPLACE_NAME] === "object" ? known[MARKETPLACE_NAME] : { source: { source: "github", repo: MARKETPLACE_REPO } };
  if (entry.autoUpdate === true) { out("RESULT", "already_on"); return; }
  const next = { ...settings, extraKnownMarketplaces: { ...known, [MARKETPLACE_NAME]: { ...entry, autoUpdate: true } } };
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, `settings.backup-${new Date().toISOString().slice(0, 10)}.json`));
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  out("RESULT", "enabled");
}

const commands = { autoupdate: cmdAutoupdate, project: cmdProject, folders: cmdFolders, config: cmdConfig, activate: cmdActivate, runtime: cmdRuntime, transcriber: cmdTranscriber, open: cmdOpen };
const fn = commands[pos[0]];
if (!fn) fail("unknown command. Use: config, activate, runtime, transcriber, folders, project, autoupdate, open");
fn().catch((e) => fail(String(e && e.message ? e.message : e)));
