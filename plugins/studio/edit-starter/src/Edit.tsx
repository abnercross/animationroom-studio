// The layers of the video. Fixed for both looks; the creative work is in scenes.tsx.
import { Video } from "@remotion/media";
import saved from "./grade.json";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { HEIGHT, MODE, VIDEO_SHAPE, WIDTH } from "./data";
import { CheckContext, NoPerson, ease, faceAt, frameBox } from "./kit";
import { Behind, Front, FRAMES, LOOK, Stage } from "./scenes";

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
const withGrade = (on: boolean, rest: string) => [on ? "url(#memberGrade)" : "", rest === "none" ? "" : rest].filter(Boolean).join(" ") || "none";

const Card: React.FC<{ graded: boolean }> = ({ graded }) => {
  const f = useCurrentFrame();
  const box = frameBox(f);
  const face = faceAt(f);
  const cover = Math.max(box.w / VIDEO_SHAPE.width, box.h / VIDEO_SHAPE.height);
  // Close enough to read the face, never so close that the chin is lost.
  const wanted = Math.min(box.w * 0.62, box.h * 0.42);
  // Nearly full screen, the whole picture shows; the close up comes in as the frame gets smaller.
  const closeUp = 1 - ease((box.w * box.h) / (WIDTH * HEIGHT), 0.45, 0.9);
  const zoom = cover * (1 + (Math.max(1, wanted / (face.w * (VIDEO_SHAPE.width / WIDTH) * cover)) - 1) * closeUp);
  const vw = VIDEO_SHAPE.width * zoom, vh = VIDEO_SHAPE.height * zoom;
  const fx = (face.x / WIDTH) * vw, fy = (face.y / HEIGHT) * vh;
  const left = Math.min(0, Math.max(box.w - vw, box.w / 2 - fx)), top = Math.min(0, Math.max(box.h - vh, box.h * 0.48 - fy));
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r, overflow: "hidden", ...LOOK.frame }}>
      <div style={{ position: "absolute", left, top, width: vw, height: vh, filter: withGrade(graded, LOOK.person) }}>
        <Video src={staticFile("edited.mp4")} muted style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
};

// In the check, the frame is laid over the text in see through yellow: text under it changes colour and is measured.
const CheckFrame: React.FC = () => {
  const b = frameBox(useCurrentFrame());
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
            <Video src={staticFile("edited.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </AbsoluteFill>
          <Stage />
          <Behind />
          <AbsoluteFill style={{ filter: withGrade(!!active, LOOK.person) }}>
            <Video src={staticFile("person.webm")} muted transparent style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
