import { useContext } from "react";
import { useCurrentFrame } from "remotion";
import { CheckContext, frameBox } from "./kit";
import { FPS, LAYOUT, MODE, WORDS } from "./data";

// The spoken words a few at a time, each one lighting up as it is said. Change the look freely to fit the style.
const pagesOf = (most: number, chars = 99) => {
  const pages: { start: number; end: number; words: typeof WORDS }[] = [];
  let cur: typeof WORDS = [];
  WORDS.forEach((w, i) => {
    cur.push(w);
    const next = WORDS[i + 1];
    const long = next && [...cur, next].map((x) => x[2]).join(" ").length > chars;
    if (cur.length >= most || long || /[,.!?]$/.test(w[2]) || !next || next[0] - w[1] > 0.4) {
      pages.push({ start: cur[0][0], end: next ? next[0] : w[1] + 0.5, words: cur });
      cur = [];
    }
  });
  return pages;
};
const PAGES = pagesOf(4), SHORT_PAGES = pagesOf(2, 16);

// Where the captions go. "split": on the split line (Split Screen's own place, Abner, 6 Nov 2026).
// "below": under the frame, or low on the screen. "top": high on the screen. The member may ask for another place.
export type CaptionPlace = "split" | "below" | "top";
// How they look. "pill": a short phrase in a rounded box in the style's colours. "plain": words over the picture with a
// soft shadow. Both are starting points: restyle or replace them to suit the style (Abner, 6 Nov 2026).
export type CaptionLook = "pill" | "plain";

// A short phrase in a pill, centred on y, in the style's colour.
const Pill: React.FC<{ font?: string; size: number; color: string; ink: string; paper: string; y: number }> = ({ font, size, color, ink, paper, y }) => {
  const f = useCurrentFrame();
  const check = useContext(CheckContext);
  const t = f / FPS;
  const page = SHORT_PAGES.find((p) => t >= p.start && t < p.end);
  if (!page) return null;
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: y, transform: "translateY(-50%)", display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: "0 14px", padding: `${size * 0.12}px ${size * 0.5}px`, borderRadius: 999, background: check ? "transparent" : paper, border: check ? "none" : `${Math.round(size / 14)}px solid ${color}`, fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1.15 }}>
        {page.words.map(([s, , w]) => (
          <span key={s} style={{ color: check ? "#ff00ff" : t >= s ? color : ink, opacity: check || t >= s ? 1 : 0.35 }}>{w.replace(/[,.]$/, "")}</span>
        ))}
      </div>
    </div>
  );
};

export const Captions: React.FC<{ font?: string; on?: string; off?: string; until?: number; size?: number; top?: number; shadow?: string; place?: CaptionPlace; look?: CaptionLook; color?: string; ink?: string; paper?: string }> = ({ font, on = "#fff", off = "rgba(255,255,255,.62)", until = Infinity, size = 60, top, shadow = "0 2px 22px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,1)", place, look, color = "#1f8f8f", ink = "#1d2b2f", paper = "#ffffff" }) => {
  const f = useCurrentFrame();
  const where = place ?? (LAYOUT === "split" ? "split" : "below");
  const style = look ?? (where === "split" ? "pill" : "plain");
  // Frame look: right under the frame, wherever it is.
  const b = MODE === "frame" ? frameBox(f) : null;
  const line = b ? b.y : 960;
  const y = top ?? (where === "split" ? line - size * 0.6 : where === "top" ? 300 : b && b.h < 1800 ? Math.min(1525, b.y + b.h + 26) : 1520);
  if (style === "pill" && f < until) return <Pill font={font} size={Math.round(size * 1.2)} color={color} ink={ink} paper={paper} y={where === "split" && top === undefined ? line : y + size * 0.7} />;
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
