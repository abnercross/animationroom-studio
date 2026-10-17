import React from "react";
import { MONO, SANS } from "./fonts";
import { Moment } from "./types";
import { Tokens, clamp01, ease, fitLines, fitWidth, fitWrapped, gray, lerp } from "./theme";

type BP = { m: Moment; t: number; tk: Tokens; start: number; w: number; p: number }; // p: 0 person full screen, 1 person in the frame // t: seconds since the block started; start: where that is on the video clock

const label = (tk: Tokens, size = 24): React.CSSProperties => ({
  fontFamily: MONO, fontWeight: 500, fontSize: size * tk.textScale, letterSpacing: 4, textTransform: "uppercase", color: gray(tk.mid),
});

// Words rise from behind a ruler line, one after another.
const Rise: React.FC<{ text: string; t: number; tk: Tokens; delay?: number; style?: React.CSSProperties }> = ({ text, t, tk, delay = 0, style }) => (
  <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.28em", ...style }}>
    {text.split(" ").map((w, i) => {
      const p = ease((t - delay - i * 0.06) / tk.motion.reveal);
      return (
        <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
          <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 105}%)`, opacity: p > 0 ? 1 : 0 }}>{w}</span>
        </span>
      );
    })}
  </div>
);

const sizeFor = (n: number, big: number) => (n <= 18 ? big : n <= 30 ? big * 0.84 : n <= 48 ? big * 0.7 : big * 0.58);

export const Title: React.FC<BP> = ({ m, t, tk, w }) => (
  <div>
    {m.kicker && <div style={{ ...label(tk), opacity: ease(t / 0.4), marginBottom: 26 }}>{m.kicker}</div>}
    <Rise text={m.text ?? ""} t={t} tk={tk} delay={0.1} style={{ fontFamily: SANS, fontWeight: 800, fontSize: sizeFor((m.text ?? "").length, 116 * tk.textScale), lineHeight: 1.04, letterSpacing: -2, color: gray(tk.ink) }} />
    <div style={{ marginTop: 34, height: 3, width: w * ease((t - 0.5) / 0.9), background: gray(tk.ink) }} />
  </div>
);

export const List: React.FC<BP> = ({ m, t, tk, start, w }) => {
  const items = (m.items ?? []).map((it) => ({ ...it, at: it.at - start })); // item times are on the video clock
  const k = tk.textScale;
  const ROW = 116 * k;
  const head = m.heading ? 64 * k : 0;
  const shown = items.filter((it) => t >= it.at).length;
  const lineP = shown ? clamp01((shown - 1 + ease((t - items[shown - 1].at) / 0.5)) / Math.max(1, items.length - 1)) : 0;
  return (
    <div style={{ position: "relative", height: head + items.length * ROW }}>
      {m.heading && <div style={{ ...label(tk), opacity: ease(t / 0.4), height: head }}>{m.heading}</div>}
      <div style={{ position: "absolute", left: 37 * k - 2, top: head + ROW / 2, width: 3, height: (items.length - 1) * ROW * lineP, background: gray(tk.soft) }} />
      {items.map((it, i) => {
        const lt = t - it.at;
        const p = ease(lt / tk.motion.reveal);
        const latest = i === shown - 1;
        return (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: head + i * ROW, height: ROW, opacity: p > 0 ? 1 : 0 }}>
            <div style={{ position: "absolute", left: 0, top: (ROW - 74 * k) / 2, width: 74 * k, height: 74 * k, borderRadius: 37 * k, boxSizing: "border-box", border: `3px solid ${gray(tk.ink)}`, background: latest ? gray(tk.ink) : gray(tk.bg), color: latest ? gray(tk.bg) : gray(tk.ink), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 30 * k, transform: `scale(${lerp(0.7, 1, p)})` }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ position: "absolute", left: 112 * k, top: (ROW - 82 * k) / 2, right: 0, height: 82 * k, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: Math.min(sizeFor(it.text.length, 74 * k) * 0.9, fitWidth(it.text, 74 * k, w - 112 * k - 8, 0.52, 30)), lineHeight: 1.1, whiteSpace: "nowrap", letterSpacing: -1, color: gray(tk.ink), transform: `translateY(${(1 - p) * 100}%)` }}>{it.text}</div>
            </div>
            <div style={{ position: "absolute", left: 112 * k, bottom: 8, height: 2, width: (w - 112 * k) * ease((lt - 0.1) / 0.8), background: gray(tk.soft) }} />
          </div>
        );
      })}
    </div>
  );
};

export const NumberBlock: React.FC<BP> = ({ m, t, tk, w }) => {
  const dec = m.decimals ?? 0;
  const v = (m.value ?? 0) * ease(t / 1.4);
  const shown = dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US");
  return (
    <div>
      {m.label && <div style={{ ...label(tk), opacity: ease(t / 0.4), marginBottom: 14 }}>{m.label}</div>}
      <div style={{ fontFamily: SANS, fontWeight: 800, letterSpacing: -6, color: gray(tk.ink), display: "flex", alignItems: "baseline", lineHeight: 1 }}>
        {m.prefix && <span style={{ fontSize: 110 * tk.textScale, marginRight: 8 }}>{m.prefix}</span>}
        <span style={{ fontSize: 250 * tk.textScale, fontVariantNumeric: "tabular-nums" }}>{shown}</span>
        {m.suffix && <span style={{ fontSize: 110 * tk.textScale, marginLeft: 8 }}>{m.suffix}</span>}
      </div>
      <svg width={w} height={40} style={{ marginTop: 26, display: "block" }}>
        {Array.from({ length: Math.floor(w / 20) }, (_, i) => {
          const p = ease((t - 0.2 - i * 0.012) / 0.4);
          const major = i % 5 === 0;
          return <line key={i} x1={i * 20 + 1} x2={i * 20 + 1} y1={0} y2={(major ? 34 : 16) * p} stroke={gray(major ? tk.ink : tk.soft)} strokeWidth={major ? 3 : 2} />;
        })}
      </svg>
    </div>
  );
};

export const Key: React.FC<BP> = ({ m, t, tk }) => {
  const text = m.text ?? "";
  const at = m.mark ? text.toLowerCase().indexOf(m.mark.toLowerCase()) : -1;
  const parts = at < 0 ? [text, "", ""] : [text.slice(0, at), text.slice(at, at + m.mark!.length), text.slice(at + m.mark!.length)];
  const u = ease((t - 0.7) / 0.7);
  const size = sizeFor(text.length, 118 * tk.textScale);
  return (
    <div>
      {m.kicker && <div style={{ ...label(tk), opacity: ease(t / 0.4), marginBottom: 26 }}>{m.kicker}</div>}
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: size, lineHeight: 1.12, letterSpacing: -2, color: gray(tk.ink), opacity: ease(t / 0.5), transform: `translateY(${(1 - ease(t / 0.6)) * 30}px)` }}>
        {parts[0]}
        <span style={{ backgroundImage: `linear-gradient(${gray(tk.ink)}, ${gray(tk.ink)})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 100%", backgroundSize: `${u * 100}% 8px`, paddingBottom: 6 }}>{parts[1]}</span>
        {parts[2]}
      </div>
    </div>
  );
};

// The headline that goes with a drawing (the drawing itself is placed by Edit.tsx). Like Key, sized for the narrower space.
export const Visual: React.FC<BP> = ({ m, t, tk, w }) => {
  const text = m.text ?? "";
  if (!text) return null;
  const at = m.mark ? text.toLowerCase().indexOf(m.mark.toLowerCase()) : -1;
  const parts = at < 0 ? [text, "", ""] : [text.slice(0, at), text.slice(at, at + m.mark!.length), text.slice(at + m.mark!.length)];
  const u = ease((t - 0.7) / 0.7);
  const size = fitWrapped(text, tk.visual.textBase * tk.textScale, w, 3, tk.visual.textFactor);
  return (
    <div>
      {m.kicker && <div style={{ ...label(tk), opacity: ease(t / 0.4), marginBottom: 22 }}>{m.kicker}</div>}
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: size, lineHeight: 1.12, letterSpacing: -2, color: gray(tk.ink), opacity: ease(t / 0.5), transform: `translateY(${(1 - ease(t / 0.6)) * 30}px)` }}>
        {parts[0]}
        <span style={{ backgroundImage: `linear-gradient(${gray(tk.ink)}, ${gray(tk.ink)})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 100%", backgroundSize: `${u * 100}% 7px`, paddingBottom: 5 }}>{parts[1]}</span>
        {parts[2]}
      </div>
    </div>
  );
};

export const Cta: React.FC<BP> = ({ m, t, tk }) => (
  <div>
    <Rise text={m.text ?? ""} t={t} tk={tk} style={{ fontFamily: SANS, fontWeight: 800, fontSize: sizeFor((m.text ?? "").length, 96 * tk.textScale), lineHeight: 1.06, letterSpacing: -2, color: gray(tk.ink) }} />
    <div style={{ marginTop: 52, display: "flex", alignItems: "center", gap: 30, opacity: ease((t - 0.6) / 0.5), transform: `translateY(${(1 - ease((t - 0.6) / 0.6)) * 24}px)` }}>
      {m.action && (
        <div style={{ ...label(tk, 28), color: gray(tk.bg), background: gray(tk.ink), padding: "22px 36px", borderRadius: 60, letterSpacing: 3 }}>{m.action} →</div>
      )}
      {(m.name || m.role) && (
        <div style={{ borderLeft: `2px solid ${gray(tk.soft)}`, paddingLeft: 28 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 38, color: gray(tk.ink) }}>{m.name}</div>
          <div style={{ ...label(tk, 22), marginTop: 6 }}>{m.role}</div>
        </div>
      )}
    </div>
  </div>
);

// ---------- the spoken words as large, changing type ----------
// Whenever no graphic is up, the words themselves are the design: a phrase at a time, every word of it, in a layout
// that changes from phrase to phrase. A phrase takes over from the last without a gap (it never starts from nothing),
// and each word lights as it is spoken. Always dark type: the person sits on a soft white fade when alone.
export const Words: React.FC<BP> = ({ m, t, tk, w, start, p }) => {
  const abs = t + start;
  const ph = m.phrase ?? [];
  const words = ph.map((x) => x[2]);
  const text = words.join(" ");
  const TY = tk.typo, sc = tk.textScale;
  const key = m.key ?? -1;
  const inA = 0.5 + 0.5 * ease(t / 0.14);
  const rise = (1 - ease(t / 0.16)) * 10;
  const out = m.fadeOut ? clamp01((m.to - abs) / 0.25) : 1;
  const col = tk.ink, dim = tk.mid + 0.22, shadow = 0; // dark type on the soft white fade (alone) and on the grid (framed)
  const lit = (i: number) => abs >= ph[i][0] - 0.02;
  const speaking = (i: number) => lit(i) && abs < Math.max(ph[i][1], ph[i][0] + 0.2);
  const word = (i: number, extra: React.CSSProperties = {}) => (
    <span key={i} style={{ display: "inline-block", color: gray(lit(i) ? col : dim), transform: `scale(${speaking(i) ? 1.06 : 1})`, ...extra }}>{words[i]}</span>
  );
  const under = (i: number): React.CSSProperties => (i === key ? { backgroundImage: `linear-gradient(${gray(col)}, ${gray(col)})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 100%", backgroundSize: `${100 * ease((abs - ph[i][0]) / 0.3)}% 6px`, paddingBottom: 4 } : {});
  const wrap: React.CSSProperties = { opacity: inA * out, transform: `translateY(${rise}px)`, textShadow: `0 2px 22px rgba(0,0,0,${shadow})`, fontFamily: SANS };
  const flow = (fs: number, align: "center" | "left", weight: number, f = 0.28): React.CSSProperties => ({ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: `${f}em`, fontSize: fs, fontWeight: weight, lineHeight: 1.1, letterSpacing: -1, textAlign: align });
  const v = m.variant ?? "lower";

  if (v === "stack") {
    const lines: number[][] = [];
    words.forEach((_, i) => { if (i % 2 === 0) lines.push([i]); else lines[lines.length - 1].push(i); });
    const longest = Math.max(...lines.map((l) => l.map((i) => words[i]).join(" ").length));
    const fs = Math.min(TY.stackBase * sc, w / (Math.max(6, longest) * TY.factor));
    return <div style={wrap}>{lines.map((l, k) => <div key={k} style={{ fontSize: fs, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, marginLeft: k % 2 ? fs * 0.5 : 0 }}>{l.map((i) => word(i, { marginRight: "0.26em", ...under(i) }))}</div>)}</div>;
  }
  if (v === "big" && key >= 0) {
    const fs = Math.min(TY.bigKey * sc, w / (Math.max(3, words[key].length) * 0.6));
    const rest = words.filter((_, i) => i !== key);
    const small = TY.bigSmall * sc;
    return (
      <div style={{ ...wrap, textAlign: "center" }}>
        <div style={{ ...flow(small, "center", 600), marginBottom: 4 }}>{words.map((_, i) => i).filter((i) => i < key).map((i) => word(i))}</div>
        <div style={{ fontSize: fs, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>{word(key, under(key))}</div>
        <div style={{ ...flow(small, "center", 600), marginTop: 4 }}>{words.map((_, i) => i).filter((i) => i > key).map((i) => word(i))}</div>
        {rest.length === 0 ? null : null}
      </div>
    );
  }
  if (v === "strip") return <div style={wrap}><div style={flow(tk.caption.size, "center", 700)}>{words.map((_, i) => word(i))}</div></div>;
  if (v === "panel") {
    const fs = fitLines(text.length, TY.panelBase * sc, w, 3, TY.factor);
    return <div style={wrap}><div style={flow(fs, "left", 800)}>{words.map((_, i) => word(i, under(i)))}</div></div>;
  }
  if (v === "keyword" && key >= 0) {
    const fs = Math.min(TY.keywordKey * sc, w / (Math.max(3, words[key].length) * 0.6));
    const small = TY.keywordSmall * sc;
    return (
      <div style={wrap}>
        <div style={{ fontSize: fs, fontWeight: 800, lineHeight: 1, letterSpacing: -5 }}>{word(key, under(key))}</div>
        <div style={{ ...flow(small, "left", 600), marginTop: 10 }}>{words.map((_, i) => i).filter((i) => i !== key).map((i) => word(i))}</div>
      </div>
    );
  }
  const fs = fitLines(text.length, TY.lowerBase * sc, w, 2, TY.factor);
  return <div style={wrap}><div style={flow(fs, "center", 800)}>{words.map((_, i) => word(i, under(i)))}</div></div>;
};

export const BLOCKS: Record<Moment["type"], React.FC<BP>> = { title: Title, list: List, number: NumberBlock, key: Key, cta: Cta, words: Words, visual: Visual };
