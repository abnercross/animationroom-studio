// Edit mode: bundle the Edit engine, render stills and videos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DATA, PLUGIN_ROOT, ff, fail, out, readConfig, readJson } from "./edit-core.mjs";
import { buildPlan, loadStyle } from "./edit-plan.mjs";
import { updateEngine } from "./engine-update.mjs";

// ---------- bundle, stills, render ----------
const RUNTIME_EDIT = path.join(DATA, "runtime-edit");
const importRuntime = (name) => import(pathToFileURL(createRequire(path.join(RUNTIME_EDIT, "package.json")).resolve(name)).href);
function requireEngine() {
  let inst;
  try { inst = readJson(path.join(RUNTIME_EDIT, ".installed.json")); } catch { fail("the Edit engine is not installed yet. Run: studio.mjs runtime install --engine edit"); }
  const want = readJson(path.join(PLUGIN_ROOT, "edit-runtime", "package.json")).version;
  if (inst.version !== want && !updateEngine({ data: DATA, edit: true, from: inst.version, to: want }))
    fail(`the Edit engine is out of date (installed ${inst.version}, this plugin needs ${want}) and could not be updated by itself. Run: studio.mjs runtime install --engine edit`);
}
export async function prepare(planFile, wordsFile, styleId) {
  requireEngine();
  const style = await loadStyle(styleId);
  const { plan, tokens, videoFile } = buildPlan(planFile, wordsFile, style);
  // Give the engine the video through its public folder (a hard link, so a big file is not copied).
  const stage = path.join(RUNTIME_EDIT, "public", "work");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const staged = path.join(stage, "video.mp4");
  try { fs.linkSync(videoFile, staged); } catch { fs.copyFileSync(videoFile, staged); }
  plan.video.src = "work/video.mp4";
  const { bundle } = await importRuntime("@remotion/bundler");
  const { selectComposition } = await importRuntime("@remotion/renderer");
  const serveUrl = await bundle({ entryPoint: path.join(RUNTIME_EDIT, "src", "index.ts"), publicDir: path.join(RUNTIME_EDIT, "public"), onProgress: () => {} });
  const browserExecutable = readConfig().browserExecutable || undefined;
  const inputProps = { plan, tokens };
  const composition = await selectComposition({ serveUrl, id: "Edit", inputProps, browserExecutable, logLevel: "error" });
  return { serveUrl, inputProps, browserExecutable, composition, plan, cleanup: () => fs.rmSync(stage, { recursive: true, force: true }) };
}
export async function stills(planFile, wordsFile, styleId, times, outFile) {
  const r = await prepare(planFile, wordsFile, styleId);
  const { renderStill } = await importRuntime("@remotion/renderer");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-edit-"));
  const fps = r.composition.fps;
  let i = 0;
  for (const t of times) {
    await renderStill({ composition: r.composition, serveUrl: r.serveUrl, output: path.join(tmp, `s${String(i++).padStart(2, "0")}.png`), frame: Math.min(r.composition.durationInFrames - 1, Math.round(t * fps)), inputProps: r.inputProps, browserExecutable: r.browserExecutable, scale: 0.4, logLevel: "error" });
  }
  const cols = Math.min(times.length, 6), rows = Math.ceil(times.length / cols);
  ff(["-v", "error", "-y", "-i", path.join(tmp, "s%02d.png"), "-vf", `tile=${cols}x${rows}:padding=12:color=white`, "-frames:v", "1", outFile]);
  r.cleanup();
  out("RESULT", "stills");
  out("TIMES", times.join(","));
  out("FILE", outFile);
}
// Phone recordings are often very quiet (minus 28 LUFS is common) and phones play at about minus 14.
// If the finished sound is far from that, bring it to minus 16 with a measured, linear pass (no pumping);
// the picture is copied untouched. Returns "ok", "raised", "lowered" or "skipped".
export function levelSound(file) {
  const m = ff(["-hide_banner", "-i", file, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { allowFail: true }).stderr;
  let j; try { j = JSON.parse(String(m).slice(String(m).lastIndexOf("{"), String(m).lastIndexOf("}") + 1)); } catch { return "skipped"; }
  const now = parseFloat(j.input_i);
  if (!Number.isFinite(now) || (now >= -18 && now <= -12)) return "ok";
  const tmp = file.replace(/\.mp4$/i, ".level.mp4");
  const af = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  const r = ff(["-v", "error", "-y", "-i", file, "-af", af, "-ar", "48000", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], { allowFail: true });
  if (r.status !== 0 || !fs.existsSync(tmp)) { try { fs.rmSync(tmp, { force: true }); } catch {} return "skipped"; }
  fs.renameSync(tmp, file);
  return now < -18 ? "raised" : "lowered";
}

export async function renderVideo(planFile, wordsFile, styleId, outFile, range = null) {
  const t0 = Date.now();
  const r = await prepare(planFile, wordsFile, styleId);
  const { renderMedia } = await importRuntime("@remotion/renderer");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  let last = -1;
  await renderMedia({
    composition: r.composition, serveUrl: r.serveUrl, codec: "h264", outputLocation: outFile, inputProps: r.inputProps, browserExecutable: r.browserExecutable,
    crf: 18, colorSpace: "bt709", logLevel: "error", ...(range ? { frameRange: [Math.max(0, Math.round(range[0] * r.composition.fps)), Math.min(r.composition.durationInFrames - 1, Math.round(range[1] * r.composition.fps) - 1)] } : {}), concurrency: Math.max(2, Math.min(6, os.cpus().length - 2)),
    onProgress: ({ progress }) => { const pc = Math.floor(progress * 10); if (pc !== last) { last = pc; console.error(`rendering ${pc * 10}%`); } },
  });
  r.cleanup();
  out("LOUDNESS", levelSound(outFile));
  out("RESULT", "rendered");
  out("FILE", outFile);
  out("DURATION", r.plan.duration.toFixed(1));
  out("SECONDS", ((Date.now() - t0) / 1000).toFixed(1));
}


// ---------- Remotion Studio preview: scrub the edit on the timeline before (or after) the final render ----------
const PREVIEW_PID = path.join(RUNTIME_EDIT, ".preview.json");
export function stopPreview() {
  try {
    const { pid } = readJson(PREVIEW_PID);
    try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch {} }
  } catch {}
  fs.rmSync(PREVIEW_PID, { force: true });
}
export async function startPreview(planFile, wordsFile, styleId, port = 3123) {
  requireEngine();
  stopPreview();
  const style = await loadStyle(styleId);
  const { plan, tokens, videoFile } = buildPlan(planFile, wordsFile, style);
  // The studio reads the video from its public folder, so it is linked there (a hard link, not a copy).
  const stage = path.join(RUNTIME_EDIT, "public", "preview");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try { fs.linkSync(videoFile, path.join(stage, "video.mp4")); } catch { fs.copyFileSync(videoFile, path.join(stage, "video.mp4")); }
  plan.video.src = "preview/video.mp4";
  const propsFile = path.join(RUNTIME_EDIT, ".preview-props.json");
  fs.writeFileSync(propsFile, JSON.stringify({ plan, tokens }));
  const cli = path.join(RUNTIME_EDIT, "node_modules", "@remotion", "cli", "remotion-cli.js");
  const log = fs.openSync(path.join(RUNTIME_EDIT, ".preview.log"), "w");
  const child = spawn(process.execPath, [cli, "studio", "src/index.ts", `--port=${port}`, `--props=${propsFile}`, "--no-open"], { cwd: RUNTIME_EDIT, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.writeFileSync(PREVIEW_PID, JSON.stringify({ pid: child.pid, port }));
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { const res = await fetch(url); if (res.ok) return url; } catch {}
  }
  stopPreview();
  fail("the timeline preview did not start. See " + path.join(RUNTIME_EDIT, ".preview.log"));
}
