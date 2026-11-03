// Edit mode: the person with a transparent background, using only what is already on the computer: the video
// browser runs Google's MediaPipe person model, ffmpeg writes the result. No Python on members' machines.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ensureFfmpeg } from "./ffmpeg-tool.mjs";
import { DATA, fail, probe, readConfig } from "./edit-core.mjs";

export const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
const MODEL_SHA = "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0";
const MODEL_FILE = path.join(DATA, "tools", "person-model.tflite");
const S = 256; // the model's own size; frames go in at this size and the mask comes back at the same size

export async function ensureModel() {
  const ok = () => fs.existsSync(MODEL_FILE) && createHash("sha256").update(fs.readFileSync(MODEL_FILE)).digest("hex") === MODEL_SHA;
  if (ok()) return "ready";
  console.error("Getting the person model (16 MB). This only happens once...");
  const res = await fetch(MODEL_URL);
  if (!res.ok) fail("the person model could not be downloaded. Check the internet connection and try again");
  fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
  fs.writeFileSync(MODEL_FILE, Buffer.from(await res.arrayBuffer()));
  if (!ok()) { fs.rmSync(MODEL_FILE, { force: true }); fail("the person model did not download correctly. Try again"); }
  return "installed";
}

const PAGE = `<!doctype html><script>
const report = (e) => fetch("/error", { method: "POST", body: String(e && (e.reason || e.message) || e) });
addEventListener("error", report); addEventListener("unhandledrejection", report);
</script><script type="module">
import { FilesetResolver, ImageSegmenter } from "/mp/vision_bundle.mjs";
const fileset = await FilesetResolver.forVisionTasks("/mp/wasm");
const seg = await ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: "/model", delegate: new URLSearchParams(location.search).get("d") || "CPU" }, runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false });
const { w, h, fps } = await (await fetch("/info")).json();
for (let i = 0; ; i++) {
  const r = await fetch("/frame");
  if (r.status === 204) break;
  const rgba = new Uint8ClampedArray(await r.arrayBuffer());
  const res = seg.segmentForVideo(new ImageData(rgba, w, h), i * 1000 / fps);
  const bg = res.confidenceMasks[0].getAsFloat32Array();
  if (bg.length !== w * h) throw new Error("unexpected mask size " + bg.length);
  const out = new Uint8Array(bg.length);
  for (let k = 0; k < bg.length; k++) out[k] = Math.round((1 - bg[k]) * 255);
  res.close();
  await fetch("/mask", { method: "POST", body: out });
}
await fetch("/done", { method: "POST" });
</script>`;

// Keeps the largest connected shape, so a ceiling fan or a chair that the model picked up does not stay behind.
function largestShape(m) {
  const seen = new Uint8Array(S * S), stack = new Int32Array(S * S);
  let best = 0, bestId = 0, total = 0, id = 0;
  const label = new Int32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    if (seen[i] || m[i] < 110) continue;
    id++;
    let sp = 0, size = 0;
    stack[sp++] = i; seen[i] = 1;
    while (sp) {
      const p = stack[--sp];
      label[p] = id; size++;
      const x = p % S, n = [x > 0 ? p - 1 : -1, x < S - 1 ? p + 1 : -1, p - S, p + S];
      for (const q of n) if (q >= 0 && q < S * S && !seen[q] && m[q] >= 110) { seen[q] = 1; stack[sp++] = q; }
    }
    total += size;
    if (size > best) { best = size; bestId = id; }
  }
  const out = Buffer.from(m);
  for (let i = 0; i < S * S; i++) if (label[i] && label[i] !== bestId) out[i] = 0;
  return { out, person: best, stray: total - best };
}

function chrome() {
  const b = readConfig().browserExecutable;
  if (b && fs.existsSync(b)) return b;
  const exe = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  const find = (d) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { const r = find(f); if (r) return r; } else if (e.name === exe) return f; } } catch {} return ""; };
  return find(path.join(DATA, "runtime", "node_modules", ".remotion")) || find(path.join(DATA, "runtime-edit", "node_modules", ".remotion"));
}

// Everything the cutout starts must end with it, even if it is stopped or crashes: a forgotten ffmpeg or browser would
// keep a member's computer busy for no visible reason. Signals cover a normal stop; a small watcher covers a hard kill.
const WATCHER = `const fs = require("node:fs");
const [parent, litter, ...kids] = process.argv.slice(1);
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
setInterval(() => {
  if (alive(+parent)) { if (!kids.some((k) => alive(+k))) process.exit(); return; }
  for (const k of kids) { try { process.kill(+k, "SIGKILL"); } catch {} }
  setTimeout(() => { for (const f of JSON.parse(litter)) { try { fs.rmSync(f, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {} } process.exit(); }, 1000);
}, 1000);`;
function guardChildren(children, litter) {
  const stop = () => { for (const c of children) { try { c.kill("SIGKILL"); } catch {} } };
  const clear = () => { for (const f of litter) { try { fs.rmSync(f, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} } };
  const onSignal = () => { stop(); clear(); process.exit(1); };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  signals.forEach((n) => process.on(n, onSignal));
  process.on("exit", stop);
  const watcher = spawn(process.execPath, ["-e", WATCHER, String(process.pid), JSON.stringify(litter), ...children.map((c) => String(c.pid))], { detached: true, stdio: "ignore" });
  watcher.unref();
  return () => { signals.forEach((n) => process.off(n, onSignal)); process.off("exit", stop); stop(); };
}

// The computer's real graphics chip makes this about ten times faster. Software graphics is the fallback.
const GPU_FLAGS = { darwin: ["--use-gl=angle", "--use-angle=metal"], win32: ["--use-gl=angle", "--use-angle=d3d11"], linux: ["--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan"] };
const SOFTWARE_FLAGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

export async function makeCutout(video, outFile) {
  await ensureModel();
  const flags = GPU_FLAGS[process.platform];
  if (flags) {
    const fast = await attempt(video, outFile, [...flags, "--ignore-gpu-blocklist"], "GPU", 40);
    if (fast) return fast;
    console.error("The graphics chip could not be used, so this will take longer...");
  }
  const slow = await attempt(video, outFile, SOFTWARE_FLAGS, "CPU", 300);
  if (!slow) fail("the person could not be cut out of this video. Use the frame look for this one");
  return slow;
}

async function attempt(video, outFile, chromeFlags, delegate, patience) {
  const ffmpeg = ensureFfmpeg(DATA), m = probe(video), browser = chrome();
  if (!ffmpeg) fail("the video tools are missing. Run: studio.mjs ffmpeg install");
  if (!browser) fail("the video browser is missing. Run: studio.mjs runtime install --engine edit");
  const mp = path.join(DATA, "runtime-edit", "node_modules", "@mediapipe", "tasks-vision");
  const outW = Math.min(1080, m.width), outH = Math.round((outW * m.height) / m.width / 2) * 2; // a 4K phone recording is far more than the picture needs
  const size = S * S * 4;
  const partFile = `${outFile}.part.webm`; // the real name only appears once the file is complete
  const maskFile = `${outFile}.masks.mkv`;
  const dec = spawn(ffmpeg, ["-v", "error", "-i", video, "-an", "-vf", `scale=${S}:${S},format=rgba`, "-f", "rawvideo", "-"], { stdio: ["ignore", "pipe", "ignore"] });
  // The masks are saved on their own first (small, lossless) and joined with the video afterwards. An ffmpeg that reads
  // the video while masks trickle in one by one can spin on the video and take a mask a second (seen with 4.4).
  const enc = spawn(ffmpeg, ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${S}x${S}`, "-r", String(m.fps), "-i", "-",
    "-c:v", "ffv1", maskFile], { stdio: ["pipe", "ignore", "pipe"] });
  let encErr = ""; enc.stderr.on("data", (d) => { encErr += d; });
  enc.stdin.on("error", () => {}); // it may be stopped while a mask is on its way
  dec.stdout.on("error", () => {});
  const encDone = new Promise((res) => enc.on("close", res));

  let held = Buffer.alloc(0), ended = false, waiter = null;
  dec.stdout.on("data", (d) => { held = Buffer.concat([held, d]); if (held.length > size * 4) dec.stdout.pause(); if (waiter) waiter(); });
  dec.stdout.on("end", () => { ended = true; if (waiter) waiter(); });
  const nextFrame = async () => {
    while (held.length < size && !ended) { dec.stdout.resume(); await new Promise((r) => { waiter = r; }); waiter = null; }
    if (held.length < size) return null;
    const f = held.subarray(0, size); held = held.subarray(size); dec.stdout.resume();
    return f;
  };
  const areas = [], strays = [];
  const body = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
  const types = { ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm" };
  let finish, pageError = "", closing = false;
  const finished = new Promise((res) => { finish = res; });
  const server = http.createServer(async (req, res) => {
    const u = req.url.split("?")[0];
    if (process.env.AR_DEBUG) console.error("req", req.method, u);
    if (u === "/") { res.setHeader("content-type", "text/html"); return res.end(PAGE); }
    if (u === "/info") return res.end(JSON.stringify({ w: S, h: S, fps: m.fps }));
    if (u === "/model") return res.end(fs.readFileSync(MODEL_FILE));
    if (u === "/frame") { const f = await nextFrame(); if (!f) { res.statusCode = 204; return res.end(); } return res.end(f); }
    if (u === "/mask") {
      const { out, person, stray } = largestShape(await body(req));
      areas.push(person / (S * S)); strays.push(person ? stray / person : 0);
      if (areas.length % 100 === 0) console.error(`cutting out: ${Math.min(99, Math.round((areas.length / (m.duration * m.fps)) * 100))}%`);
      if (closing) return res.end();
      if (!enc.stdin.write(out)) await new Promise((r) => { enc.stdin.once("drain", r); enc.once("close", r); });
      return res.end();
    }
    if (u === "/done") { res.end(); return finish(); }
    if (u === "/error") { pageError = String(await body(req)); res.end(); return finish("error"); }
    if (u.startsWith("/mp/")) {
      const f = path.join(mp, u.slice(4));
      if (!f.startsWith(mp) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
      res.setHeader("content-type", types[path.extname(f)] || "application/octet-stream");
      return res.end(fs.readFileSync(f));
    }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/?d=${delegate}`;
  const tmpProfile = fs.mkdtempSync(path.join(path.dirname(outFile), ".cutout-"));
  const page = spawn(browser, ["--no-sandbox", ...chromeFlags, `--user-data-dir=${tmpProfile}`, "--remote-debugging-port=0", url], { stdio: "ignore" });
  const release = guardChildren([dec, enc, page], [tmpProfile, partFile, maskFile]);
  // Stops rather than hangs when the page goes quiet.
  let seen = -1;
  const watch = setInterval(() => { if (areas.length === seen) finish("stuck"); seen = areas.length; }, patience * 1000);
  let lost = false;
  page.on("exit", () => { lost = true; finish("lost"); });
  const how = await finished;
  clearInterval(watch);
  closing = true;
  if (how) enc.kill("SIGKILL"); // a failed try has nothing worth finishing
  else enc.stdin.end();
  await encDone;
  if (!lost) { page.kill(); await new Promise((r) => { page.once("exit", r); setTimeout(r, 3000); }); }
  release();
  server.close();
  try { fs.rmSync(tmpProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {}
  if (pageError && process.env.AR_DEBUG) console.error(`cutout page: ${pageError.slice(0, 300)}`);
  if (how || !areas.length) { fs.rmSync(partFile, { force: true }); fs.rmSync(maskFile, { force: true }); return null; }
  if (!fs.existsSync(maskFile) || !fs.statSync(maskFile).size) fail(`the cutout could not be saved: ${encErr.slice(-200)}`);
  // Soft edge from the small mask, a touch of smoothing over time so the edge does not shimmer.
  const merge = spawnSync(ffmpeg, ["-v", "error", "-y", "-i", maskFile, "-i", video,
    "-filter_complex", `[0:v]scale=${outW}:${outH}:flags=bicubic,gblur=sigma=2.5,lut=y='clip((val-95)*255/70,0,255)',tmix=frames=2:weights='3 2',format=gray[a];[1:v]scale=${outW}:${outH}[c];[c][a]alphamerge,format=yuva420p[v]`,
    "-map", "[v]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "28", "-deadline", "realtime", "-cpu-used", "7", "-row-mt", "1", "-auto-alt-ref", "0", "-shortest", partFile], { encoding: "utf8", maxBuffer: 1e8 });
  fs.rmSync(maskFile, { force: true });
  if (merge.status !== 0 || !fs.existsSync(partFile) || !fs.statSync(partFile).size) { fs.rmSync(partFile, { force: true }); fail(`the cutout could not be saved: ${String(merge.stderr || "").slice(-200)}`); }
  fs.renameSync(partFile, outFile);
  return { ...judge(areas, strays), frames: areas.length };
}

// Plain numbers that catch a bad cutout: nobody found, the whole frame taken, a shape that keeps jumping, stray pieces.
function judge(areas, strays) {
  const sorted = [...areas].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  let jumps = 0;
  for (let i = 1; i < areas.length; i++) if (Math.abs(areas[i] - areas[i - 1]) > Math.max(0.03, med * 0.2)) jumps++;
  const jumpShare = jumps / Math.max(1, areas.length - 1);
  const strayShare = strays.filter((s) => s > 0.06).length / areas.length;
  const problems = [];
  if (med < 0.04) problems.push("hardly any person was found");
  if (med > 0.92) problems.push("almost the whole picture counted as the person");
  if (jumpShare > 0.06) problems.push("the outline jumps around");
  if (strayShare > 0.25) problems.push("other objects keep being picked up");
  return { quality: problems.length ? "poor" : "good", problems, medianArea: med, jumpShare, strayShare };
}
