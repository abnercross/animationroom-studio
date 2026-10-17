#!/usr/bin/env node
// Animation Room Studio: Edit mode. Talking head video in, finished edit out.
// The look independent part: measure, cut, check, plan, preview, render. Every command takes
// --data <folder> (or reads CLAUDE_PLUGIN_DATA). The last lines printed are KEY=value.
//
//   edit.mjs start [video]                      pick the video, make its work folder
//   edit.mjs analyze <video> [--work <folder>]  silences, words, measurements: analysis.json
//   edit.mjs cuts <analysis.json> [--out cuts.json] [--pause 0.3]
//   edit.mjs cut <video> <cuts.json> --analysis <analysis.json> [--out edited.mp4]
//   edit.mjs face <video> [--at 3] [--out face.png]     a still with a grid, to read where the face is
//   edit.mjs track <plan.json> --video <edited.mp4>     follow the face (plan "face" needs x, y, w)
//   edit.mjs drawings [--words <words.json>]            the drawing library, and which spoken words match a drawing
//   edit.mjs validate <plan.json> --words <words.json>  check the plan before rendering
//   edit.mjs stills <plan.json> --words <words.json> [--at 3,9,20] [--out sheet.png]
//   edit.mjs sample <plan.json> --words <words.json>    an 8 to 12 second sample to approve first
//   edit.mjs render <plan.json> --words <words.json> [--range 12,20] [--final]
//   edit.mjs preview <plan.json> --words <words.json> | --stop   open the edit on the Remotion timeline
//   edit.mjs check <video> [--words <words.json>] [--transcript]   check a finished file
//   edit.mjs variant <plan.json> --name B --set moments.1.text="New title"
//   edit.mjs prefs save <plan.json> | show | reset      remember the approved look for next time
//   edit.mjs probe <video>

import fs from "node:fs";
import path from "node:path";
import { fail, opt, out, pos, probe, readJson, start, writeJson } from "./edit-core.mjs";
import { analyze, findSilences } from "./edit-analyze.mjs";
import { applyCuts, proposeCuts } from "./edit-cuts.mjs";
import { transcriptWarnings, videoCheck } from "./edit-check.mjs";
import { faceGuide, trackFace } from "./edit-track.mjs";
import { PREFS_FILE, buildPlan, loadStyle, readPrefs, readPrefsFile } from "./edit-plan.mjs";
import { renderVideo, startPreview, stills, stopPreview } from "./edit-render.mjs";
import { DATA, readConfig } from "./edit-core.mjs";
import { DRAWINGS, suggest } from "./edit-draw.mjs";
import { finishedProjectName, jobNameOf, safeName } from "./projects.mjs";

const jobFolder = (planFile) => path.dirname(planFile);
const jobName = (planFile) => opt.name ? String(opt.name) : jobNameOf(path.basename(jobFolder(planFile)));
// Saved versions: V01, V02... each keeps the plan it was made from, so any one can be remade or compared.
function versionsOf(work) {
  const dir = path.join(work, "versions");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^V\d+$/.test(n)).sort() : [];
}
function saveVersion(planFile, note = "") {
  const work = jobFolder(planFile);
  const all = versionsOf(work);
  const v = "V" + String((all.length ? +all[all.length - 1].slice(1) : 0) + 1).padStart(2, "0");
  const dir = path.join(work, "versions", v);
  fs.mkdirSync(dir, { recursive: true });
  const src = readJson(planFile);
  if (src.video) src.video = path.resolve(work, src.video); // stays valid from the version folder
  writeJson(path.join(dir, "plan.json"), src);
  const log = path.join(work, "versions.csv");
  if (!fs.existsSync(log)) fs.writeFileSync(log, "version,date,note\n");
  fs.appendFileSync(log, `${v},${new Date().toISOString().slice(0, 16).replace("T", " ")},"${String(note).replace(/"/g, "'")}"\n`);
  return v;
}
// A sample worth approving: about 10 seconds with the most variety, including the person moving into the frame.
function pickSample(plan, length = 10) {
  const dur = plan.duration, ms = plan.moments;
  let best = { score: -1, from: 0 };
  for (const start of [0, ...ms.map((m) => Math.max(0, m.from - 1))]) {
    const from = Math.min(start, Math.max(0, dur - length)), to = from + length;
    const inside = ms.filter((m) => m.from < to && m.to > from);
    const types = new Set(inside.map((m) => m.type)).size;
    const enters = inside.some((m) => (m.layout ?? "window") === "window" && m.from >= from && m.from < to);
    const score = types * 2 + (enters ? 3 : 0) + inside.length * 0.5 - from * 0.001;
    if (score > best.score) best = { score, from: +from.toFixed(1) };
  }
  return [best.from, +Math.min(dur, best.from + length).toFixed(1)];
}


async function main() {
  const cmd = pos[0];
  if (cmd === "start") {
    const r = start(pos[1]);
    out("RESULT", "started");
    out("VIDEO", r.video);
    out("PROJECT", r.project);
    out("WORK_FOLDER", r.work);
    out("FINISHED_FOLDER", r.finished);
    return;
  }
  const video = pos[1] && path.resolve(pos[1]);
  if (cmd === "probe") {
    const m = probe(video);
    console.log(`${m.width}x${m.height}, ${m.duration.toFixed(1)} s, ${m.fps} fps${m.audio ? "" : ", no sound"}`);
    out("RESULT", "measured");
    out("WIDTH", m.width);
    out("HEIGHT", m.height);
    out("DURATION", m.duration.toFixed(2));
    out("FPS", m.fps);
    out("AUDIO", m.audio ? "yes" : "no");
    out("SHAPE", m.height > m.width ? "vertical" : m.height === m.width ? "square" : "horizontal");
    return;
  }
  if (cmd === "analyze") {
    const work = path.resolve(String(opt.work || path.dirname(video)));
    const a = await analyze(video, work);
    const talk = a.words.length;
    const longest = a.silences.reduce((m, s) => Math.max(m, s.to - s.from), 0);
    out("RESULT", "analyzed");
    out("WORDS", talk);
    out("SILENCES", a.silences.length);
    out("LONGEST_SILENCE", longest.toFixed(1));
    out("FILE", path.join(work, "analysis.json"));
    return;
  }
  if (cmd === "cuts") {
    const aFile = path.resolve(pos[1] || "");
    if (!fs.existsSync(aFile)) fail("cuts needs analysis.json (run edit.mjs analyze first)");
    const a = readJson(aFile);
    const cuts = proposeCuts(a, { pause: Number(opt.pause) || 0.3 });
    const file = path.resolve(String(opt.out || path.join(path.dirname(aFile), "cuts.json")));
    writeJson(file, cuts);
    cuts.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}  ${c.keep ? "keep" : "DROP"}  ${c.from.toFixed(2)} to ${c.to.toFixed(2)}  ${c.keep ? c.text.slice(0, 80) : `(${c.reason}) ${c.text.slice(0, 60)}`}`));
    const kept = cuts.filter((c) => c.keep).reduce((s, c) => s + c.to - c.from, 0);
    out("RESULT", "proposed");
    out("PARTS", cuts.length);
    out("KEPT_SECONDS", kept.toFixed(1));
    out("REMOVED_SECONDS", (a.duration - kept).toFixed(1));
    out("FILE", file);
    return;
  }
  if (cmd === "cut") {
    if (!pos[2] || !fs.existsSync(pos[2])) fail("cut needs the cuts file (edit.mjs cuts first)");
    if (!opt.analysis || !fs.existsSync(opt.analysis)) fail("cut needs --analysis <analysis.json>");
    const a = readJson(opt.analysis);
    const outFile = path.resolve(String(opt.out || path.join(path.dirname(String(opt.analysis)), "edited.mp4")));
    const res = applyCuts(video, readJson(pos[2]), a.words, outFile);
    // The cut video is listened to again: its own transcript gives the real word times for the graphics
    // (words remapped from the original inherit its timing mistakes), and shows anything that should be gone.
    const dir = path.dirname(outFile), base = path.basename(outFile).replace(/\.mp4$/, "");
    const heard = await analyze(outFile, dir, `${base}.`);
    const wordsOut = path.join(dir, `${base}.words.json`);
    const warns = transcriptWarnings(res.words, heard.words, heard.silences).warnings;
    const long = heard.silences.filter((s) => s.to - s.from >= 0.7);
    long.forEach((s) => warns.push(`silence of ${(s.to - s.from).toFixed(1)} s at ${s.from.toFixed(1)} s`));
    warns.forEach((w) => console.log(`warning: ${w}`));
    out("RESULT", "cut");
    out("DURATION", res.duration.toFixed(2));
    out("FILE", outFile);
    out("WORDS_FILE", wordsOut);
    out("CHECK", warns.length ? `${warns.length}_warnings` : "clean");
    return;
  }
  if (cmd === "face") {
    const png = path.resolve(String(opt.out || path.join(path.dirname(video), "face.png")));
    faceGuide(video, Number(opt.at) || 3, png);
    out("RESULT", "guide");
    out("FILE", png);
    return;
  }
  if (cmd === "prefs") {
    if (pos[1] === "show") { console.log(JSON.stringify(readPrefsFile(), null, 2)); out("RESULT", "shown"); return; }
    if (pos[1] === "reset") { fs.rmSync(PREFS_FILE, { force: true }); out("RESULT", "reset"); return; }
    if (pos[1] === "save") {
      const planFile = path.resolve(pos[2] || "");
      if (!fs.existsSync(planFile)) fail("prefs save needs the plan file");
      const mine = readJson(planFile).tokens;
      if (!mine) fail("this plan has no look changes of its own to remember (the plan's \"tokens\" is empty)");
      const format = readJson(planFile).format || "9:16";
      const all = readPrefsFile();
      const merged = { ...(all.formats?.[format]?.tokens || {}) };
      for (const [k, v] of Object.entries(mine)) merged[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(merged[k] || {}), ...v } : v;
      writeJson(PREFS_FILE, { formats: { ...(all.formats || {}), [format]: { tokens: merged, savedAt: new Date().toISOString() } } });
      out("RESULT", "saved");
      out("FILE", PREFS_FILE);
      return;
    }
    fail("use: prefs save <plan.json> | show | reset");
  }
  if (cmd === "drawings") {
    for (const [id, d] of Object.entries(DRAWINGS)) console.log(`${id}: ${d.about}`);
    let hits = [];
    if (opt.words) {
      if (!fs.existsSync(opt.words)) fail("words file not found");
      hits = suggest(readJson(opt.words));
      hits.forEach((h) => console.log(`suggest: ${h.id} for ${h.hits.map((x) => `"${x.ref}" (${x.t.toFixed(1)} s)`).join(", ")}`));
    }
    out("RESULT", "listed");
    out("DRAWINGS", Object.keys(DRAWINGS).length);
    if (opt.words) out("SUGGESTED", hits.length);
    return;
  }
  if (cmd === "preview" && opt.stop) { stopPreview(); out("RESULT", "stopped"); return; }
  if (["track", "validate", "stills", "sample", "render", "variant", "preview"].includes(cmd)) {
    const planFile = pos[1] && path.resolve(pos[1]);
    if (!planFile || !fs.existsSync(planFile)) fail("plan file not found");
    const src = readJson(planFile);
    const styleId = src.style || "clean-grid";
    if (cmd === "track") {
      const f = src.face || {};
      if (typeof f.x !== "number" || typeof f.y !== "number") fail('the plan needs "face": { "x", "y", "w" } first (read them from the face guide still)');
      const vid = path.resolve(String(opt.video || path.resolve(path.dirname(planFile), src.video || "")));
      const r = trackFace(vid, { x: f.x, y: f.y, w: f.w || 0.3 });
      src.face = { ...f, w: f.w || 0.3, track: r.track };
      writeJson(planFile, src);
      out("RESULT", "tracked");
      out("FRAMES", r.frames);
      out("LOST_SHARE", r.lost.toFixed(2));
      if (r.lost > 0.2) console.log("warning: the face was lost in more than a fifth of the frames. Check the face guide position and width, or the person may turn away often");
      return;
    }
    if (cmd === "variant") {
      if (!opt.name || !opt.set) fail('variant needs --name B and --set path=value (for example moments.1.text="New title")');
      const copy = JSON.parse(JSON.stringify(src));
      const changes = [];
      for (const part of [].concat(opt.set)) {
        const [pathStr, ...rest] = String(part).split("=");
        const raw = rest.join("=");
        let val; try { val = JSON.parse(raw); } catch { val = raw; }
        const keys = pathStr.split(".");
        let o = copy;
        keys.slice(0, -1).forEach((k) => { if (o[k] === undefined) fail(`nothing at ${pathStr}`); o = o[k]; });
        o[keys[keys.length - 1]] = val;
        changes.push(pathStr);
      }
      const file = planFile.replace(/\.json$/, `.${opt.name}.json`);
      writeJson(file, copy);
      const log = path.join(jobFolder(planFile), "variations.csv");
      if (!fs.existsSync(log)) fs.writeFileSync(log, "version,file,changed,hypothesis\n");
      fs.appendFileSync(log, `${opt.name},${path.basename(file)},"${changes.join(" ")}","${String(opt.note || "").replace(/"/g, "'")}"\n`);
      out("RESULT", "variant");
      out("FILE", file);
      return;
    }
    if (!opt.words || !fs.existsSync(opt.words)) fail(`${cmd} needs --words <words.json> (the words of the edited video)`);
    const style = await loadStyle(styleId);
    if (cmd === "preview") {
      const url = await startPreview(planFile, opt.words, styleId, Number(opt.port) || 3123);
      out("RESULT", "preview_ready");
      out("PREVIEW_URL", url);
      return;
    }
    if (cmd === "validate") {
      const r = buildPlan(planFile, opt.words, style);
      out("RESULT", r.warnings.length ? "valid_with_warnings" : "valid");
      const typ = r.plan.moments.filter((m) => m.type === "words");
      out("GRAPHICS", r.plan.moments.length - typ.length);
      out("DRAWINGS", r.plan.moments.filter((m) => m.type === "visual").length);
      out("TYPOGRAPHY_PHRASES", typ.length);
      out("TYPOGRAPHY_LAYOUTS", [...new Set(typ.map((m) => m.variant))].join(","));
      out("DURATION", r.duration.toFixed(1));
      return;
    }
    const plan = buildPlan(planFile, opt.words, style).plan;
    const work = jobFolder(planFile);
    if (cmd === "stills") {
      const gfx = plan.moments.filter((m) => m.type !== "words"), typ = plan.moments.filter((m) => m.type === "words");
      const pickTyp = typ.filter((_, i) => i % Math.max(1, Math.ceil(typ.length / 6)) === 0).map((m) => m.from + (m.to - m.from) / 2);
      const times = opt.at ? String(opt.at).split(",").map(Number) : [...gfx.map((m) => (m.type === "visual" ? Math.min(m.to - 0.1, Math.max(m.at, m.from + 0.5) + 1.3) : m.from + 0.9)), ...pickTyp].sort((a, b) => a - b).map((x) => +x.toFixed(2));
      return stills(planFile, opt.words, styleId, times, path.resolve(String(opt.out || path.join(work, "stills.png"))));
    }
    if (cmd === "sample") {
      const range = opt.range ? String(opt.range).split(",").map(Number) : pickSample(plan);
      const file = path.join(work, `sample ${range[0]} to ${range[1]}.mp4`);
      await renderVideo(planFile, opt.words, styleId, file, range);
      out("SAMPLE_FROM", range[0]);
      out("SAMPLE_TO", range[1]);
      return;
    }
    // render
    if (opt.range) {
      // Fix by section: only this part is remade, with a second either side to judge the joins.
      const [a, b] = String(opt.range).split(",").map(Number);
      const range = [Math.max(0, a - 1), Math.min(plan.duration, b + 1)];
      const file = path.join(work, `fix ${range[0]} to ${range[1]}.mp4`);
      await renderVideo(planFile, opt.words, styleId, file, range);
      out("FIX_FROM", range[0]);
      out("FIX_TO", range[1]);
      return;
    }
    const finalMode = !!opt.final;
    let file, version = "";
    if (finalMode) {
      version = saveVersion(planFile, opt.note || "");
      // every exported version goes into this project's own folder in Finished videos, named like the work folder
      const root = readConfig().videosFolder || path.dirname(path.dirname(work));
      const dir = path.join(root, "Finished videos", finishedProjectName(path.basename(work)));
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${safeName(jobName(planFile))} ${version}.mp4`);
    } else file = path.resolve(String(opt.out || path.join(work, "draft.mp4")));
    await renderVideo(planFile, opt.words, styleId, file);
    // Every full render is checked as a file, and a final one is listened to as well.
    const words = readJson(opt.words);
    const res = await videoCheck(file, { expectedDuration: plan.duration, expectedWords: words, transcript: finalMode });
    res.notes.forEach((n) => console.log(`note: ${n}`));
    res.warnings.forEach((w) => console.log(`warning: ${w}`));
    if (version) out("VERSION", version);
    out("CHECK", res.warnings.length ? `${res.warnings.length}_warnings` : "clean");
    return;
  }
  if (cmd === "check") {
    if (!video || !fs.existsSync(video)) fail("video file not found");
    const words = opt.words && fs.existsSync(opt.words) ? readJson(opt.words) : null;
    const res = await videoCheck(video, { expectedWords: words, transcript: !!opt.transcript });
    res.notes.forEach((n) => console.log(`note: ${n}`));
    res.warnings.forEach((w) => console.log(`warning: ${w}`));
    out("RESULT", res.warnings.length ? "warnings" : "clean");
    out("WARNINGS", res.warnings.length);
    return;
  }
  fail("unknown command. Use: start, probe, analyze, cuts, cut, face, track, drawings, validate, stills, sample, render, preview, check, variant, prefs");
}
main().catch((e) => fail(String(e && e.message ? e.message : e).split("\n")[0]));
