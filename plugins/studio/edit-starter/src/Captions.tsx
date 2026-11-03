import { useContext } from "react";
import { useCurrentFrame } from "remotion";
import { CheckContext, frameBox } from "./kit";
import { FPS, MODE, WORDS } from "./data";

// The spoken words a few at a time, each one lighting up as it is said. Change the look freely to fit the style.
const PAGES = (() => {
  const pages: { start: number; end: number; words: typeof WORDS }[] = [];
  let cur: typeof WORDS = [];
  WORDS.forEach((w, i) => {
    cur.push(w);
    const next = WORDS[i + 1];
    if (cur.length >= 4 || /[,.!?]$/.test(w[2]) || !next || next[0] - w[1] > 0.4) {
      pages.push({ start: cur[0][0], end: next ? next[0] : w[1] + 0.5, words: cur });
      cur = [];
    }
  });
  return pages;
})();

export const Captions: React.FC<{ font?: string; on?: string; off?: string; until?: number; size?: number; top?: number; shadow?: string }> = ({ font, on = "#fff", off = "rgba(255,255,255,.62)", until = Infinity, size = 60, top, shadow = "0 2px 22px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,1)" }) => {
  const f = useCurrentFrame();
  // Frame look: right under the frame, wherever it is.
  const b = MODE === "frame" ? frameBox(f) : null;
  const y = top ?? (b && b.h < 1800 ? Math.min(1525, b.y + b.h + 26) : 1520);
  const check = useContext(CheckContext);
  const t = f / FPS;
  const page = PAGES.find((p) => t >= p.start && t < p.end);
  if (!page || f >= until) return null;
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: y, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 16px", fontFamily: font, fontWeight: 600, fontSize: size, lineHeight: 1.15, textShadow: check ? "none" : shadow }}>
      {page.words.map(([s, , w]) => (
        <span key={s} style={{ color: check ? "#ff00ff" : t >= s ? on : off }}>{w.replace(/[,.]$/, "")}</span>
      ))}
    </div>
  );
};
