// The ending: after the last word, the style opens over the video in a circle, and the member's ending message and
// name come in (Abner, 6 Nov 2026: videos stopped too abruptly). Fixed helper: use it from scenes.tsx, do not edit.
//
//   export const TAIL_SECONDS = endingTail();             // room for the ending after the speech
//   <Ending cta="Segue para mais" name="Animation Room" bg={colour("cream")} ink={colour("charcoal")} accent={colour("teal")} font="Poppins">
//     <Pieces blocks={[...]} />                           // optional: the hero waving, a few props, all timed from endingAt()
//   </Ending>                                             // last thing in Front, after the captions
import { useContext } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FPS, VIDEO_SECONDS, WORDS } from "./data";
import { CheckContext, NoPerson, Say, ease, faceAt } from "./kit";

export const ENDING_SECONDS = 2.8;
const lastWord = () => (WORDS.length ? WORDS[WORDS.length - 1] : [VIDEO_SECONDS, VIDEO_SECONDS, ""]) as [number, number, string];
// When the circle starts: right as the last word ends, so the speech flows into the ending with no gap (Abner,
// 6 Nov 2026: the first endings waited too long after the last word). If the footage runs out first, the person holds
// still on the last frame (Edit.tsx) until the circle has covered them, never longer than a tenth of a second.
export const endingAt = () => +Math.min(lastWord()[1] + 0.05, VIDEO_SECONDS + 0.1).toFixed(2);
// When the ending message first pops in: during the last word, a little before the speech ends, so it joins the
// speech to the ending. It appears small at leadY, then glides to the middle while the circle opens.
export const ctaAt = (lead = 0.4) => +Math.max(lastWord()[0], endingAt() - lead).toFixed(2);
// Extra seconds the video needs after the footage so the ending can play out.
export const endingTail = (seconds = ENDING_SECONDS) => Math.max(0, +(endingAt() + seconds - VIDEO_SECONDS).toFixed(2));

const pop = (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

export const Ending: React.FC<{
  cta?: string; name?: string; at?: number; lead?: number; leadY?: number;
  bg: string; ink: string; accent: string; paper?: string; font?: string;
  from?: { x: number; y: number }; ctaY?: number; nameY?: number; size?: number;
  children?: React.ReactNode;
}> = ({ cta, name, at, lead = 0.4, leadY = 330, bg, ink, accent, paper = "#ffffff", font, from = { x: 540, y: 960 }, ctaY = 700, nameY, size = 108, children }) => {
  const f = useCurrentFrame();
  const check = useContext(CheckContext);
  const a = (at ?? endingAt()) * FPS;
  const c = Math.min(a, (at === undefined ? ctaAt(lead) : at - lead) * FPS);
  if (f < c) return null;
  const wipe = ease(f, a, a + 16);
  const covered = f >= a + 16;
  const r = 2300 * wipe;
  // Once the circle has passed over the whole face, the check stops looking for the person there.
  const fc = faceAt(f), overFace = r > Math.hypot(fc.x - from.x, fc.y - from.y) + fc.w;
  // The message pops in over the last word with a paper coloured edge so it reads over any picture, then rides the
  // circle to the middle and grows to full size.
  const ctaIn = ease(f, c, c + 10, pop), glide = ease(f, a + 4, a + 20);
  const nameIn = ease(f, a + 12, a + 22, pop);
  // The message stays on one line: long ones get a smaller size. The name sits just under it.
  const ctaSize = cta ? Math.min(size, Math.floor(960 / (cta.length * 0.6))) : size;
  const nameTop = nameY ?? ctaY + ctaSize * 0.6 + 34;
  const y = leadY + (ctaY - leadY) * glide, grow = 0.72 + 0.28 * glide;
  return (
    <AbsoluteFill>
      {f >= a ? <AbsoluteFill style={{ background: bg, clipPath: `circle(${r}px at ${from.x}px ${from.y}px)` }} /> : null}
      {covered || overFace ? <NoPerson /> : null}
      {f >= a ? <AbsoluteFill style={{ opacity: ease(f, a + 8, a + 16) }}>{children}</AbsoluteFill> : null}
      {cta ? (
        <Say y={y} size={ctaSize} width={1000} font={font} weight={800} color={ink}
          style={{ transform: `scale(${grow * (0.6 + 0.4 * ctaIn)})`, opacity: Math.min(1, ctaIn * 1.5), WebkitTextStroke: `${(14 * (1 - glide)).toFixed(1)}px ${paper}`, paintOrder: "stroke fill" }}>{cta}</Say>
      ) : null}
      {name && f >= a + 12 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: nameTop, display: "flex", justifyContent: "center", transform: `scale(${0.6 + 0.4 * nameIn})`, opacity: Math.min(1, nameIn * 1.5) }}>
          <div style={{ fontFamily: font, fontWeight: 800, fontSize: Math.round(size * 0.62), lineHeight: 1.15, padding: `${size * 0.1}px ${size * 0.4}px`, borderRadius: 999,
            background: check ? "transparent" : paper, border: check ? "none" : `${Math.max(4, Math.round(size / 18))}px solid ${accent}`, color: check ? "#ff00ff" : accent }}>{name}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
