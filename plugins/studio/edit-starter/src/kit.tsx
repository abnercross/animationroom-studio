// Fixed helpers for the scenes. Write the scenes in scenes.tsx; this file stays as it is.
import { createContext, useContext } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { FACE, FPS, WORDS } from "./data";
import { FRAMES } from "./scenes";

export const CheckContext = createContext(false);

// The frame a spoken word starts on. cue("minutos", 2) is the second time that word is said.
export const cue = (word: string, nth = 1): number => {
  const clean = (s: string) => s.toLowerCase().replace(/[.,!?;:]/g, "");
  const hits = WORDS.filter((w) => clean(w[2]) === clean(word));
  if (!hits[nth - 1]) throw new Error(`cue: "${word}" (time ${nth}) is not in the words`);
  return Math.round(hits[nth - 1][0] * FPS);
};

const soft = Easing.bezier(0.45, 0, 0.2, 1);
// 0 to 1 between two frames, eased and clamped.
export const ease = (f: number, a: number, b: number, e = soft) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

// The tracker reads the face a few times a second and moves in small jumps. A frame that followed every jump would
// shake (Abner, 6 Nov 2026: the frame look felt jarring), so the path is smoothed over about a second, like a calm
// camera operator, and read between the samples.
let smoothed: { x: number[]; y: number[] } | null = null;
const smoothTrack = (tr: { step: number; x: number[]; y: number[] }) => {
  if (smoothed) return smoothed;
  const sigma = Math.max(1, 0.4 / tr.step), reach = Math.ceil(sigma * 2.5);
  const blur = (v: number[]) => v.map((_, i) => {
    let sum = 0, weight = 0;
    for (let k = -reach; k <= reach; k++) {
      const j = Math.max(0, Math.min(v.length - 1, i + k)), g = Math.exp(-(k * k) / (2 * sigma * sigma));
      sum += v[j] * g; weight += g;
    }
    return sum / weight;
  });
  return (smoothed = { x: blur(tr.x), y: blur(tr.y) });
};

// Where the face is at this frame, as pixels on the 1080 by 1920 picture (the video fills the picture in the cutout look).
export const faceAt = (frame: number) => {
  const tr = FACE.track;
  if (!tr || !tr.x.length) return { x: FACE.x * 1080, y: FACE.y * 1920, w: FACE.w * 1080 };
  const s = smoothTrack(tr), pos = Math.max(0, Math.min(tr.x.length - 1, frame / FPS / tr.step));
  const i = Math.floor(pos), j = Math.min(tr.x.length - 1, i + 1), p = pos - i;
  return { x: (s.x[i] + (s.x[j] - s.x[i]) * p) * 1080, y: (s.y[i] + (s.y[j] - s.y[i]) * p) * 1920, w: FACE.w * 1080 };
};

// All text on screen goes through Say, in the Front layer: the automatic check can then see it.
export const Say: React.FC<{ x?: number; y: number; size?: number; color?: string; width?: number; font?: string; weight?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ x = 540, y, size = 66, color = "#fff", width = 900, font, weight = 600, style, children }) => {
  const check = useContext(CheckContext);
  return (
    <div
      style={{
        position: "absolute", left: x - width / 2, top: y - size * 0.6, width, textAlign: "center",
        fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.1,
        ...style,
        color: check ? "#ff00ff" : color,
        ...(check ? { textShadow: "none", opacity: style?.opacity ?? 1, WebkitTextStroke: "0", filter: "none" } : {}),
      }}
    >
      {children}
    </div>
  );
};

// Put this inside Front while a full page hides the person (an ending with no one on screen): the check then lets text sit where the face would be.
export const NoPerson: React.FC = () => {
  const check = useContext(CheckContext);
  return check ? <div style={{ position: "absolute", left: 0, top: 0, width: 12, height: 12, background: "#00ff00" }} /> : null;
};

// ---------- the frame (look "frame"): where it is right now, so everything can be placed around it ----------
export type Box = { x: number; y: number; w: number; h: number; r: number };
export const BOXES = {
  full: { x: 0, y: 0, w: 1080, h: 1920, r: 0 },
  half: { x: 0, y: 960, w: 1080, h: 960, r: 0 }, // Split Screen: the bottom half, the style plays above it
  bottom: { x: 90, y: 780, w: 900, h: 700, r: 40 },
  top: { x: 90, y: 200, w: 900, h: 700, r: 40 },
  wide: { x: 0, y: 760, w: 1080, h: 720, r: 0 },
  narrow: { x: 290, y: 640, w: 500, h: 840, r: 40 },
  left: { x: 90, y: 620, w: 520, h: 860, r: 40 },
  right: { x: 470, y: 620, w: 520, h: 860, r: 40 },
  round: { x: 180, y: 470, w: 720, h: 720, r: 360 },
  small: { x: 640, y: 1040, w: 350, h: 440, r: 30 },
} as const;
export type FrameShape = keyof typeof BOXES;
export type FrameMark = { at: number; shape?: FrameShape; box?: Box; dur?: number };

// The frame at this moment, moves included. FRAMES in scenes.tsx says where it goes and when.
export const frameBox = (frame: number): Box => {
  const start = FRAMES[0];
  let b: Box = { ...(start?.box ?? BOXES[start?.shape ?? "bottom"]) };
  for (const k of FRAMES) {
    const d = k.dur ?? 12, p = ease(frame, k.at, k.at + d), to = k.box ?? BOXES[k.shape ?? "bottom"];
    b = { x: b.x + (to.x - b.x) * p, y: b.y + (to.y - b.y) * p, w: b.w + (to.w - b.w) * p, h: b.h + (to.h - b.h) * p, r: b.r + (to.r - b.r) * p };
  }
  return b;
};

export type Side = "above" | "below" | "left" | "right";
const SAFE = { top: 90, bottom: 1500, left: 60, right: 960 };
// The free space on one side of the frame right now, inside the phone's safe area.
export const spaceAt = (frame: number, side: Side) => {
  const b = frameBox(frame);
  if (side === "above") return { x: SAFE.left, y: SAFE.top, w: SAFE.right - SAFE.left, h: Math.max(0, b.y - SAFE.top) };
  if (side === "below") return { x: SAFE.left, y: b.y + b.h, w: SAFE.right - SAFE.left, h: Math.max(0, SAFE.bottom - b.y - b.h) };
  if (side === "left") return { x: SAFE.left, y: Math.max(SAFE.top, b.y), w: Math.max(0, b.x - SAFE.left), h: Math.min(b.h, SAFE.bottom - b.y) };
  return { x: b.x + b.w, y: Math.max(SAFE.top, b.y), w: Math.max(0, SAFE.right - b.x - b.w), h: Math.min(b.h, SAFE.bottom - b.y) };
};

// Holds a drawing against one edge of the frame: it follows the frame and grows or shrinks to the space there is.
// Draw the children in a box w by h from 0, 0. They touch the frame at gap pixels, centred along that edge.
export const Around: React.FC<{ side: Side; w: number; h: number; gap?: number; max?: number; children: React.ReactNode }> = ({ side, w, h, gap = 28, max = 1.6, children }) => {
  const f = useCurrentFrame();
  const b = frameBox(f), sp = spaceAt(f, side);
  const vertical = side === "above" || side === "below";
  const s = Math.max(0, Math.min(max, (sp.w - (vertical ? 0 : gap)) / w, (sp.h - (vertical ? gap : 0)) / h));
  const x = vertical ? Math.max(sp.x, Math.min(sp.x + sp.w - w * s, b.x + b.w / 2 - (w * s) / 2)) : side === "left" ? b.x - gap - w * s : b.x + b.w + gap;
  const y = !vertical ? b.y + b.h / 2 - (h * s) / 2 : side === "above" ? b.y - gap - h * s : b.y + b.h + gap;
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `scale(${s})`, transformOrigin: "0 0" }}>{children}</div>;
};
