// Edit mode: follow the face through the video, so the frame keeps the person centred when they move.
// No extra software: it compares small grey pictures (normalised correlation) frame after frame.
import { ALIGN, ff, ffRaw, fail, probe } from "./edit-core.mjs";

// A still with a 10 by 10 grid, so Claude can read where the face is as fractions of the frame.
export function faceGuide(video, at, outPng) {
  ff(["-v", "error", "-y", "-ss", String(at), "-i", video, "-frames:v", "1", "-vf", "drawgrid=w=iw/10:h=ih/10:t=2:c=red@0.55,drawgrid=w=iw/2:h=ih/2:t=4:c=red@0.9", outPng]);
}

const W = 160, FPS = 8;
function frames(video) {
  const m = probe(video);
  const H = Math.round((W * m.height) / m.width / 2) * 2;
  const buf = ffRaw(["-v", "error", "-i", video, "-an", "-vf", `fps=${FPS},scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"]);
  const n = Math.floor(buf.length / (W * H));
  return { buf, n, H, duration: m.duration };
}

function patch(buf, f, H, cx, cy, tw, th) {
  const out = new Float32Array(tw * th);
  const x0 = Math.round(cx - tw / 2), y0 = Math.round(cy - th / 2);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const px = Math.min(W - 1, Math.max(0, x0 + x)), py = Math.min(H - 1, Math.max(0, y0 + y));
    out[y * tw + x] = buf[f * W * H + py * W + px];
  }
  return out;
}
const stats = (a) => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) * (v - m); return [m, Math.sqrt(s) || 1]; };
function ncc(t, tm, ts, p) {
  const [pm, ps] = stats(p);
  let sum = 0;
  for (let i = 0; i < t.length; i++) sum += (t[i] - tm) * (p[i] - pm);
  return sum / (ts * ps);
}

// face: { x, y, w } as fractions of the frame (w = how wide the face is, ear to ear).
export function trackFace(video, face) {
  const { buf, n, H, duration } = frames(video);
  if (n < 2) fail("the video is too short to follow a face");
  const tw = Math.max(16, Math.round(face.w * W)), th = Math.round(tw * 1.2);
  let cx = face.x * W, cy = face.y * H;
  let tpl = patch(buf, 0, H, cx, cy, tw, th);
  let [tm, ts] = stats(tpl);
  const xs = [face.x], ys = [face.y], scores = [1];
  for (let f = 1; f < n; f++) {
    const search = (r, ox, oy) => {
      let best = { s: -2, x: ox, y: oy };
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = ox + dx, y = oy + dy;
        if (x - tw / 2 < 0 || y - th / 2 < 0 || x + tw / 2 > W || y + th / 2 > H) continue;
        const s = ncc(tpl, tm, ts, patch(buf, f, H, x, y, tw, th));
        if (s > best.s) best = { s, x, y };
      }
      return best;
    };
    let b = search(5, Math.round(cx), Math.round(cy));
    if (b.s < 0.55) { const wide = search(22, Math.round(cx), Math.round(cy)); if (wide.s > b.s) b = wide; }
    if (b.s >= 0.5) { cx = b.x; cy = b.y; }
    if (b.s > 0.85) { // follow slow changes of the face (a turn, a smile)
      const p = patch(buf, f, H, cx, cy, tw, th);
      for (let i = 0; i < tpl.length; i++) tpl[i] = tpl[i] * 0.93 + p[i] * 0.07;
      [tm, ts] = stats(tpl);
    }
    xs.push(cx / W); ys.push(cy / H); scores.push(b.s);
  }
  // Smooth, and hold still for small movements so the frame does not jitter.
  const dead = face.w * 0.12;
  const ema = (arr, d) => { let v = arr[0]; const o = [v]; for (let i = 1; i < arr.length; i++) { const t = v + (arr[i] - v) * 0.2; v = Math.abs(arr[i] - v) < d ? v : t; o.push(+v.toFixed(4)); } return o; };
  const lost = scores.filter((s) => s < 0.5).length / scores.length;
  return { track: { step: 1 / FPS, x: ema(xs, dead), y: ema(ys, dead) }, lost, frames: n, duration };
}
