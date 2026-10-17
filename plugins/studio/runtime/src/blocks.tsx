import React from 'react';
import {flushSync} from 'react-dom';
import {continueRender, delayRender} from 'remotion';
import {getLength, getPointAtLength, interpolatePath} from '@remotion/paths';
import {PopHeadline} from './chibi';
import {BrushStroke} from './sketch';
import {fontsReady} from './fonts';
import {
  StyleTokens,
  clamp,
  cubicInOut,
  gray,
  hash,
  outFade,
  progress,
  quintOut,
} from './lib';

// Every block has: type, at (seconds), optional out (seconds).
// Times are absolute and already resolved from word refs by the CLI.
export type Block = {type: string; at: number; out?: number; id?: string; [k: string]: any};

type P = {b: Block; t: number; k: StyleTokens};

const widthOf = (k: StyleTokens, w?: string | number) =>
  typeof w === 'number' ? w : k.lineWidths[(w as keyof StyleTokens['lineWidths']) || 'primary'] ?? k.lineWidths.primary;

const inPalette = (k: StyleTokens, c?: string) => !!c && !!k.palette && c in k.palette;
const colorOf = (k: StyleTokens, c?: string) =>
  inPalette(k, c)
    ? gray(k.palette![c!])
    : gray(c === 'mid' ? k.mid : c === 'soft' ? k.soft : c === 'dark' ? k.dark : c === 'fill' ? k.fill : c === 'bg' ? k.bg : k.ink);

// fill: fill, dark, bg, a palette colour, or hatch (which takes the stroke colour when that is a palette colour).
const fillOf = (k: StyleTokens, f?: string, color?: string) =>
  f === 'hatch'
    ? `url(#hatch${inPalette(k, color) ? `-${color}` : ''})`
    : f === 'dark' || f === 'fill' || f === 'bg' || inPalette(k, f)
      ? colorOf(k, f)
      : 'none';

// ---------- label lettering (mono caps in 1.0 styles; styles may switch case, slant and size) ----------
const ls = (k: StyleTokens, n: number) => n * (k.type?.labelScale ?? 1);
const lc = (k: StyleTokens, s: unknown) => (k.type?.labelCase === 'none' ? String(s) : String(s).toUpperCase());
const labelFont = (k: StyleTokens) => ({fontFamily: k.fonts.mono, fontStyle: k.type?.labelStyle, fontWeight: k.type?.labelWeight});

// ---------- strokes ----------
const isChalk = (k: StyleTokens) => k.stroke?.style === 'chalk';
const CHALK_PASSES = [[0, 0, 1], [1.2, -0.8, 0.6], [-0.9, 1.0, 0.5]];

// One stroked line. In chalk styles it is laid down three times, slightly offset, for a soft broken edge.
const Line: React.FC<{k: StyleTokens; d: string; stroke: string; w: number} & React.SVGProps<SVGPathElement>> = ({k, d, stroke, w, ...rest}) => {
  // Brush styles lay a variable width ribbon instead of a stroke (only for lines that draw on; dashed lines stay plain).
  if (k.stroke?.style === 'brush' && rest.pathLength === 1 && typeof rest.strokeDasharray === 'string' && rest.strokeDasharray.endsWith(' 1.0001')) {
    return <BrushStroke d={d} stroke={stroke} w={w} frac={parseFloat(rest.strokeDasharray)} opacity={rest.opacity as number | undefined} />;
  }
  if (!isChalk(k)) return <path d={d} fill="none" stroke={stroke} strokeWidth={w} {...rest} />;
  return (
    <>
      {CHALK_PASSES.map(([dx, dy, o], i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={w} opacity={o} transform={i ? `translate(${dx},${dy})` : undefined} {...rest} />
      ))}
    </>
  );
};
const drawn = (p: number) => ({pathLength: 1, strokeDasharray: `${p} 1.0001`, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const});

// Two short strokes at the end of a path, pointing along it.
const arrowHead = (d: string, atStart: boolean, size: number) => {
  const len = getLength(d);
  const tip = getPointAtLength(d, atStart ? 0 : len);
  const back = getPointAtLength(d, atStart ? Math.min(len, 4) : Math.max(0, len - 4));
  const a = Math.atan2(tip.y - back.y, tip.x - back.x);
  return [1, -1].map((sgn) => {
    const b = a + (sgn * 150 * Math.PI) / 180;
    return `M${tip.x},${tip.y} L${tip.x + Math.cos(b) * size},${tip.y + Math.sin(b) * size}`;
  });
};

// ---------- written text: appears left to right behind a small tip, like chalk on a board ----------
const useTextWidth = () => {
  const ref = React.useRef<SVGTextElement>(null);
  const [w, setW] = React.useState<number | null>(null);
  const [, bump] = React.useState(0);
  React.useEffect(() => {
    // Measure again once the bundled fonts are in, so the reveal follows the real letter widths.
    const h = delayRender('measuring text');
    fontsReady.then(() => {
      flushSync(() => bump((n) => n + 1));
      continueRender(h);
    });
  }, []);
  React.useLayoutEffect(() => {
    const v = ref.current?.getComputedTextLength();
    if (v && Math.abs(v - (w ?? 0)) > 0.5) setW(v);
  });
  return [ref, w] as const;
};

export const writeDur = (k: StyleTokens, text: string) => Math.max(0.25, (text.length * (k.motion.writeMsPerChar ?? 45)) / 1000);

type WriteProps = {k: StyleTokens; t: number; at: number; text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; size: number; fill: string} & React.SVGProps<SVGTextElement>;
const WriteText: React.FC<WriteProps> = ({k, t, at, text, x, y, anchor, size, fill, ...font}) => {
  const id = useId('w');
  const [ref, measured] = useTextWidth();
  const p = progress(t, at, writeDur(k, text));
  const w = measured ?? text.length * size * 0.5;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const common = {textAnchor: anchor, fontSize: size, fill, ...font};
  return (
    <g>
      <clipPath id={id}>
        <rect x={x0 - size * 0.3} y={y - size * 1.2} width={(w + size * 0.6) * p} height={size * 1.8} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <text ref={ref} x={x} y={y} {...common}>
          {text}
        </text>
        {isChalk(k) && (
          <text x={x + 1.2} y={y - 0.8} opacity={0.5} {...common}>
            {text}
          </text>
        )}
      </g>
      {p > 0 && p < 1 && <circle cx={x0 + w * p} cy={y - size * 0.3} r={Math.max(3, size * 0.06)} fill={fill} />}
    </g>
  );
};

let uid = 0;
const useId = (p: string) => React.useMemo(() => `${p}${uid++}`, [p]);

// ---------- path: a shape that draws itself, fill fades in after ----------
// arrow: true or "both" adds arrowheads as the line finishes. pulse: true makes it throb gently once drawn.
export const PathBlock: React.FC<P> = ({b, t, k}) => {
  const id = useId('m');
  const dur = b.dur ?? k.motion.drawDefault;
  const p = cubicInOut(progress(t, b.at, dur));
  const w = widthOf(k, b.width ?? (b.dashed ? 'construction' : 'primary'));
  const heads = React.useMemo(
    () => (b.arrow ? [...arrowHead(b.d, false, 14 + w * 3), ...(b.arrow === 'both' ? arrowHead(b.d, true, 14 + w * 3) : [])] : []),
    [b.d, b.arrow, w],
  );
  if (p <= 0) return null;
  const fillP = quintOut(progress(t, b.at + dur * 0.85, 0.45));
  const dash = b.dashed === true ? k.dashes.construction : b.dashed === 'dotted' ? k.dashes.dotted : undefined;
  const stroke = colorOf(k, b.color ?? (b.dashed ? 'soft' : 'ink'));
  const fill = fillOf(k, b.fill, b.color);
  const pulse = b.pulse && p >= 1 ? 0.875 + 0.125 * Math.cos(((t - b.at - dur) * 2 * Math.PI) / 1.1) : 1;
  const op = outFade(t, b.out) * pulse;
  const hp = progress(p, 0.85, 0.15);
  return (
    <g opacity={op}>
      {fill !== 'none' && <path d={b.d} fill={fill} opacity={fillP} />}
      {dash ? (
        <>
          <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={4000} height={4000}>
            <path d={b.d} fill="none" stroke="#fff" strokeWidth={w + 6} pathLength={1} strokeDasharray={`${p} 1`} strokeLinecap="round" />
          </mask>
          <g mask={`url(#${id})`}>
            <Line k={k} d={b.d} stroke={stroke} w={w} strokeDasharray={dash.join(' ')} />
          </g>
        </>
      ) : (
        <Line k={k} d={b.d} stroke={stroke} w={w} {...drawn(p)} />
      )}
      {hp > 0 && heads.map((h, i) => <Line key={i} k={k} d={h} stroke={stroke} w={w} {...drawn(hp)} />)}
    </g>
  );
};

// ---------- morph: the connective element changing shape ----------
// keys: [{t, d}] shapes it moves through; each change eases over `dur`.
export const MorphBlock: React.FC<P> = ({b, t, k}) => {
  const keys: {t: number; d: string}[] = b.keys;
  if (t < keys[0].t) return null;
  const dur = b.dur ?? 0.7;
  let d = keys[0].d;
  let fadeTo: {d: string; p: number} | null = null; // shapes built from different kinds of segments cannot be morphed point to point, so they cross fade
  for (let i = 1; i < keys.length; i++) {
    if (t >= keys[i].t) {
      const p = cubicInOut(progress(t, keys[i].t, dur));
      fadeTo = null;
      if (p >= 1) d = keys[i].d;
      else {
        try {
          d = interpolatePath(p, keys[i - 1].d, keys[i].d);
        } catch {
          d = keys[i - 1].d;
          fadeTo = {d: keys[i].d, p};
        }
      }
    }
  }
  const drawP = cubicInOut(progress(t, keys[0].t, b.drawDur ?? k.motion.drawDefault));
  const w = widthOf(k, b.width);
  const fill = b.fill === 'bg' ? 'none' : fillOf(k, b.fill, b.color);
  return (
    <g opacity={outFade(t, b.out)}>
      {fill !== 'none' && <path d={d} fill={fill} opacity={quintOut(progress(t, keys[0].t + 0.5, 0.4))} />}
      <Line k={k} d={d} stroke={colorOf(k, b.color)} w={w} {...drawn(drawP)} opacity={fadeTo ? 1 - fadeTo.p : undefined} />
      {fadeTo && <Line k={k} d={fadeTo.d} stroke={colorOf(k, b.color)} w={w} {...drawn(drawP)} opacity={fadeTo.p} />}
    </g>
  );
};

// ---------- dot: solid dot, optional ring and pulse ----------
export const DotBlock: React.FC<P> = ({b, t, k}) => {
  const p = quintOut(progress(t, b.at, 0.35));
  if (p <= 0) return null;
  const r = b.r ?? 7;
  const pulse = b.pulse ? ((t - b.at) % 1.4) / 1.4 : -1;
  return (
    <g opacity={outFade(t, b.out)}>
      {b.ring !== false && <circle cx={b.x} cy={b.y} r={r * 2.4 * p} fill="none" stroke={colorOf(k, b.color)} strokeWidth={k.lineWidths.secondary} />}
      {pulse >= 0 && (
        <circle cx={b.x} cy={b.y} r={r * (2.4 + 4 * pulse)} fill="none" stroke={gray(k.mid)} strokeWidth={1.2} opacity={1 - pulse} />
      )}
      <circle cx={b.x} cy={b.y} r={r * p} fill={b.hollow ? gray(k.bg) : colorOf(k, b.color)} stroke={colorOf(k, b.color)} strokeWidth={b.hollow ? 2 : 0} />
    </g>
  );
};

// ---------- label: dot at target, elbow leader to margin, typed mono text ----------
export const LabelBlock: React.FC<P> = ({b, t, k}) => {
  const pop = quintOut(progress(t, b.at, 0.3));
  if (pop <= 0) return null;
  const [tx, ty] = b.target as [number, number];
  const right = (b.side ?? 'right') === 'right';
  const mx = right ? 1080 - k.margins : k.margins;
  const ly = b.labelY ?? ty;
  const ex = tx + (right ? 1 : -1) * Math.min(Math.abs(ly - ty) * 0.6 + 30, Math.abs(mx - tx) * 0.5);
  const pts: [number, number][] = [[tx, ty], [ex, ly], [mx, ly]];
  const l1 = Math.hypot(ex - tx, ly - ty);
  const l2 = Math.abs(mx - ex);
  const lp = cubicInOut(progress(t, b.at + 0.15, 0.45)) * (l1 + l2);
  const d =
    lp <= l1
      ? `M${tx},${ty} L${tx + ((ex - tx) * lp) / l1},${ty + ((ly - ty) * lp) / l1}`
      : `M${tx},${ty} L${ex},${ly} L${ex + (mx - ex) * ((lp - l1) / l2)},${ly}`;
  const text: string = lc(k, b.text);
  const ink = colorOf(k, b.color);
  const typeStart = b.at + 0.5;
  const n = Math.floor(clamp((t - typeStart) / (k.motion.typeMsPerChar / 1000), 0, text.length));
  const op = outFade(t, b.out);
  const lw = isChalk(k) ? k.lineWidths.construction : 1.4;
  void pts;
  return (
    <g opacity={op}>
      <circle cx={tx} cy={ty} r={11 * pop} fill="none" stroke={ink} strokeWidth={lw} />
      <circle cx={tx} cy={ty} r={4.5 * pop} fill={ink} />
      <path d={d} fill="none" stroke={ink} strokeWidth={lw} />
      <text
        x={mx}
        y={ly - ls(k, 14)}
        textAnchor={right ? 'end' : 'start'}
        {...labelFont(k)}
        fontSize={ls(k, b.size ?? 22)}
        letterSpacing={k.monoTracking}
        fill={ink}
      >
        {text.slice(0, n)}
      </text>
      {b.sub && (
        <text x={mx} y={ly + ls(k, 30)} textAnchor={right ? 'end' : 'start'} {...labelFont(k)} fontSize={ls(k, 18)} letterSpacing={k.monoTracking} fill={gray(k.mid)} opacity={quintOut(progress(t, typeStart + text.length * 0.035, 0.4))}>
          {lc(k, b.sub)}
        </text>
      )}
    </g>
  );
};

// Headline for styles that write their text: kicker, then each line in turn, then an underline.
const WrittenHeadline: React.FC<P> = ({b, t, k}) => {
  const size = b.size ?? 110;
  const lh = size * 1.12;
  const x = b.x ?? 540;
  const anchor = b.align === 'left' ? 'start' : b.align === 'right' ? 'end' : 'middle';
  const lines: string[] = b.lines;
  const kicker = b.kicker ? lc(k, b.kicker) : '';
  let at = b.at + (kicker ? writeDur(k, kicker) + 0.1 : 0);
  const starts = lines.map((s) => {
    const t0 = at;
    at += writeDur(k, s) * 0.6 + 0.05; // headline letters are big; write them a little faster
    return t0;
  });
  const underline = b.underline === false ? undefined : typeof b.underline === 'string' ? b.underline : k.type?.headlineUnderline;
  const widest = Math.max(...lines.map((s) => s.length)) * size * 0.47;
  const ux = anchor === 'middle' ? x - widest / 2 : anchor === 'end' ? x - widest : x;
  const uy = b.y + (lines.length - 1) * lh + size * 0.26;
  const up = cubicInOut(progress(t, at, 0.45));
  return (
    <g opacity={outFade(t, b.out)}>
      {kicker && t >= b.at && (
        <WriteText k={k} t={t} at={b.at} text={kicker} x={x} y={b.y - size - ls(k, 14)} anchor={anchor} size={ls(k, 26)} fill={gray(k.mid)} {...labelFont(k)} />
      )}
      {lines.map((s, i) =>
        t < starts[i] ? null : (
          <WriteText
            key={i}
            k={{...k, motion: {...k.motion, writeMsPerChar: (k.motion.writeMsPerChar ?? 45) * 0.6}}}
            t={t}
            at={starts[i]}
            text={s}
            x={x}
            y={b.y + i * lh}
            anchor={anchor}
            size={size}
            fill={colorOf(k, b.color)}
            fontFamily={k.fonts.headline}
            fontWeight={k.type?.headlineWeight ?? 300}
            letterSpacing={size * (k.type?.headlineTracking ?? -0.02)}
          />
        ),
      )}
      {underline && up > 0 && (
        <Line k={k} d={`M${ux - 8},${uy + 3} Q${ux + widest / 2},${uy - 5} ${ux + widest + 8},${uy}`} stroke={colorOf(k, underline)} w={widthOf(k, 'primary')} {...drawn(up)} />
      )}
    </g>
  );
};

// ---------- text: mono kicker plus masked slide up headline lines ----------
export const TextBlock: React.FC<P> = ({b, t, k}) => {
  if (k.type?.reveal === 'write') return <WrittenHeadline b={b} t={t} k={k} />;
  if (k.type?.reveal === 'pop') return <PopHeadline b={b} t={t} k={k} />;
  const size = b.size ?? 110;
  const lh = size * 1.12;
  const x = b.x ?? 540;
  const anchor = b.align === 'left' ? 'start' : b.align === 'right' ? 'end' : 'middle';
  const lines: string[] = b.lines;
  const op = outFade(t, b.out);
  const id = useId('c');
  return (
    <g opacity={op}>
      {b.kicker && (
        <g>
          <clipPath id={`${id}k`}>
            <rect x={0} y={b.y - size - 60} width={4000} height={44} />
          </clipPath>
          <text
            clipPath={`url(#${id}k)`}
            x={x}
            y={b.y - size - 26 + 40 * (1 - quintOut(progress(t, b.at, k.motion.revealDur)))}
            textAnchor={anchor}
            {...labelFont(k)}
            fontSize={26}
            letterSpacing={k.monoTracking + 2}
            fill={gray(k.mid)}
          >
            {lc(k, b.kicker)}
          </text>
        </g>
      )}
      {lines.map((s, i) => {
        const t0 = b.at + (b.kicker ? 0.12 : 0) + i * 0.13;
        const p = quintOut(progress(t, t0, k.motion.revealDur));
        const baseY = b.y + i * lh;
        return (
          <g key={i}>
            <clipPath id={`${id}${i}`}>
              <rect x={0} y={baseY - size * 0.95} width={4000} height={size * 1.25} />
            </clipPath>
            <text
              clipPath={`url(#${id}${i})`}
              x={x}
              y={baseY + size * 1.1 * (1 - p)}
              textAnchor={anchor}
              fontFamily={k.fonts.headline}
              fontWeight={k.type?.headlineWeight ?? 300}
              fontSize={size}
              letterSpacing={size * (k.type?.headlineTracking ?? -0.02)}
              fill={colorOf(k, b.color)}
            >
              {s}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// ---------- note: small mono caption ----------
export const NoteBlock: React.FC<P> = ({b, t, k}) => {
  const p = quintOut(progress(t, b.at, 0.5));
  if (p <= 0) return null;
  const anchor = b.align === 'left' ? 'start' : b.align === 'right' ? 'end' : 'middle';
  if (k.type?.reveal === 'write') {
    return (
      <g opacity={outFade(t, b.out)}>
        <WriteText k={k} t={t} at={b.at} text={lc(k, b.text)} x={b.x ?? 540} y={b.y} anchor={anchor} size={ls(k, b.size ?? 20)} fill={colorOf(k, b.color ?? 'ink')} letterSpacing={k.monoTracking} {...labelFont(k)} />
      </g>
    );
  }
  return (
    <text
      x={b.x ?? 540}
      y={b.y + 12 * (1 - p)}
      opacity={p * outFade(t, b.out)}
      textAnchor={anchor}
      {...labelFont(k)}
      fontSize={ls(k, b.size ?? 20)}
      letterSpacing={k.monoTracking}
      fill={colorOf(k, b.color ?? 'mid')}
    >
      {lc(k, b.text)}
    </text>
  );
};

// ---------- counter: big light numerals counting up ----------
export const CounterBlock: React.FC<P> = ({b, t, k}) => {
  const p = quintOut(progress(t, b.at, b.dur ?? 1.4));
  if (t < b.at) return null;
  const from = b.from ?? 0;
  const v = from + (b.value - from) * p;
  const txt = v.toFixed(b.decimals ?? 0);
  const size = b.size ?? 196;
  const op = outFade(t, b.out) * quintOut(progress(t, b.at, 0.3));
  return (
    <g opacity={op}>
      <text x={b.x ?? 540} y={b.y} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={k.type?.headlineWeight ?? 300} fontSize={size} letterSpacing={-size * 0.03} fill={colorOf(k, b.color)}>
        {txt}
        {b.unit && (
          <tspan {...labelFont(k)} fontSize={ls(k, 30)} letterSpacing={k.monoTracking} fill={gray(k.mid)} dx={14}>
            {lc(k, b.unit)}
          </tspan>
        )}
      </text>
      {b.caption && (
        <text x={b.x ?? 540} y={b.y + ls(k, 64)} textAnchor="middle" {...labelFont(k)} fontSize={ls(k, 22)} letterSpacing={k.monoTracking} fill={gray(k.mid)}>
          {lc(k, b.caption)}
        </text>
      )}
    </g>
  );
};

// ---------- ruler: axis with ticks, band and marker ----------
export const RulerBlock: React.FC<P> = ({b, t, k}) => {
  const p = cubicInOut(progress(t, b.at, 0.8));
  if (p <= 0) return null;
  const {x1, x2, y} = b;
  const ticks = b.ticks ?? 10;
  const xe = x1 + (x2 - x1) * p;
  const mp = quintOut(progress(t, b.markerAt ?? b.at + 0.8, 0.8));
  const mx = x1 + (x2 - x1) * ((b.markerFrom ?? 0) + ((b.marker ?? 0.5) - (b.markerFrom ?? 0)) * mp);
  return (
    <g opacity={outFade(t, b.out)}>
      {b.band && (
        <rect x={x1 + (x2 - x1) * b.band[0]} y={y - 18} width={(x2 - x1) * (b.band[1] - b.band[0])} height={36} fill={gray(k.fill)} opacity={quintOut(progress(t, b.at + 0.6, 0.5))} />
      )}
      <line x1={x1} y1={y} x2={xe} y2={y} stroke={gray(k.ink)} strokeWidth={1.6} />
      {Array.from({length: ticks + 1}, (_, i) => {
        const x = x1 + ((x2 - x1) * i) / ticks;
        if (x > xe + 0.5) return null;
        const big = i % 5 === 0;
        return <line key={i} x1={x} y1={y} x2={x} y2={y + (big ? 18 : 10)} stroke={gray(k.ink)} strokeWidth={1.2} />;
      })}
      {(b.ends ?? []).map((s: string, i: number) => (
        <text key={i} x={i ? x2 : x1} y={y + ls(k, 50)} textAnchor={i ? 'end' : 'start'} {...labelFont(k)} fontSize={ls(k, 18)} letterSpacing={k.monoTracking} fill={gray(k.mid)} opacity={p}>
          {lc(k, s)}
        </text>
      ))}
      {b.marker !== undefined && mp > 0 && <path d={`M${mx},${y - 6} l-10,-18 h20 z`} fill={gray(k.ink)} opacity={mp} />}
    </g>
  );
};

// ---------- mark: a teacher's highlight move over something already on screen ----------
// kind: circle, box, underline, cross, tick or burst. x, y is the centre of the thing; w, h its size.
const markStrokes = (b: Block): string[] => {
  const {x, y} = b;
  const w = b.w ?? 200;
  const h = b.h ?? 80;
  const j = (n: number, amt = 5) => (hash(x, y, w, n) - 0.5) * 2 * amt; // steady hand wobble
  const L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2;
  switch (b.kind) {
    case 'circle': {
      const pts: string[] = [];
      for (let i = 0; i <= 44; i++) {
        const a = (-110 + (395 * i) / 44) * (Math.PI / 180);
        const grow = 1 + 0.06 * (i / 44); // ends overlap a little, like a loop drawn by hand
        pts.push(`${(x + Math.cos(a) * (w / 2 + 14) * grow).toFixed(1)},${(y + Math.sin(a) * (h / 2 + 12) * grow).toFixed(1)}`);
      }
      return [`M${pts.join(' L')}`];
    }
    case 'box':
      return [`M${L - 14 + j(1)},${T - 10} L${R + 14},${T - 10 + j(2)} L${R + 12 + j(3)},${B + 10} L${L - 12},${B + 10 + j(4)} L${L - 14 + j(5)},${T - 18}`];
    case 'underline':
      return [`M${L},${B + 8 + j(1, 3)} Q${x},${B + 4 + j(2, 3)} ${R},${B + 8 + j(3, 3)}`];
    case 'cross':
      return [`M${L + j(1)},${T + j(2)} L${R + j(3)},${B + j(4)}`, `M${R + j(5)},${T + j(6)} L${L + j(7)},${B + j(8)}`];
    case 'tick':
      return [`M${L},${y + h * 0.05} L${L + w * 0.33},${B} L${R},${T}`];
    case 'burst': {
      const n = b.rays ?? 8;
      const len = b.len ?? 34;
      return Array.from({length: n}, (_, i) => {
        const a = ((i + 0.5) / n) * 2 * Math.PI + j(i, 0.12);
        const c = Math.cos(a), s = Math.sin(a);
        const r0x = x + c * (w / 2 + 12), r0y = y + s * (h / 2 + 12);
        const pt = (f: number, side: number) => `${(r0x + c * len * f - s * side).toFixed(1)},${(r0y + s * len * f + c * side).toFixed(1)}`;
        return `M${pt(0, 0)} L${pt(0.33, 6)} L${pt(0.66, -6)} L${pt(1, 0)}`;
      });
    }
    default:
      return [];
  }
};

export const MarkBlock: React.FC<P> = ({b, t, k}) => {
  const strokes = React.useMemo(() => markStrokes(b), [b]);
  const dur = b.dur ?? (b.kind === 'circle' || b.kind === 'box' ? 0.6 : 0.4);
  const p = progress(t, b.at, dur);
  if (p <= 0) return null;
  const pulse = b.pulse && p >= 1 ? 0.875 + 0.125 * Math.cos(((t - b.at - dur) * 2 * Math.PI) / 1.1) : 1;
  const sequential = b.kind === 'cross';
  return (
    <g opacity={outFade(t, b.out) * pulse}>
      {strokes.map((d, i) => {
        const sp = cubicInOut(sequential ? clamp(p * strokes.length - i) : p);
        return sp > 0 ? <Line key={i} k={k} d={d} stroke={colorOf(k, b.color)} w={widthOf(k, b.width)} {...drawn(sp)} /> : null;
      })}
    </g>
  );
};

// ---------- travel: one dot that moves along a path, for demonstrations ----------
export const TravelBlock: React.FC<P> = ({b, t, k}) => {
  const len = React.useMemo(() => getLength(b.d), [b.d]);
  const pop = quintOut(progress(t, b.at, 0.25));
  if (pop <= 0) return null;
  const p = cubicInOut(progress(t, b.at + (b.delay ?? 0.15), b.dur ?? 2));
  const pt = getPointAtLength(b.d, len * p);
  const r = (b.r ?? 12) * pop;
  return (
    <g opacity={outFade(t, b.out)}>
      <circle cx={pt.x} cy={pt.y} r={r} fill={colorOf(k, b.color)} />
      {isChalk(k) && <circle cx={pt.x + 1.2} cy={pt.y - 0.8} r={r} fill={colorOf(k, b.color)} opacity={0.5} />}
    </g>
  );
};

// ---------- group: children moved by keyframes {t, x, y, scale, rotate, opacity} ----------
export const GroupBlock: React.FC<P & {render: (b: Block) => React.ReactNode}> = ({b, t, render}) => {
  const keys: any[] = b.keys ?? [{t: b.at}];
  const val = (prop: string, def: number) => {
    let v = keys[0][prop] ?? def;
    for (let i = 1; i < keys.length; i++) {
      const prev = v;
      const next = keys[i][prop] ?? prev;
      const p = cubicInOut(progress(t, keys[i].t, keys[i].dur ?? 0.7));
      v = prev + (next - prev) * p;
    }
    return v;
  };
  const ox = b.origin?.[0] ?? 540;
  const oy = b.origin?.[1] ?? 860;
  const tr = `translate(${val('x', 0)},${val('y', 0)}) translate(${ox},${oy}) rotate(${val('rotate', 0)}) scale(${val('scale', 1)}) translate(${-ox},${-oy})`;
  return (
    <g transform={tr} opacity={val('opacity', 1) * outFade(t, b.out)}>
      {(b.blocks as Block[]).map((c, i) => (
        <React.Fragment key={i}>{render(c)}</React.Fragment>
      ))}
    </g>
  );
};

export const BLOCK_TYPES = ['path', 'morph', 'dot', 'label', 'text', 'note', 'counter', 'ruler', 'mark', 'travel', 'cutout', 'ransom', 'face', 'shape', 'prop', 'person', 'badge', 'group'];
