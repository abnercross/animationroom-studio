// The speech engine on a Mac without compiling it. Compiling whisper.cpp needs Apple's Command Line Tools (a 5 to 20 minute
// Apple window), so Animation Room hosts a ready made copy for Apple Silicon and one for Intel (tools/pack-whisper-mac.mjs
// builds them, docs/whisper-mac-prebuilt.md says how). The zips are public files on animationroom.app; their sha256 is
// pinned in prebuilt-whisper.json, which ships inside the plugin, so a file that changed on the way is refused.
//
// The layout is the one @remotion/install-whisper-cpp expects for whisper.cpp 1.5.5: the program is <to>/main and it is
// started with <to> as the working folder (which is also where the Metal shader file is looked for).
//
// studio.mjs `transcriber install` uses this on macOS and falls back to compiling only when it returns ok false.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MANIFEST_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "prebuilt-whisper.json");
export const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
const MARKER = ".prebuilt.json";

const sysctl = (...keys) => {
  const r = spawnSync("/usr/sbin/sysctl", ["-in", ...keys], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
};

// The chip, not the shell: a Node running under Rosetta on an Apple Silicon Mac still gets the Apple Silicon engine.
// AR_MAC_CHIP (arm64 or x64) and AR_MAC_CPU (feature names like "AVX1.0 AVX2 FMA F16C") exist for tests only.
export function macChip() {
  if (process.env.AR_MAC_CHIP) return process.env.AR_MAC_CHIP;
  if (sysctl("hw.optional.arm64").trim() === "1") return "arm64";
  return os.arch() === "arm64" ? "arm64" : "x64";
}
const macCpu = () => new Set((process.env.AR_MAC_CPU ?? sysctl("machdep.cpu.features", "machdep.cpu.leaf7_features")).toUpperCase().split(/\s+/).filter(Boolean));

// What can be installed here: the zip for this chip and its programs in the order to try them
// (the AVX2 build first on an Intel Mac that has AVX2, the plain build otherwise or if the first one fails).
export function prebuiltPlan() {
  if (process.platform !== "darwin") return null;
  const m = readManifest();
  const chip = macChip();
  const build = m.builds && m.builds[chip];
  if (!build) return null;
  const cpu = macCpu();
  const programs = build.programs.filter((p) => (build.needs[p] || []).every((f) => cpu.has(f.toUpperCase())));
  if (!programs.length) return null;
  return { chip, build, programs, whisperCpp: m.whisperCpp, base: (process.env.AR_ENGINE_BASE || m.base).replace(/\/+$/, "") };
}

export const readPrebuiltState = (to) => { try { return JSON.parse(fs.readFileSync(path.join(to, MARKER), "utf8")); } catch { return null; } };
const writePrebuiltState = (to, state) => fs.writeFileSync(path.join(to, MARKER), JSON.stringify(state, null, 2));

// Apple's developer tools: only the compile fallback needs them. xcode-select -p fails without them and never opens a window.
export const hasAppleTools = () => process.env.AR_PRETEND_NO_APPLE_TOOLS !== "1" && spawnSync("/usr/bin/xcode-select", ["-p"], { stdio: "ignore" }).status === 0;

async function download(url, file) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(240000) });
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      if (Number(res.headers.get("content-length") || 0) > 50e6) throw new Error("the file is far bigger than expected");
      // The zips are about a megabyte, so read the whole body at once. Pausing a streamed body while the server closes the
      // connection crashes Node's fetch (an uncaught assertion in undici), which no try block can catch.
      const bytes = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, bytes);
      return crypto.createHash("sha256").update(bytes).digest("hex");
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`could not download ${path.basename(url)} (${lastError && lastError.message})`);
}

// Downloads the zip, checks it against the pinned sha256, unpacks it, puts the first program in place as <to>/main and
// makes sure it starts. Returns { ok: true, programs, active } or { ok: false, reason }. Never throws.
export async function fetchPrebuilt({ to, log = () => {} }) {
  const plan = prebuiltPlan();
  if (!plan) return { ok: false, reason: "there is no ready made engine for this Mac" };
  const parent = path.dirname(to);
  fs.mkdirSync(parent, { recursive: true });
  for (const e of fs.readdirSync(parent)) if (e.startsWith(".prebuilt-")) fs.rmSync(path.join(parent, e), { recursive: true, force: true }); // left by an install that was stopped
  const work = fs.mkdtempSync(path.join(parent, ".prebuilt-"));
  try {
    const zip = path.join(work, plan.build.file);
    log(`Downloading the speech engine (${Math.max(1, Math.round(plan.build.bytes / 1024 / 1024 * 10) / 10)} MB)...`);
    const sha = await download(`${plan.base}/${plan.build.file}`, zip);
    if (sha !== plan.build.sha256) return { ok: false, reason: "the downloaded engine did not match the expected file" };
    const files = path.join(work, "files");
    fs.mkdirSync(files);
    const un = spawnSync("/usr/bin/unzip", ["-q", "-o", zip, "-d", files], { encoding: "utf8" });
    if (un.status !== 0) return { ok: false, reason: "the engine could not be unpacked" };
    const need = [...plan.build.programs, ...(plan.build.gpu === "metal" ? ["ggml-metal.metal", "ggml-common.h"] : [])];
    const missing = need.filter((f) => !fs.existsSync(path.join(files, f)));
    if (missing.length) return { ok: false, reason: `the engine is missing ${missing.join(", ")}` };
    for (const p of plan.build.programs) fs.chmodSync(path.join(files, p), 0o755);
    spawnSync("/usr/bin/xattr", ["-cr", files], { stdio: "ignore" }); // nothing downloaded by a script is quarantined; this is only a precaution
    const active = plan.programs[0];
    if (active !== "main") fs.copyFileSync(path.join(files, active), path.join(files, "main"));
    fs.chmodSync(path.join(files, "main"), 0o755);
    // Starts at all? (-h prints the help and stops, so this needs no model.) Catches a wrong chip or a blocked program early.
    const hello = spawnSync(path.join(files, "main"), ["-h"], { cwd: files, encoding: "utf8", timeout: 30000 });
    if (hello.status !== 0) return { ok: false, reason: `the engine would not start (${hello.signal || "exit " + hello.status})` };
    fs.rmSync(to, { recursive: true, force: true });
    fs.renameSync(files, to);
    writePrebuiltState(to, { whisperCpp: plan.whisperCpp, chip: plan.chip, file: plan.build.file, sha256: sha, programs: plan.programs, active, proven: false, at: new Date().toISOString() });
    return { ok: true, programs: plan.programs, active };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e).split("\n")[0] };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Switches the installed engine to another of its programs (the plain Intel build when the AVX2 one fails).
export function useProgram(to, program) {
  const state = readPrebuiltState(to);
  if (!state || !state.programs.includes(program)) return false;
  if (program !== "main") {
    fs.copyFileSync(path.join(to, program), path.join(to, "main"));
    fs.chmodSync(path.join(to, "main"), 0o755);
  }
  writePrebuiltState(to, { ...state, active: program, proven: false });
  return true;
}
export function markProven(to, result) {
  const state = readPrebuiltState(to);
  if (state) writePrebuiltState(to, { ...state, proven: true, gpu: result.gpu, check: result.level, seconds: result.seconds });
}

// 16 kHz mono 16 bit wav of a quiet tone, for the rare Mac where `say` gives nothing.
function toneWav(seconds) {
  const n = 16000 * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 3000), 44 + i * 2);
  return buf;
}

// Runs the installed engine once on a few seconds of speech, started the way Remotion starts it (working folder = <to>).
// The speech is made on this Mac by the system voice (nothing is stored or sent). The sentence has to come back as words.
// Returns { ok, level: "words" | "ran", gpu, seconds, reason }.
export function proveEngine({ to, model, log = () => {} }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-speech-check-"));
  try {
    const wav = path.join(tmp, "check.wav");
    const phrase = "The quick brown fox jumps over the lazy dog";
    const say = spawnSync("/usr/bin/say", ["-o", wav, "--file-format=WAVE", "--data-format=LEI16@16000", phrase], { encoding: "utf8", timeout: 30000 });
    const spoken = say.status === 0 && fs.existsSync(wav) && fs.statSync(wav).size > 20000;
    if (!spoken) fs.writeFileSync(wav, toneWav(2));
    log("Testing the speech engine on a few seconds of speech...");
    const t0 = Date.now();
    const r = spawnSync(path.join(to, "main"), ["-m", model, "-f", wav, "-l", "en", "-nt", "-t", "4"], { cwd: to, encoding: "utf8", timeout: 300000, maxBuffer: 1e8 });
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    if (r.error && r.error.code === "ETIMEDOUT") return { ok: false, reason: "the test took longer than five minutes" };
    if (r.status !== 0) return { ok: false, reason: `the test run stopped (${r.signal || "exit " + r.status})` };
    const gpu = /ggml_metal_init: GPU name/.test(r.stderr || "");
    if (!spoken) return /whisper_print_timings/.test(r.stderr || "") ? { ok: true, level: "ran", gpu, seconds } : { ok: false, reason: "the test run did not finish" };
    const words = String(r.stdout || "").toLowerCase().match(/[a-z]+/g) || [];
    const hits = ["quick", "brown", "fox", "jumps", "lazy", "dog"].filter((w) => words.includes(w)).length;
    if (hits < 3) return { ok: false, reason: `the test sentence came back wrong ("${words.join(" ").slice(0, 80)}")` };
    return { ok: true, level: "words", gpu, seconds };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
