// The layers of the video. Fixed for both looks; the creative work is in scenes.tsx.
import { Video } from "@remotion/media";
import saved from "./grade.json";
import { AbsoluteFill, Freeze, staticFile, useCurrentFrame } from "remotion";
import { FPS, HEIGHT, LAYOUT, MODE, VIDEO_SECONDS, VIDEO_SHAPE, WIDTH } from "./data";
import { CheckContext, NoPerson, ease, faceAt, frameBox } from "./kit";
import { Behind, Front, FRAMES, LOOK, Stage, TAIL_SECONDS } from "./scenes";
import { endingAt } from "./ending";

// Frame look: the video in a frame that moves and changes shape on the marks in FRAMES, keeping the face in view.
// The colour grade is the member's choice at the end (edit.mjs scenegrade). Without one, the footage keeps its own colours.
export type Grade = { saturate: number; r: number[]; g: number[]; b: number[] } | null;
const GradeFilter: React.FC<{ grade: NonNullable<Grade> }> = ({ grade }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <filter id="memberGrade" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values={String(grade.saturate)} />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={grade.r.join(" ")} />
        <feFuncG type="table" tableValues={grade.g.join(" ")} />
        <feFuncB type="table" tableValues={grade.b.join(" ")} />
      </feComponentTransfer>
    </filter>
  </svg>
);
// After the footage runs out (an ending is playing), the person holds still on the last frame instead of vanishing.
const LAST = Math.max(0, Math.floor(VIDEO_SECONDS * FPS) - 2);
const Footage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  return f > LAST ? <Freeze frame={LAST}>{children}</Freeze> : <>{children}</>;
};

const withGrade = (on: boolean, rest: string) => [on ? "url(#memberGrade)" : "", rest === "none" ? "" : rest].filter(Boolean).join(" ") || "none";

// Where the video sits inside a still frame: zoom, and where the face lands as a share of the frame's width and height.
const framingFor = (box: { w: number; h: number }, face: { x: number; y: number; w: number }) => {
  const cover = Math.max(box.w / VIDEO_SHAPE.width, box.h / VIDEO_SHAPE.height);
  // Close enough to read the face, never so close that the chin is lost.
  const wanted = Math.min(box.w * 0.62, box.h * 0.42);
  // Nearly full screen, the whole picture shows; the close up comes in as the frame gets smaller.
  const closeUp = 1 - ease((box.w * box.h) / (WIDTH * HEIGHT), 0.45, 0.9);
  const zoom = cover * (1 + (Math.max(1, wanted / (face.w * (VIDEO_SHAPE.width / WIDTH) * cover)) - 1) * closeUp);
  const vw = VIDEO_SHAPE.width * zoom, vh = VIDEO_SHAPE.height * zoom;
  const fx = (face.x / WIDTH) * vw, fy = (face.y / HEIGHT) * vh;
  const left = Math.min(0, Math.max(box.w - vw, box.w / 2 - fx)), top = Math.min(0, Math.max(box.h - vh, box.h * 0.48 - fy));
  return { zoom, u: (left + fx) / box.w, v: (top + fy) / box.h };
};

// Where the video sits inside the frame at this moment, and where the face lands on the screen. While the frame moves,
// the framing glides from where it was to where it lands (zoom on a steady curve, face drifting in a straight line).
// Worked out from the moving frame itself, a frame that passed through a tall shape zoomed in and back out within
// half a second (Abner, 6 Nov 2026: the frame's first entrance was jarring).
const cardAt = (f: number) => {
  const box = frameBox(f);
  const face = faceAt(f);
  let { zoom, u, v } = framingFor(box, face);
  const move = [...FRAMES].reverse().find((k) => f > k.at && f < k.at + (k.dur ?? 12));
  if (move) {
    const d = move.dur ?? 12, p = ease(f, move.at, move.at + d);
    const a = framingFor(frameBox(move.at), face), b = framingFor(frameBox(move.at + d), face);
    zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * p);
    u = a.u + (b.u - a.u) * p; v = a.v + (b.v - a.v) * p;
  }
  zoom = Math.max(zoom, box.w / VIDEO_SHAPE.width, box.h / VIDEO_SHAPE.height); // never a gap at the frame's edge
  const vw = VIDEO_SHAPE.width * zoom, vh = VIDEO_SHAPE.height * zoom;
  const fx = (face.x / WIDTH) * vw, fy = (face.y / HEIGHT) * vh;
  const left = Math.min(0, Math.max(box.w - vw, box.w * u - fx)), top = Math.min(0, Math.max(box.h - vh, box.h * v - fy));
  return { box, left, top, vw, vh, face: { x: box.x + left + fx, y: box.y + top + fy, w: (face.w / WIDTH) * vw } };
};

const Card: React.FC<{ graded: boolean }> = ({ graded }) => {
  const { box, left, top, vw, vh } = cardAt(useCurrentFrame());
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r, overflow: "hidden", ...LOOK.frame }}>
      <div style={{ position: "absolute", left, top, width: vw, height: vh, filter: withGrade(graded, LOOK.person) }}>
        <Footage><Video src={staticFile("edited.mp4")} muted style={{ width: "100%", height: "100%" }} /></Footage>
      </div>
    </div>
  );
};

// In the check, the frame is laid over the text in see through yellow: text under it changes colour and is measured.
const CheckFrame: React.FC = () => {
  const f = useCurrentFrame();
  const b = frameBox(f);
  // Once an ending has covered the picture, there is no frame or face left to keep clear.
  if (TAIL_SECONDS > 0 && f >= (endingAt() + 0.3) * FPS) return <NoPerson />;
  if (LAYOUT === "split") {
    // Split Screen: the captions sit on the split line, partly over the video, so only the face on the screen is
    // kept clear (in see through yellow, where the frame engine puts it; the check reports it as the face).
    const c = cardAt(f).face, hw = c.w * 0.58;
    return (<>
      <NoPerson />
      <div style={{ position: "absolute", left: c.x - hw, top: c.y - hw * 1.25, width: hw * 2, height: hw * 2.4, background: "rgba(255,255,0,.5)" }} />
    </>);
  }
  if (b.w * b.h > 0.8 * WIDTH * HEIGHT) return null; // a full screen frame: the face is checked instead
  return (<>
    <NoPerson />
    <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.r, background: "rgba(255,255,0,.5)" }} />
  </>);
};

export const Edit: React.FC<{ check?: boolean; grade?: Grade }> = ({ check, grade }) => {
  const active = grade === undefined ? (saved as Grade) : grade; // a preview passes its own grade
  if (check) {
    // Only the text, for the automatic check.
    return (
      <CheckContext.Provider value>
        <AbsoluteFill><Front />{MODE === "frame" ? <CheckFrame /> : null}</AbsoluteFill>
      </CheckContext.Provider>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: LOOK.background, overflow: "hidden" }}>
      {active ? <GradeFilter grade={active} /> : null}
      {MODE === "cutout" ? (
        <>
          <AbsoluteFill style={{ filter: withGrade(!!active, LOOK.room) }}>
            <Footage><Video src={staticFile("edited.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Footage>
          </AbsoluteFill>
          <Stage />
          <Behind />
          <AbsoluteFill style={{ filter: withGrade(!!active, LOOK.person) }}>
            <Footage><Video src={staticFile("person.webm")} muted transparent style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Footage>
          </AbsoluteFill>
        </>
      ) : (
        <>
          <Stage />
          <Behind />
          <Card graded={!!active} />
        </>
      )}
      <Front />
    </AbsoluteFill>
  );
};
