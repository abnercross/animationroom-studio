// "My styles": styles a member makes with Claude (the Style Maker skill). They live in the studio's own data folder,
// next to the library cache, and never leave the member's computer:
//
//   <data>/my-styles/catalog.json            the member's own style list (read by animate.mjs next to the library)
//   <data>/my-styles/styles/<id>/            style.json + guide.md (+ the reference sheets of the style it started from)
//   <data>/my-styles/wishlist.json           looks the engine cannot make yet, for the member to send to support
//   <data>/my-styles/removed/                styles that were removed or reset (nothing is ever deleted for good)
//
// Commands (through animate.mjs):
//   mystyle new --name "<Name>" [--from <style id> | --blank] [--summary "<text>"]
//   mystyle check <id>        validates style.json and the guide, refreshes the style's catalog entry
//   mystyle sample <id> [--format 16:9] [--out <folder>]    writes a short sample script to test the look on
//   mystyle sheet <id> [--format 16:9] [--out <folder>]     the sample script as stills (needs the render engine)
//   mystyle list | remove <id> | reset <id>
//   mystyle wish --text "<what is missing>" [--style <id>]   and   mystyle wishes
import fs from "node:fs";
import path from "node:path";

// Fonts that ship inside the render engine (runtime/src/fonts.ts). Anything else would silently fall back.
export const FONTS = ["Inter", "JetBrains Mono", "Poppins", "STIX Two Text", "Big Shoulders", "Caveat", "Caveat Brush", "Bebas Neue", "Assistant"];
const SCORE_KINDS = ["pad", "pizzicato", "rhodes", "vibes", "quirky"];
const FORMATS = ["9:16", "16:9"];
// Top level token names the engine reads (runtime/src/lib.ts StyleTokens). Others are ignored, which is almost always a typo.
const TOKEN_KEYS = ["bg", "gridMinor", "gridMajor", "gridMinorStep", "gridMajorStep", "ink", "mid", "soft", "fill", "dark", "lineWidths", "dashes", "fonts", "monoTracking", "corners", "header", "margins", "motion", "palette", "background", "chrome", "stroke", "type", "scenes", "fade", "paper", "sheet", "jitter", "tail", "rig", "panel", "hatch", "tints", "boil", "camera", "cameraDrift", "finish", "page", "poster", "vox", "bean", "accentTints"];
export const SUPPORT = "support@animationroom.app";

export const mineDir = (data) => path.join(data, "my-styles");
const catalogPath = (data) => path.join(mineDir(data), "catalog.json");
const styleDir = (data, id) => path.join(mineDir(data), "styles", id);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };

export function readMine(data) {
  try { return readJson(catalogPath(data)); } catch { return { catalogVersion: 2, note: "Styles made with the Style Maker. They stay on this computer.", styles: [] }; }
}
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);

// ---------- colours ----------
const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
function lum(c) {
  let r, g, b;
  if (typeof c === "number") r = g = b = Math.max(0, Math.min(1, c)) * 255;
  else if (typeof c === "string" && HEX.test(c)) [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  else return null;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const la = lum(a), lb = lum(b); if (la === null || lb === null) return null; const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };

// ---------- the sample family a style belongs to ----------
// Follows basedOn through the member's own styles until it reaches a library style ("blank" for a style made from nothing).
function familyOf(data, id) {
  const mine = readMine(data).styles;
  let cur = mine.find((s) => s.id === id), guard = 0;
  while (cur && guard++ < 10) {
    const b = cur.basedOn && cur.basedOn.id;
    if (!b || b === "blank-canvas") return "blank";
    const next = mine.find((s) => s.id === b);
    if (!next) return b;
    cur = next;
  }
  return null;
}

// ---------- catalog entry ----------
function refreshEntry(data, id) {
  const dir = styleDir(data, id), st = readJson(path.join(dir, "style.json"));
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith(".")).sort((a, b) => (a === "style.json" ? -1 : b === "style.json" ? 1 : a === "guide.md" ? -1 : b === "guide.md" ? 1 : a.localeCompare(b)));
  const cat = readMine(data), prev = cat.styles.find((s) => s.id === id) || {};
  const entry = { id: st.id, name: st.name, version: st.version, minEngine: st.minEngine, modes: ["animate"], formats: st.formats || ["9:16"], summary: st.summary || "", files, mine: true, basedOn: st.basedOn || prev.basedOn || null, created: prev.created || new Date().toISOString() };
  cat.styles = cat.styles.filter((s) => s.id !== id).concat(entry).sort((a, b) => a.created.localeCompare(b.created));
  writeJson(catalogPath(data), cat);
  return entry;
}

function copyFiles(from, to, files) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(from, f), path.join(to, f));
}
function moveAside(data, id, why) {
  const dir = styleDir(data, id);
  if (!fs.existsSync(dir)) return "";
  const dest = path.join(mineDir(data), "removed", `${id} ${why} ${stamp()}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(dir, dest);
  return dest;
}

// ---------- the checker ----------
export function checkStyle(ctx, id) {
  const { data, engine, semverGte } = ctx;
  const problems = [], warnings = [];
  const dir = styleDir(data, id);
  let st;
  try { st = readJson(path.join(dir, "style.json")); } catch (e) { return { problems: [`style.json could not be read (${String(e.message).slice(0, 120)}). It must be valid JSON: check commas and quotes.`], warnings, st: null }; }
  const t = st.tokens || {};
  if (st.id !== id) problems.push(`style.json says id "${st.id}" but the folder is "${id}". Keep them the same.`);
  if (!st.name || typeof st.name !== "string") problems.push("the style needs a name.");
  if (!/^\d+\.\d+\.\d+$/.test(st.version || "")) problems.push(`version must look like 1.0.0, not "${st.version}".`);
  if (!st.minEngine || !semverGte(engine, st.minEngine)) problems.push(`minEngine "${st.minEngine}" is newer than this studio (${engine}). Leave it at the value the style started with.`);
  if (!Array.isArray(st.formats) || !st.formats.length || st.formats.some((f) => !FORMATS.includes(f))) problems.push(`formats must be a list of ${FORMATS.join(" and ")}.`);
  if (!st.tokens || typeof st.tokens !== "object") { problems.push("style.json has no tokens."); return { problems, warnings, st }; }

  // every colour written as text must be a real hex colour; grey numbers must sit between 0 and 1
  const walk = (v, where) => {
    if (typeof v === "string" && v.startsWith("#") && !HEX.test(v)) problems.push(`${where} is "${v}", which is not a colour. Write it like #e4572e.`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  walk(st.tokens, "tokens"); walk(st.variants || {}, "variants"); walk(st.wide || {}, "wide");
  for (const k of ["bg", "gridMinor", "gridMajor", "ink", "mid", "soft", "fill", "dark"]) {
    const v = t[k];
    if (v === undefined) problems.push(`tokens.${k} is missing.`);
    else if (typeof v === "number" && (v < 0 || v > 1)) problems.push(`tokens.${k} is a grey number and must be between 0 and 1.`);
    else if (typeof v !== "number" && !HEX.test(String(v))) problems.push(`tokens.${k} must be a hex colour like #1f2433.`);
  }
  for (const k of Object.keys(t)) if (!TOKEN_KEYS.includes(k)) warnings.push(`tokens.${k} is not something the engine reads, so it does nothing. Check the spelling.`);

  // fonts
  for (const [slot, f] of Object.entries(t.fonts || {})) if (!FONTS.includes(f)) problems.push(`tokens.fonts.${slot} is "${f}", which the engine does not have. Choose one of: ${FONTS.join(", ")}.`);
  for (const [vn, v] of Object.entries(st.variants || {})) for (const [slot, f] of Object.entries(v.fonts || {})) if (!FONTS.includes(f)) problems.push(`variants.${vn}.fonts.${slot} is "${f}". Choose one of: ${FONTS.join(", ")}.`);

  // sizes and speeds that would make a broken video
  const num = (where, v, lo, hi) => { if (v !== undefined && (typeof v !== "number" || v < lo || v > hi)) problems.push(`${where} must be a number from ${lo} to ${hi}.`); };
  num("tokens.lineWidths.primary", t.lineWidths && t.lineWidths.primary, 0.5, 40);
  num("tokens.lineWidths.secondary", t.lineWidths && t.lineWidths.secondary, 0.5, 40);
  num("tokens.lineWidths.construction", t.lineWidths && t.lineWidths.construction, 0.3, 40);
  num("tokens.motion.drawDefault", t.motion && t.motion.drawDefault, 0.2, 5);
  num("tokens.motion.fps", t.motion && t.motion.fps, 12, 60);
  num("tokens.motion.stepFps", t.motion && t.motion.stepFps, 3, 30);
  num("tokens.motion.cameraPush", t.motion && t.motion.cameraPush, 0, 0.3);
  num("tokens.margins", t.margins, 0, 300);
  num("tokens.gridMinorStep", t.gridMinorStep, 10, 400);
  if (t.motion && t.motion.fps !== undefined && ![24, 25, 30, 48, 50, 60].includes(t.motion.fps)) warnings.push("tokens.motion.fps is unusual. 30 is the normal choice and 60 makes renders twice as slow.");

  // sound
  const s = st.sound || {}, sc = s.score || {};
  if (sc.kind !== undefined && !SCORE_KINDS.includes(sc.kind)) problems.push(`sound.score.kind "${sc.kind}" is not one of ${SCORE_KINDS.join(", ")}.`);
  num("sound.score.bpm", sc.bpm, 40, 200);
  num("sound.score.level", sc.level, -40, -3);
  num("sound.duck", s.duck, 0, 1);
  if (sc.chords !== undefined && (!Array.isArray(sc.chords) || sc.chords.some((c) => !Array.isArray(c) || c.some((n) => typeof n !== "number" || n < 24 || n > 96)))) problems.push("sound.score.chords must be a list of chords, each a list of note numbers from 24 to 96.");

  // can it be read? Only meaningful where the drawing sits straight on the ground colour (not on tinted scenes, sheets or tables).
  const bg = t.bg, ink = t.ink;
  const plainGround = !t.tints && !t.sheet && !(t.background && ["tint", "poster", "table"].includes(t.background.type));
  if (plainGround) {
    const ci = contrast(ink, bg);
    if (ci !== null && ci < 3) problems.push(`the ink colour barely shows on the background (contrast ${ci.toFixed(1)} to 1, it should be at least 3). Make the ink darker on a light ground, or lighter on a dark one.`);
    else if (ci !== null && ci < 4.5) warnings.push(`the ink is a little weak on the background (contrast ${ci.toFixed(1)} to 1). 4.5 or more reads best on a phone.`);
    // named colours are drawn as lines in these looks; in the others they are fills with an outline, so pale is fine
    if (["blank", "blueprint", "chalkboard", "sketchbook-ink"].includes(ctx.family || "")) {
      for (const [n, c] of Object.entries(t.palette || {})) {
        const cc = contrast(c, bg);
        if (cc !== null && cc < 1.6) warnings.push(`the colour "${n}" is almost the same as the background (contrast ${cc.toFixed(1)} to 1), so it will be hard to see.`);
      }
    }
  }

  // the guide
  let guide = "";
  try { guide = fs.readFileSync(path.join(dir, "guide.md"), "utf8"); } catch { problems.push("guide.md is missing. Claude reads it before every storyboard."); }
  if (guide && guide.length < 400) warnings.push("guide.md is very short. A good guide describes the look, the layout limits, the colour names and the content rules.");
  // the guide names colours in backticks; flag a name that no longer exists
  const names = new Set(["ink", "mid", "soft", "fill", "dark", "bg", "hatch", ...Object.keys(t.palette || {}), ...Object.keys(t.tints || {})]);
  const based = st.basedOn && st.basedOn.palette ? st.basedOn.palette : [];
  const gone = based.filter((n) => !names.has(n) && new RegExp("`" + n + "`").test(guide));
  if (gone.length) warnings.push(`the guide still mentions the colour name${gone.length > 1 ? "s" : ""} ${gone.map((n) => `\`${n}\``).join(", ")}, which the style no longer has. Change the guide or put the name back.`);
  if (/[–—]/.test(st.summary || "") || /[–—]/.test(st.name || "")) warnings.push("the name and summary should not contain dashes.");
  return { problems, warnings, st };
}

// ---------- commands ----------
export async function mystyleCommand(ctx, sub, pos, opt) {
  const { data, out, fail } = ctx;
  const id = pos[2] ? String(pos[2]) : "";
  const need = () => { if (!id) fail(`give the style id, for example: mystyle ${sub} my-style`); if (!fs.existsSync(styleDir(data, id))) fail(`there is no style of yours called "${id}". Run: mystyle list`); };

  if (sub === "list") {
    const mine = readMine(data).styles;
    mine.forEach((s) => console.log(`${s.id}  ${s.name}  v${s.version}  (${s.basedOn ? "started from " + s.basedOn.name : "from scratch"})`));
    out("RESULT", "listed");
    out("COUNT", mine.length);
    out("FOLDER", mineDir(data));
    return;
  }

  if (sub === "new") {
    const name = opt.name && opt.name !== true ? String(opt.name).trim() : "";
    if (!name) fail("give the style a name with --name \"<Name>\".");
    const lib = await ctx.libraryCatalog();
    let nid = opt.id && opt.id !== true ? slug(opt.id) : slug(name);
    if (!nid) fail("the name needs letters or numbers in it.");
    if (lib.styles.some((s) => s.id === nid) || nid === "blank-canvas") nid += "-mine";
    if (fs.existsSync(styleDir(data, nid))) fail(`you already have a style called "${nid}". Pick another name, or remove the old one first (mystyle remove ${nid}).`);
    let from, srcDir, files, base;
    if (opt.from && opt.from !== true) {
      from = String(opt.from);
      const got = await ctx.getStyle(from);
      srcDir = got.dir; files = got.entry.files;
      base = { id: got.entry.id, name: got.entry.name, version: got.entry.version, palette: Object.keys((got.style.tokens || {}).palette || {}) };
    } else {
      srcDir = path.join(ctx.pluginRoot, "starters", "blank"); files = ["style.json", "guide.md"];
      const b = readJson(path.join(srcDir, "style.json"));
      base = { id: "blank-canvas", name: b.name, version: b.version, palette: Object.keys((b.tokens || {}).palette || {}) };
    }
    const dest = styleDir(data, nid);
    copyFiles(srcDir, dest, files);
    const st = readJson(path.join(dest, "style.json"));
    st.id = nid; st.name = name; st.version = "1.0.0";
    st.summary = opt.summary && opt.summary !== true ? String(opt.summary) : from ? `Your own version of ${base.name}.` : "Your own look, made from scratch.";
    st.basedOn = base;
    writeJson(path.join(dest, "style.json"), st);
    const gp = path.join(dest, "guide.md");
    let guide = fs.readFileSync(gp, "utf8");
    guide = /^# /.test(guide) ? guide.replace(/^# .*/, `# ${name}: storyboard guide`) : guide;
    fs.writeFileSync(gp, guide);
    const entry = refreshEntry(data, nid);
    out("RESULT", "created");
    out("MYSTYLE", nid);
    out("NAME", name);
    out("STARTED_FROM", from ? base.name : "blank canvas");
    out("FOLDER", dest);
    out("STYLE_JSON", path.join(dest, "style.json"));
    out("GUIDE", gp);
    out("FILES", entry.files.join(","));
    out("SAMPLE_FAMILY", familyOf(data, nid) || "none");
    return;
  }

  if (sub === "check") {
    need();
    const r = checkStyle({ ...ctx, family: familyOf(data, id) }, id);
    r.warnings.forEach((w) => console.log(`warning: ${w}`));
    if (r.problems.length) {
      console.log(r.problems.map((p) => `problem: ${p}`).join("\n"));
      fail(`the style has ${r.problems.length} problem(s), listed above. Fix them in style.json or guide.md and check again.`);
    }
    const entry = refreshEntry(data, id);
    out("RESULT", "valid");
    out("WARNINGS", r.warnings.length);
    out("STYLE", `${entry.id} ${entry.version}`);
    out("FORMATS", entry.formats.join(","));
    return;
  }

  if (sub === "sample" || sub === "sheet") {
    need();
    const fam = familyOf(data, id);
    const index = readJson(path.join(ctx.pluginRoot, "samples", "index.json"));
    const e = fam && index[fam];
    if (!e) fail(`there is no sample script for the look this style started from (${fam || "unknown"}). Test it with a real voiceover instead.`);
    const format = opt.format && opt.format !== true ? String(opt.format) : "9:16";
    if (!FORMATS.includes(format)) fail("format must be 9:16 or 16:9.");
    if (!e[format]) fail(`the sample for this look only comes in ${Object.keys(e).filter((k) => FORMATS.includes(k)).join(" and ")}.`);
    const dir = path.resolve(String(opt.out && opt.out !== true ? opt.out : path.join(mineDir(data), "preview", id)));
    fs.mkdirSync(dir, { recursive: true });
    const sb = readJson(path.join(ctx.pluginRoot, "samples", e[format]));
    sb.style = id;
    const sbPath = path.join(dir, "sample.json"), wordsPath = path.join(dir, "sample-words.json");
    writeJson(sbPath, sb);
    fs.copyFileSync(path.join(ctx.pluginRoot, "samples", e.words), wordsPath);
    if (sub === "sample") {
      out("RESULT", "sample");
      out("STORYBOARD", sbPath);
      out("WORDS", wordsPath);
      out("FAMILY", fam);
      return;
    }
    return ctx.sheet(id, sbPath, wordsPath, path.join(dir, `sheet-${format.replace(":", "x")}.png`));
  }

  if (sub === "remove") {
    need();
    const to = moveAside(data, id, "removed");
    const cat = readMine(data);
    cat.styles = cat.styles.filter((s) => s.id !== id);
    writeJson(catalogPath(data), cat);
    out("RESULT", "removed");
    out("KEPT_IN", to);
    return;
  }

  if (sub === "reset") {
    need();
    const entry = readMine(data).styles.find((s) => s.id === id);
    const b = entry && entry.basedOn;
    if (!b) fail("this style has no starting point to go back to.");
    let srcDir, files;
    if (b.id === "blank-canvas") { srcDir = path.join(ctx.pluginRoot, "starters", "blank"); files = ["style.json", "guide.md"]; }
    else { const got = await ctx.getStyle(b.id); srcDir = got.dir; files = got.entry.files; }
    const name = entry.name, summary = entry.summary;
    const old = moveAside(data, id, "before reset");
    const dest = styleDir(data, id);
    copyFiles(srcDir, dest, files);
    const st = readJson(path.join(dest, "style.json"));
    Object.assign(st, { id, name, version: "1.0.0", summary, basedOn: b });
    writeJson(path.join(dest, "style.json"), st);
    const gp = path.join(dest, "guide.md");
    const g = fs.readFileSync(gp, "utf8");
    fs.writeFileSync(gp, /^# /.test(g) ? g.replace(/^# .*/, `# ${name}: storyboard guide`) : g);
    refreshEntry(data, id);
    out("RESULT", "reset");
    out("KEPT_IN", old);
    return;
  }

  if (sub === "wish") {
    const text = opt.text && opt.text !== true ? String(opt.text).trim() : "";
    if (!text) fail("say what is missing with --text \"<the wish>\".");
    const p = path.join(mineDir(data), "wishlist.json");
    let list = [];
    try { list = readJson(p); } catch {}
    list.push({ at: new Date().toISOString().slice(0, 10), style: opt.style && opt.style !== true ? String(opt.style) : "", text });
    writeJson(p, list);
    out("RESULT", "saved");
    out("COUNT", list.length);
    return;
  }

  if (sub === "wishes") {
    let list = [];
    try { list = readJson(path.join(mineDir(data), "wishlist.json")); } catch {}
    list.forEach((w, i) => console.log(`${i + 1}. ${w.text}${w.style ? ` (style: ${w.style})` : ""} [${w.at}]`));
    out("RESULT", "listed");
    out("COUNT", list.length);
    out("SUPPORT", SUPPORT);
    return;
  }

  fail("unknown mystyle command. Use: new, check, sample, sheet, list, remove, reset, wish, wishes");
}
