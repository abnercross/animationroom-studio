#!/usr/bin/env node
// Animation Room Studio: Edit mode. Talking head video in, finished edit out: the cuts are made here, then
// Claude writes the scenes for this one video in Remotion with the style's real pieces (see edit-scenes.mjs).
// Every command takes --data <folder> (or reads CLAUDE_PLUGIN_DATA). The last lines printed are KEY=value.
//
//   edit.mjs start [video]                      pick the video, make its work folder
//   edit.mjs analyze <video> [--work <folder>]  silences, black frames, words, measurements: analysis.json
//   edit.mjs cuts <analysis.json> [--out cuts.json] [--pause 0.3]
//   edit.mjs cut <video> <cuts.json> --analysis <analysis.json> [--out edited.mp4]
//   edit.mjs face <video> [--at 3] [--out face.png]     a still with a grid, to read where the face is
//   edit.mjs check <video> [--words <words.json>] [--transcript]   check a finished file
//   edit.mjs probe <video>
//   edit.mjs prepare                                          first use: Remotion's official skills, ready engine
//   edit.mjs cutout <edited.mp4>                              the person with a transparent background: person.webm
//   edit.mjs project <work folder> --mode above|around|frame --style <id> --face x,y,w
//   edit.mjs scenecheck <work folder>                         compiles, then checks text against face and safe areas
//   edit.mjs scenestills <work folder> [--at 3,9,20]          frames on one sheet to look at
//   edit.mjs scenesample <work folder> [--range 4,14]         a sample with sound
//   edit.mjs sceneopen <work folder> | --stop                 open on the Remotion timeline
//   edit.mjs scenerender <work folder> [--final] [--name N]   the full video with its sound mix
//   edit.mjs scenegrade <work folder> --tint "#hex" [--strength 1] [--saturate 0.88] [--at 12]   without and with, side by side
//   edit.mjs scenegrade <work folder> --tint "#hex" --apply | --none   use that colour grade, or none

import fs from "node:fs";
import path from "node:path";
import { fail, opt, out, pos, probe, readJson, start, writeJson } from "./edit-core.mjs";
import { analyze } from "./edit-analyze.mjs";
import { applyCuts, proposeCuts } from "./edit-cuts.mjs";
import { transcriptWarnings, videoCheck } from "./edit-check.mjs";
import { faceGuide } from "./edit-track.mjs";
import { SCENE_COMMANDS, sceneCommand } from "./edit-scenes.mjs";

async function main() {
  const cmd = pos[0];
  if (SCENE_COMMANDS.includes(cmd)) return sceneCommand(cmd);
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
    const warns = transcriptWarnings(res.words, heard.words).warnings;
    const long = heard.silences.filter((s) => s.to - s.from >= 0.7);
    long.forEach((s) => warns.push(`silence of ${(s.to - s.from).toFixed(1)} s at ${s.from.toFixed(1)} s`));
    (heard.black || []).forEach((b) => warns.push(`black picture from ${b.from.toFixed(2)} to ${b.to.toFixed(2)} s`));
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
  fail("unknown command. Use: start, analyze, cuts, cut, face, prepare, cutout, project, scenecheck, scenestills, scenesample, sceneopen, scenerender, scenegrade, check, probe");
}
main().catch((e) => fail(String(e && e.message ? e.message : e).split("\n")[0]));
