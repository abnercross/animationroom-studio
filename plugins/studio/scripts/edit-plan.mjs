// Edit mode: the plan file. Loads a style, resolves word references to times, checks the plan.
import fs from "node:fs";
import path from "node:path";
import { DATA, PLUGIN_ROOT, fail, probe, readConfig, readJson } from "./edit-core.mjs";
import { planCheck } from "./edit-check.mjs";
import { layoutChecks, resolveTokens } from "./edit-layout.mjs";
import { fillTypography } from "./edit-typo.mjs";
import { DRAWINGS } from "./edit-draw.mjs";

// What this member has approved before (caption size, frame position...), kept apart from any one video and
// kept separately for each shape of video.
export const PREFS_FILE = path.join(DATA, "edit-preferences.json");
export const readPrefsFile = () => { try { return readJson(PREFS_FILE); } catch { return { formats: {} }; } };
export const readPrefs = (format = "9:16") => ({ tokens: readPrefsFile().formats?.[format]?.tokens || {} });

const API = process.env.AR_API || "https://animationroom.app/api";
export async function loadStyle(id) {
  const cfg = readConfig();
  const local = cfg.stylesDir || process.env.AR_STYLES_DIR;
  if (local) {
    const f = path.join(local, "styles", id, "style.json");
    if (!fs.existsSync(f)) fail(`the style "${id}" is not in the local style folder`);
    return readJson(f);
  }
  const lic = cfg.license || {};
  const engine = readJson(path.join(PLUGIN_ROOT, "edit-runtime", "package.json")).studioEditEngine;
  const headers = { "x-license-key": lic.key || "", authorization: lic.token ? `Bearer ${lic.token}` : "", "x-studio-edit-engine": engine };
  try {
    const cat = await (await fetch(`${API}/catalog`, { headers })).json();
    const e = cat.styles.find((x) => x.id === id && (x.modes || []).includes("edit"));
    if (!e) fail(`the style "${id}" is not an Edit style in your library`);
    const r = await fetch(`${API}/styles/${id}/${e.version}/style.json`, { headers });
    if (r.status === 426) fail("this style needs a newer studio. Update the studio plugin, restart Claude, then try again.");
    if (r.status === 401 || r.status === 403) fail("your license key was not accepted. Run the studio setup again to re-enter it, or email support@animationroom.app.");
    if (!r.ok) fail("could not fetch the style (check the license and the internet connection)");
    return await r.json();
  } catch (err) {
    fail(`could not reach the Animation Room style library (${err.message})`);
  }
}

// ---------- plan: resolve word references, check it ----------
const normWord = (w) => w.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
export function resolver(words, errors) {
  return (v, where) => {
    if (typeof v === "number") return v;
    const m = /^@([^#+]+)(?:#(\d+))?([+-]\d*\.?\d+)?$/.exec(String(v));
    if (!m) { errors.push(`${where}: "${v}" is not a time. Use seconds or a word like "@reasons", "@back#2", "@know+0.3"`); return 0; }
    const hits = words.filter((w) => normWord(w[2]) === normWord(m[1]));
    const hit = hits[(m[2] ? +m[2] : 1) - 1];
    if (!hit) { errors.push(`${where}: the word "${m[1]}"${m[2] ? ` (number ${m[2]})` : ""} is not in the edited speech`); return 0; }
    return +(hit[0] + (m[3] ? +m[3] : 0)).toFixed(2);
  };
}
const TEXT_FIELDS = ["text", "kicker", "heading", "label", "tag", "action", "name", "role", "prefix", "suffix", "mark"];
export function buildPlan(planFile, wordsFile, style) {
  const src = readJson(planFile);
  const words = readJson(wordsFile);
  const errors = [], warnings = [];
  const format = src.format ?? "9:16";
  if (!["9:16", "16:9"].includes(format)) errors.push(`"format" must be "9:16" (vertical) or "16:9" (horizontal), not "${format}"`);
  if (src.drawings !== undefined && !["none", "few", "lots"].includes(src.drawings)) errors.push(`"drawings" must be "none", "few" or "lots", not "${src.drawings}"`);
  const T = resolver(words, errors);
  const videoFile = src.video && path.resolve(path.dirname(planFile), src.video);
  if (!videoFile || !fs.existsSync(videoFile)) errors.push(`"video" must point to the edited video file (made by edit.mjs cut)`);
  const meta = errors.length ? null : probe(videoFile);
  const duration = meta ? meta.duration : 0; // the edited video decides the length
  if (meta && words.length && Math.abs(meta.duration - words[words.length - 1][1]) > 3) warnings.push(`the video is ${meta.duration.toFixed(1)} s but the speech ends at ${words[words.length - 1][1].toFixed(1)} s. Is "video" the edited video and --words the edited words?`);
  if (!src.face || typeof src.face.x !== "number" || typeof src.face.y !== "number") errors.push(`"face" needs x and y: the centre of the face as a fraction of the frame (0 to 1, from the top left)`);
  const moments = (src.moments || []).map((m, i) => {
    const where = `moments[${i}] (${m.type})`;
    const o = { ...m, from: T(m.from, `${where}.from`), to: T(m.to, `${where}.to`) };
    if (!["title", "list", "number", "key", "cta", "visual"].includes(m.type)) errors.push(`${where}: type must be title, list, number, key, cta or visual`);
    if (m.type === "visual") {
      if (!DRAWINGS[m.draw]) errors.push(`${where}: "draw" must be a drawing from the library: ${Object.keys(DRAWINGS).join(", ")}`);
      if ((m.layout ?? "window") !== "window") errors.push(`${where}: a drawing always sits on the page beside the person's frame. Remove "layout"`);
      o.at = m.at === undefined ? o.from : T(m.at, `${where}.at`);
    }
    if (o.to - o.from < 1.2) errors.push(`${where}: lasts ${(o.to - o.from).toFixed(1)} s. Give it at least 1.2 s`);
    if ((m.type === "title" || m.type === "key" || m.type === "cta") && !m.text) errors.push(`${where}: needs "text"`);
    if (m.type === "number" && typeof m.value !== "number") errors.push(`${where}: needs a number "value"`);
    if (m.type === "list") {
      if (!(m.items || []).length) errors.push(`${where}: needs "items"`);
      if ((m.items || []).length > 4) errors.push(`${where}: four items at most`);
      o.items = (m.items || []).map((it, j) => ({ text: it.text, at: T(it.at, `${where}.items[${j}].at`) }));
      for (const it of o.items) if (/[-‐-―]/.test(it.text)) errors.push(`${where}: no hyphens or dashes in on screen text ("${it.text}")`);
    }
    for (const f of TEXT_FIELDS) if (typeof m[f] === "string" && /[-‐-―]/.test(m[f])) errors.push(`${where}: no hyphens or dashes in on screen text ("${m[f]}")`);
    if (m.captions !== undefined) warnings.push(`${where}: "captions" is no longer used. The system now fills every stretch with no graphic with the spoken words as large type`);
    if (m.type === "words") errors.push(`${where}: the plan does not write "words" moments. The system fills the gaps between graphics with the spoken words itself`);
    if ((m.type === "key" || m.type === "visual") && m.mark && !String(m.text).toLowerCase().includes(String(m.mark).toLowerCase())) errors.push(`${where}: "mark" must be words from "text"`);
    if (m.text && m.text.length > 70) errors.push(`${where}: "text" is ${m.text.length} characters. Keep it under 70`);
    return o;
  }).sort((a, b) => a.from - b.from);
  moments.forEach((m, i) => { if (i && m.from < moments[i - 1].to - 0.01) errors.push(`moments overlap at ${m.from}s`); if (m.to > duration + 0.05) warnings.push(`a ${m.type} ends at ${m.to}s, after the video`); });
  const tokens = resolveTokens(format, style.tokens, readPrefs(format).tokens, src.tokens);
  let all = moments;
  if (meta && src.face && typeof src.face.x === "number" && !errors.length) {
    // Every stretch with no graphic gets the spoken words as dynamic typography, so there is always text on screen.
    const facePlan = { video: { width: meta.width, height: meta.height }, face: src.face };
    all = fillTypography({ moments, words, duration, tokens, format, plan: facePlan, strip: src.typography?.strip !== false });
    const pc = planCheck({ moments: all, words, duration, drawings: src.drawings });
    errors.push(...pc.errors);
    warnings.push(...pc.warnings);
    const lc = layoutChecks({ plan: facePlan, tokens, format, moments: all });
    errors.push(...lc.errors);
    warnings.push(...lc.warnings);
  } else if (meta) {
    const pc = planCheck({ moments, words, duration, drawings: src.drawings });
    errors.push(...pc.errors);
    warnings.push(...pc.warnings);
  }
  warnings.forEach((w) => console.log(`warning: ${w}`));
  if (errors.length) { console.log(errors.map((e) => `problem: ${e}`).join("\n")); fail(`the plan has ${errors.length} problem(s), listed above`); }
  const plan = { format, duration, video: { src: "", width: meta.width, height: meta.height }, face: src.face, words, moments: all };
  return { plan, tokens, videoFile, duration, warnings };
}

