import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";
import { Video } from "@remotion/media";
import { BLOCKS } from "./blocks";
import { Drawing } from "./draw";
import { MONO, SANS, fontsReady } from "./fonts";
import { EditProps, Moment } from "./types";
import { SIZE, clamp01, ease, gray, lerp, merge, smooth } from "./theme";

const wantsWindow = (m: Moment) => (m.layout ?? "window") === "window";

// Stretches of time where the person sits in the frame. Moments that nearly touch share one stretch.
function spans(moments: Moment[]) {
  const out: { from: number; to: number }[] = [];
  moments.filter(wantsWindow).sort((a, b) => a.from - b.from).forEach((m) => {
    const last = out[out.length - 1];
    if (last && m.from - last.to < 1.0) last.to = Math.max(last.to, m.to);
    else out.push({ from: m.from, to: m.to });
  });
  return out;
}

export const Edit: React.FC<EditProps> = ({ plan, tokens }) => {
  const format = plan.format ?? "9:16";
  const { w: W, h: H } = SIZE[format];
  const tk = useMemo(() => merge(tokens, format), [tokens, format]);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const [handle] = React.useState(() => delayRender("fonts"));
  React.useEffect(() => { fontsReady.then(() => continueRender(handle)); }, [handle]);

  // 0 = person full screen, 1 = person in the frame.
  const tr = tk.motion.transition;
  const sp = useMemo(() => spans(plan.moments), [plan.moments]);
  const p = sp.reduce((best, s) => Math.max(best, smooth((t - s.from) / tr) * smooth((s.to + tr - t) / tr)), 0);

  // The video fills the whole page, or fills the frame with the face kept inside it.
  const { width: vw, height: vh } = plan.video;
  const wn = tk.window;
  // A vertical recording in a 16:9 video: the "full" state is a tall strip of the person on the grid, not a huge crop.
  const strip = format === "16:9" && vw < vh;
  const fr = strip ? { x: tk.strip.x, y: 0, w: (H * vw) / vh, h: H } : { x: 0, y: 0, w: W, h: H };
  const sFull = strip ? H / vh : Math.max(W / vw, H / vh);
  const sWin = Math.max(wn.w / vw, wn.h / vh) * wn.zoom;
  const s = lerp(sFull, sWin, p);
  const dw = vw * s, dh = vh * s;
  const clampCover = (v: number, size: number, box: number) => Math.min(0, Math.max(box - size, v));
  const winS = vw * sWin, winH = vh * sWin;
  // Where the face is right now: followed through the video when the plan carries a track.
  const tr_ = plan.face.track;
  const at = (a: number[]) => { const f = Math.max(0, Math.min(a.length - 1, t / tr_!.step)); const i = Math.floor(f); return lerp(a[i], a[Math.min(a.length - 1, i + 1)], f - i); };
  const face = tr_ ? { x: at(tr_.x), y: at(tr_.y) } : plan.face;
  // Full screen keeps the face in view too, which matters when the shapes differ (a vertical video in 16:9).
  const fullW = vw * sFull, fullH = vh * sFull;
  const fullLeft = strip ? 0 : clampCover(W / 2 - face.x * fullW, fullW, W);
  const fullTop = strip ? 0 : clampCover(H * tk.fullAnchorY - face.y * fullH, fullH, H);
  const winLeft = clampCover(wn.w / 2 - face.x * winS, winS, wn.w);
  const winTop = clampCover(wn.h * wn.anchorY - face.y * winH, winH, wn.h);
  const rect = { x: lerp(fr.x, wn.x, p), y: lerp(fr.y, wn.y, p), w: lerp(fr.w, wn.w, p), h: lerp(fr.h, wn.h, p), r: lerp(0, wn.radius, p) };
  const vLeft = lerp(fullLeft, winLeft, p);
  const vTop = lerp(fullTop, winTop, p);

  // Graphics wait for the frame to settle. The spoken words never wait: they are on from their first moment.
  const delay = (m: Moment) => (m.type === "words" ? 0 : wantsWindow(m) ? tk.motion.transition * 0.85 : 0.05);
  const active = plan.moments.find((m) => t >= m.from && t <= m.to);
  const dim = strip ? 0 : plan.moments.filter((m) => !wantsWindow(m)).reduce((b, m) => Math.max(b, smooth((t - (m.from - 0.4)) / 0.35) * smooth((m.to + 0.3 - t) / 0.35)), 0);

  const g = tk.gridMinorStep, G = tk.gridMajorStep;
  return (
    <AbsoluteFill style={{ background: gray(tk.bg), overflow: "hidden" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: Math.ceil(W / g) + 1 }, (_, i) => <line key={"v" + i} x1={i * g} x2={i * g} y1={0} y2={H} stroke={gray(i * g % G === 0 ? tk.gridMajor : tk.gridMinor)} strokeWidth={i * g % G === 0 ? 2 : 1} />)}
        {Array.from({ length: Math.ceil(H / g) + 1 }, (_, i) => <line key={"h" + i} y1={i * g} y2={i * g} x1={0} x2={W} stroke={gray(i * g % G === 0 ? tk.gridMajor : tk.gridMinor)} strokeWidth={i * g % G === 0 ? 2 : 1} />)}
      </svg>

      <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r, overflow: "hidden", background: "#000", boxShadow: `0 0 0 ${3 * (strip ? 1 : p)}px ${gray(tk.ink)}` }}>
        {plan.video.src && <Video src={staticFile(plan.video.src)} style={{ position: "absolute", left: vLeft, top: vTop, width: dw, height: dh }} />}
        {/* soft white fade at the foot of a full screen shot, so text on it stays readable */}
        <div style={{ position: "absolute", inset: 0, opacity: dim, background: `linear-gradient(to top, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.93) 30%, rgba(255,255,255,0) 52%)` }} />
      </div>

      {/* corner marks, as on a drawing sheet */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: strip ? 1 : p }}>
        {[[tk.corners.inset, tk.corners.inset, 1, 1], [W - tk.corners.inset, tk.corners.inset, -1, 1], [tk.corners.inset, H - tk.corners.inset, 1, -1], [W - tk.corners.inset, H - tk.corners.inset, -1, -1]].map(([x, y, dx, dy], i) => (
          <path key={i} d={`M${x + dx * tk.corners.arm},${y} L${x},${y} L${x},${y + dy * tk.corners.arm}`} fill="none" stroke={gray(tk.ink)} strokeWidth={3} />
        ))}
      </svg>

      {active?.tag && wantsWindow(active) && (
        <div style={{ position: "absolute", left: tk.tag.x, top: tk.tag.y, fontFamily: MONO, fontWeight: 700, fontSize: 28, letterSpacing: 5, textTransform: "uppercase", color: gray(tk.ink), opacity: ease((t - active.from - 0.2) / 0.4) * clamp01((active.to - t) / 0.25) }}>{active.tag}</div>
      )}

      {/* every moment is its own bar on the Remotion timeline, named by what it shows */}
      {plan.moments.map((m, i) => {
        const Block = BLOCKS[m.type];
        const lt = t - m.from - delay(m);
        const fade = clamp01((m.to - t) / 0.28);
        const full = !wantsWindow(m);
        const sx = fr.x + fr.w + tk.strip.gap;
        // A drawing takes its own corner of the page; its headline, or the spoken words, sit in the space beside it.
        const r = m.type === "visual" || m.beside ? tk.visual.text : full && strip ? { x: sx, w: W - sx - 100, top: 120, h: 840 } : full ? tk.blockFull : tk.block;
        const label = (m.type === "words" ? (m.phrase ?? []).map((x) => x[2]).join(" ") : m.type === "visual" ? [m.draw, m.text].filter(Boolean).join(", ") : m.text || m.heading || (m.items || []).map((x) => x.text).join(", ") || String(m.value ?? "")).slice(0, 34);
        return (
          <Sequence key={i} from={Math.round(m.from * fps)} durationInFrames={Math.max(1, Math.round((m.to - m.from) * fps) + 1)} name={`${i + 1}. ${m.type === "words" ? "typography" : m.type}: ${label}`} layout="none">
            {lt >= 0 && (
              <div style={{ position: "absolute", left: r.x, width: r.w, top: r.top, height: r.h, display: "flex", alignItems: full && !strip ? "flex-end" : "center", opacity: fade }}>
                <div style={{ width: "100%" }}><Block m={m} t={lt} tk={tk} w={r.w} p={p} start={m.from + delay(m)} /></div>
              </div>
            )}
            {m.type === "visual" && m.draw && <div style={{ opacity: fade }}><Drawing name={m.draw} t={t - Math.max(m.at ?? m.from, m.from + delay(m))} tk={tk} label={m.label} /></div>}
          </Sequence>
        );
      })}

    </AbsoluteFill>
  );
};
