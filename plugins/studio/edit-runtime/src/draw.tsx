import React from "react";
import lib from "./drawings.json";
import { MONO } from "./fonts";
import { Tokens, clamp01, ease, gray } from "./theme";

// The drawing library is data (drawings.json): each drawing is a list of strokes on a 100 by 100 sheet, in the
// order they are drawn. Adding a drawing means adding an entry there, no code. "tone": "mid" is a lighter detail line.
type Stroke = { d: string; tone?: string };
const DRAWINGS = lib.drawings as Record<string, { strokes: Stroke[] }>;

// A thin line drawing that draws itself, one stroke after another, then stays still.
export const Drawing: React.FC<{ name: string; t: number; tk: Tokens; label?: string }> = ({ name, t, tk, label }) => {
  const V = tk.visual, { w, h } = V.box;
  const size = Math.min(w, h) - V.pad * 2;
  const strokes = DRAWINGS[name]?.strokes ?? [];
  const u = lib.box / size; // one pixel, in sheet units
  const gap = Math.min(0.16, 0.9 / Math.max(1, strokes.length - 1));
  const dur = tk.motion.reveal * 1.2;
  const done = 0.15 + (strokes.length - 1) * gap + dur;
  const c = ease(t / 0.4) * V.corner;
  return (
    <div style={{ position: "absolute", left: V.box.x, top: V.box.top, width: w, height: h }}>
      {/* corner ticks, like the marks on the page */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {[[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].map(([x, y, dx, dy], i) => (
          <path key={i} d={`M${x + dx * c},${y} L${x},${y} L${x},${y + dy * c}`} fill="none" stroke={gray(tk.soft)} strokeWidth={2} opacity={t > 0 ? 1 : 0} />
        ))}
      </svg>
      <svg width={size} height={size} viewBox={`0 0 ${lib.box} ${lib.box}`} style={{ position: "absolute", left: (w - size) / 2, top: (h - size) / 2, overflow: "visible" }}>
        {strokes.map((s, i) => {
          const p = ease((t - 0.15 - i * gap) / dur);
          if (p <= 0) return null;
          const mid = s.tone === "mid";
          return <path key={i} d={s.d} fill="none" stroke={gray(mid ? tk.mid : tk.ink)} strokeWidth={(mid ? V.detail : V.line) * u} strokeLinecap="round" strokeLinejoin="round" {...(p < 1 ? { pathLength: 1, strokeDasharray: "1 1", strokeDashoffset: 1 - p } : {})} />;
        })}
      </svg>
      {label && <div style={{ position: "absolute", left: 0, right: 0, top: h + 14, textAlign: "center", whiteSpace: "nowrap", fontFamily: MONO, fontWeight: 500, fontSize: 24 * tk.textScale, letterSpacing: 4, textTransform: "uppercase", color: gray(tk.mid), opacity: clamp01((t - done + 0.3) / 0.4) }}>{label}</div>}
    </div>
  );
};
