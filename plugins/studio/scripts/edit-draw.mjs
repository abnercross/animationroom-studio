// Edit mode: the drawing library (edit-runtime/src/drawings.json, the same file the engine draws from) and a
// helper that points out which spoken words match a drawing. It only suggests: Claude decides what is drawn.
import path from "node:path";
import { PLUGIN_ROOT, readJson } from "./edit-core.mjs";

export const DRAWINGS = readJson(path.join(PLUGIN_ROOT, "edit-runtime", "src", "drawings.json")).drawings;
const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
export const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
export const keysOf = (id) => new Set((DRAWINGS[id]?.keywords || []).map(stem));
// Does any of these words (as spoken or written) belong to the drawing's keyword list?
export const matches = (id, list) => { const k = keysOf(id); return list.map((w) => stem(norm(w))).some((w) => k.has(w)); };

// For each drawing, the spoken words on its list, as word references ready to paste into "at".
export function suggest(words) {
  const seen = {};
  const refs = words.map((w) => { const n = norm(w[2]); seen[n] = (seen[n] || 0) + 1; return { n, t: w[0], ref: `@${n}${seen[n] > 1 ? "#" + seen[n] : ""}` }; });
  const out = [];
  for (const id of Object.keys(DRAWINGS)) {
    const k = keysOf(id);
    const hits = refs.filter((r) => r.n && k.has(stem(r.n)));
    if (hits.length) out.push({ id, hits });
  }
  return out;
}
