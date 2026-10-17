import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { displayStack as display, monoStack as mono } from "./fonts";

const C = {
  stage: "#0E1013",
  grid: "#191E24",
  ink: "#FFFFFF",
  muted: "#9AA3AD",
  soft: "#C9D0D7",
  hi: "#FFD23F",
  accent: "#2C63C9",
  rec: "#E5483B",
};

export type HelloProps = { name: string };

const pad = (n: number) => String(n).padStart(2, "0");

const Corner: React.FC<{ x: "left" | "right"; y: "top" | "bottom" }> = ({ x, y }) => (
  <div
    style={{
      position: "absolute",
      [x]: 60,
      [y]: 60,
      width: 74,
      height: 74,
      borderColor: "rgba(255,255,255,.72)",
      borderStyle: "solid",
      borderWidth: 0,
      [x === "left" ? "borderLeftWidth" : "borderRightWidth"]: 6,
      [y === "top" ? "borderTopWidth" : "borderBottomWidth"]: 6,
    }}
  />
);

const Slam: React.FC<{ text: string; at: number; color: string; size: number }> = ({ text, at, color, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 180 } });
  const scale = interpolate(s, [0, 1], [1.6, 1]);
  const opacity = interpolate(frame - at, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: display,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 0.86,
        color,
        textTransform: "uppercase",
        transform: `scale(${scale})`,
        transformOrigin: "left center",
        opacity,
      }}
    >
      {text}
    </div>
  );
};

export const Hello: React.FC<HelloProps> = ({ name }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bar = interpolate(frame, [44, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const welcome = name.trim() ? `Welcome, ${name.trim()}.` : "Welcome to the studio.";
  const typed = Math.max(0, Math.min(welcome.length, Math.floor((frame - 62) * 1.2)));
  const recOn = Math.floor(frame / 15) % 2 === 0;

  const secs = Math.floor(frame / fps);
  const tc = `00:00:${pad(secs)}:${pad(frame % fps)}`;

  return (
    <AbsoluteFill style={{ backgroundColor: C.stage }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.grid} 2px, transparent 2px), linear-gradient(90deg, ${C.grid} 2px, transparent 2px)`,
          backgroundSize: "120px 120px",
          opacity: 0.9,
        }}
      />
      <Corner x="left" y="top" />
      <Corner x="right" y="top" />
      <Corner x="left" y="bottom" />
      <Corner x="right" y="bottom" />

      <div style={{ position: "absolute", left: 110, top: 112, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: C.rec, opacity: recOn ? 1 : 0.2 }} />
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 34, letterSpacing: 6, color: C.ink }}>REC</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 116, fontFamily: mono, fontWeight: 500, fontSize: 28, letterSpacing: 5, color: C.muted }}>
        ANIMATION ROOM
      </div>

      <div style={{ position: "absolute", left: 110, right: 110, top: 600, display: "flex", flexDirection: "column", gap: 10 }}>
        <Slam text="Your" at={8} color={C.ink} size={220} />
        <Slam text="Studio" at={16} color={C.ink} size={220} />
        <Slam text="Is ready" at={26} color={C.hi} size={210} />
        <div style={{ height: 18, width: 860 * bar, background: C.accent, marginTop: 24 }} />
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 46, color: C.soft, marginTop: 30, minHeight: 60 }}>
          {welcome.slice(0, typed)}
          <span style={{ opacity: frame >= 62 && Math.floor(frame / 8) % 2 === 0 ? 1 : 0, color: C.hi }}>▍</span>
        </div>
      </div>

      <div style={{ position: "absolute", left: 110, bottom: 120, fontFamily: mono, fontWeight: 500, fontSize: 28, letterSpacing: 4, color: C.muted }}>
        1080 × 1920 · 30 FPS
      </div>
      <div style={{ position: "absolute", right: 110, bottom: 116, fontFamily: mono, fontWeight: 700, fontSize: 40, color: C.hi }}>
        {tc}
      </div>
    </AbsoluteFill>
  );
};
