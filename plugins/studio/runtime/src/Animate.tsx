import React from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  Block,
  CounterBlock,
  DotBlock,
  GroupBlock,
  LabelBlock,
  MarkBlock,
  MorphBlock,
  NoteBlock,
  PathBlock,
  RulerBlock,
  TextBlock,
  TravelBlock,
} from './blocks';
import {BadgeBlock, CaptionBlock, Iris, PageWipe, PersonBlock, PropBlock, ShapeBlock, StoryContext, TintSet} from './chibi';
import {HeroBlock} from './hero';
import {FrameBlock, InkSwipe, SplatBlock, StampBlock} from './sketch';
import {PosterArrow, PosterBanner, PosterBar, PosterBg, PosterButton, PosterCards, PosterDefs, PosterGauge, PosterHero, PosterJourney, PosterPanel, PosterRecap, PosterRing, PosterSlots, PosterSparks, PosterSplit, PosterStars, PosterSteps, PosterTile, PosterWord} from './poster';
import {BeanBadge, BeanBlock, BeanDraw, BeanInfo, BeanProp, BeanTitle} from './bean';
import {CutoutBlock, FaceBlock, PaperDefs, RansomBlock, Sheet, Table, sheetTransform} from './paper';
import {Style, clamp, cubicInOut, gray, hash, mergeTokens, progress, quintOut, StyleTokens} from './lib';
import {VoxAnimate} from './vox';

export type CamKey = {t: number; x?: number; y?: number; zoom?: number; dur?: number};
export type Scene = {id: string; start: number; end: number; camera?: 'push' | 'still'; exit?: boolean; blocks: Block[]; tint?: string; floor?: number | false; cam?: CamKey[]; transition?: 'cut' | 'iris' | 'page' | 'swipe' | 'slide' | 'pan' | 'zoom'; origin?: [number, number]};
export type Storyboard = {
  title?: string;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  variant?: string;
  palette?: Record<string, string>; // recolours named palette entries, e.g. {"lime": "#ff4fa3"}
  format?: '9:16' | '16:9';
  audio?: string; // file inside engine/public (copied by the CLI)
  header?: {left?: string; right?: string; at?: number; out?: number};
  scenes: Scene[];
  overlay?: Block[]; // blocks that live across scenes (connective element)
  cast?: Record<string, any>; // character looks, by name, for person blocks
  speech?: number[][]; // [start, end] of every spoken word, added by the CLI
};
export type AnimateProps = {style: Style; storyboard: Storyboard; silent?: boolean};

const renderBlock = (b: Block, t: number, k: StyleTokens): React.ReactNode => {
  if (b.at !== undefined && t < b.at - 0.001 && b.type !== 'group' && b.type !== 'morph') return null;
  switch (b.type) {
    case 'path':
      return <PathBlock b={b} t={t} k={k} />;
    case 'morph':
      return <MorphBlock b={b} t={t} k={k} />;
    case 'dot':
      return <DotBlock b={b} t={t} k={k} />;
    case 'label':
      return <LabelBlock b={b} t={t} k={k} />;
    case 'text':
      return <TextBlock b={b} t={t} k={k} />;
    case 'note':
      return <NoteBlock b={b} t={t} k={k} />;
    case 'counter':
      return <CounterBlock b={b} t={t} k={k} />;
    case 'ruler':
      return <RulerBlock b={b} t={t} k={k} />;
    case 'mark':
      return <MarkBlock b={b} t={t} k={k} />;
    case 'travel':
      return <TravelBlock b={b} t={t} k={k} />;
    case 'cutout':
      return <CutoutBlock b={b} t={t} k={k} render={(c) => renderBlock(c, t, k)} />;
    case 'ransom':
      return <RansomBlock b={b} t={t} k={k} />;
    case 'face':
      return <FaceBlock b={b} t={t} k={k} />;
    case 'shape':
      return <ShapeBlock b={b} t={t} k={k} />;
    case 'prop':
      return <PropBlock b={b} t={t} k={k} />;
    case 'person':
      return <PersonBlock b={b} t={t} k={k} />;
    case 'caption':
      return <CaptionBlock b={b} t={t} k={k} />;
    case 'badge':
      return <BadgeBlock b={b} t={t} k={k} />;
    case 'hero':
      return <HeroBlock b={b} t={t} k={k} />;
    case 'splat':
      return <SplatBlock b={b} t={t} k={k} />;
    case 'stamp':
      return <StampBlock b={b} t={t} k={k} />;
    case 'frame':
      return <FrameBlock b={b} t={t} k={k} />;
    case 'posterWord':
      return <PosterWord b={b} t={t} k={k} />;
    case 'posterHero':
      return <PosterHero b={b} t={t} k={k} />;
    case 'posterRing':
      return <PosterRing b={b} t={t} k={k} />;
    case 'posterCards':
      return <PosterCards b={b} t={t} k={k} />;
    case 'posterBanner':
      return <PosterBanner b={b} t={t} k={k} />;
    case 'posterArrow':
      return <PosterArrow b={b} t={t} k={k} />;
    case 'posterSparks':
      return <PosterSparks b={b} t={t} k={k} />;
    case 'posterStars':
      return <PosterStars b={b} t={t} k={k} />;
    case 'posterPanel':
      return <PosterPanel b={b} t={t} k={k} />;
    case 'posterBar':
      return <PosterBar b={b} t={t} k={k} />;
    case 'posterButton':
      return <PosterButton b={b} t={t} k={k} />;
    case 'posterTile':
      return <PosterTile b={b} t={t} k={k} />;
    case 'posterSlots':
      return <PosterSlots b={b} t={t} k={k} />;
    case 'posterSplit':
      return <PosterSplit b={b} t={t} k={k} />;
    case 'posterGauge':
      return <PosterGauge b={b} t={t} k={k} />;
    case 'posterSteps':
      return <PosterSteps b={b} t={t} k={k} />;
    case 'posterRecap':
      return <PosterRecap b={b} t={t} k={k} />;
    case 'posterJourney':
      return <PosterJourney b={b} t={t} k={k} />;
    case 'bean':
      return <BeanBlock b={b} t={t} k={k} />;
    case 'beanTitle':
      return <BeanTitle b={b} t={t} k={k} />;
    case 'beanBadge':
      return <BeanBadge b={b} t={t} k={k} />;
    case 'beanProp':
      return <BeanProp b={b} t={t} k={k} />;
    case 'beanDraw':
      return <BeanDraw b={b} t={t} k={k} />;
    case 'beanInfo':
      return <BeanInfo b={b} t={t} k={k} />;
    case 'group':
      if (b.at !== undefined && t < b.at) return null;
      return <GroupBlock b={b} t={t} k={k} render={(c) => renderBlock(c, t, k)} />;
    default:
      return null;
  }
};

const Grid: React.FC<{t: number; k: StyleTokens; W: number; H: number}> = ({t, k, W, H}) => {
  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  const lines: React.ReactNode[] = [];
  const op = (d: number) => quintOut(clamp((t * 1.15 - (d / maxD) * 0.75) / 0.35));
  const add = (major: boolean, step: number) => {
    for (let x = cx % step; x <= W; x += step) {
      const isMajor = Math.abs(((x - cx) / k.gridMajorStep) % 1) < 1e-6;
      if (!major && isMajor) continue;
      lines.push(<line key={`v${major}${x}`} x1={x} y1={0} x2={x} y2={H} stroke={gray(major ? k.gridMajor : k.gridMinor)} strokeWidth={1} opacity={op(Math.abs(x - cx))} />);
    }
    for (let y = cy % step; y <= H; y += step) {
      const isMajor = Math.abs(((y - cy) / k.gridMajorStep) % 1) < 1e-6;
      if (!major && isMajor) continue;
      lines.push(<line key={`h${major}${y}`} x1={0} y1={y} x2={W} y2={y} stroke={gray(major ? k.gridMajor : k.gridMinor)} strokeWidth={1} opacity={op(Math.abs(y - cy))} />);
    }
  };
  add(false, k.gridMinorStep);
  add(true, k.gridMajorStep);
  return <g>{lines}</g>;
};

// Texture images ship with the runtime (public/tex). Hold the frame until they are decoded.
const useTextures = (files: string[]) => {
  const key = files.join(',');
  React.useEffect(() => {
    if (!files.length) return;
    const h = delayRender(`loading textures ${key}`);
    Promise.all(
      files.map(
        (f) =>
          new Promise<void>((done) => {
            const img = new Image();
            img.onload = img.onerror = () => done();
            img.src = staticFile(f);
          }),
      ),
    ).then(() => continueRender(h));
  }, [key]);
};

const GRAIN = 'tex/chalk-grain.png';
const PAPER = 'tex/paper-grain.png';
const SMUDGE = 'tex/board-smudge.png';
const POSTER_GRAIN = 'tex/poster-grain.png';

// A wiped chalkboard: flat colour, cloudy smudges, slate grain and a soft vignette. It never moves.
const Board: React.FC<{k: StyleTokens; W: number; H: number}> = ({k, W, H}) => {
  const bg = k.background!;
  return (
    <g>
      <image href={staticFile(SMUDGE)} x={0} y={0} width={W} height={H} preserveAspectRatio="none" opacity={bg.smudge ?? 1} />
      <rect width={W} height={H} fill="url(#grainP)" opacity={bg.grain ?? 0.05} style={{mixBlendMode: 'overlay'}} />
      <rect width={W} height={H} fill="url(#vignette)" opacity={bg.vignette ?? 0.55} />
    </g>
  );
};

// Faint specks of dust drifting up through the dark: depth without scenery.
const Motes: React.FC<{t: number; k: StyleTokens; W: number; H: number}> = ({t, k, W, H}) => {
  const n = 46;
  return (
    <g fill={gray(k.ink)} opacity={k.background?.motes}>
      {Array.from({length: n}, (_, i) => {
        const sp = 4 + hash(i, 3) * 7;
        const span = H + 60; // wraps outside the frame, so a speck never jumps on screen
        const y = ((((hash(i, 2) * span - t * sp) % span) + span) % span) - 30;
        const x = hash(i, 1) * W + Math.sin(t * 0.18 + i) * 16;
        return <circle key={i} cx={x} cy={y} r={1.3 + hash(i, 4) * 2.4} opacity={0.4 + hash(i, 5) * 0.6} />;
      })}
    </g>
  );
};

const Frame: React.FC<{t: number; k: StyleTokens; W: number; H: number; header?: Storyboard['header']}> = ({t, k, W, H, header}) => {
  const {inset: i, arm: a} = k.corners;
  const p = cubicInOut(progress(t, 0.2, 0.8));
  const corners = k.chrome?.corners === false ? [] : [
    [i, i, 1, 1],
    [W - i, i, -1, 1],
    [i, H - i, 1, -1],
    [W - i, H - i, -1, -1],
  ].map(([x, y, sx, sy], n) => (
    <path key={n} d={`M${x},${y + sy * a * p} L${x},${y} L${x + sx * a * p},${y}`} fill="none" stroke={gray(k.ink)} strokeWidth={1.6} />
  ));
  let hdr: React.ReactNode = null;
  if (header && k.chrome?.header !== false) {
    const t0 = header.at ?? 0.4;
    const hp = cubicInOut(progress(t, t0, 0.9));
    const ho = header.out !== undefined ? 1 - progress(t, header.out, 0.4) : 1;
    const y = k.header.y;
    const x1 = k.margins;
    const x2 = W - k.margins;
    const tp = quintOut(progress(t, t0 + 0.4, 0.6));
    hdr = (
      <g opacity={ho}>
        <line x1={x1} y1={y + 22} x2={x1 + (x2 - x1) * hp} y2={y + 22} stroke={gray(k.ink)} strokeWidth={1.2} />
        {[0, 0.5, 1].map((f) => (f <= hp ? <line key={f} x1={x1 + (x2 - x1) * f} y1={y + 22} x2={x1 + (x2 - x1) * f} y2={y + 32} stroke={gray(k.ink)} strokeWidth={1.2} /> : null))}
        <text x={x1} y={y + 8 * (1 - tp)} opacity={tp} fontFamily={k.fonts.mono} fontSize={24} letterSpacing={k.monoTracking} fill={gray(k.ink)}>
          {(header.left ?? '').toUpperCase()}
        </text>
        <text x={x2} y={y + 8 * (1 - tp)} opacity={tp} textAnchor="end" fontFamily={k.fonts.mono} fontSize={24} letterSpacing={k.monoTracking} fill={gray(k.mid)}>
          {(header.right ?? '').toUpperCase()}
        </text>
      </g>
    );
  }
  return (
    <g>
      {corners}
      {hdr}
    </g>
  );
};

// A style with the "vox" token is drawn by its own stage (vox.tsx); every other style takes the path below, unchanged.
export const Animate: React.FC<AnimateProps> = (props) => (props.style.tokens.vox ? <VoxAnimate {...props} /> : <AnimateMain {...props} />);

const AnimateMain: React.FC<AnimateProps> = ({style, storyboard, silent}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const k = mergeTokens(style, storyboard.variant, storyboard.palette, W > H);
  // Stop motion styles hold each drawing: time only moves forward stepFps times a second.
  const stepFps = k.motion.stepFps;
  const t = stepFps ? Math.floor((frame / fps) * stepFps + 1e-6) / stepFps : frame / fps;
  const step = stepFps ? Math.round(t * stepFps) : 0;
  const last = storyboard.scenes[storyboard.scenes.length - 1];
  const table = k.background?.type === 'table';
  const tinted = k.background?.type === 'tint';
  const poster = k.background?.type === 'poster';
  const keyCam = k.camera === 'keys';
  const now = storyboard.scenes.find((s) => t >= s.start && t <= s.end + 0.001) ?? last;
  // Camera for styles that key it per scene: focus point and zoom, a small punch on each cut, a shake on impacts.
  const camOf = (s: Scene) => {
    let x = W / 2, y = H / 2, zoom = 1;
    for (const c of s.cam ?? []) {
      const p = cubicInOut(progress(t, c.t, c.dur ?? 0.6));
      x += ((c.x ?? x) - x) * p;
      y += ((c.y ?? y) - y) * p;
      zoom += ((c.zoom ?? zoom) - zoom) * p;
    }
    if (s !== storyboard.scenes[0] && s.transition !== 'iris') zoom *= 1 + 0.045 * (1 - quintOut(progress(t, s.start, 0.3)));
    let sx = 0, sy = 0;
    const hit = (b: Block) => {
      if (b.shake && t >= b.at && t < b.at + 0.4) {
        const e = t - b.at;
        sx += Math.sin(e * 75) * 16 * (1 - e / 0.4);
        sy += Math.cos(e * 61) * 10 * (1 - e / 0.4);
      }
      (b.blocks as Block[] | undefined)?.forEach(hit);
    };
    s.blocks.forEach(hit);
    // a slow drift of a few pixels, so the camera never fully stops
    const cd = k.cameraDrift ?? 0;
    if (cd) (sx += cd * Math.sin(t * 0.41), (sy += cd * Math.sin(t * 0.33 + 1.7)));
    return `translate(${W / 2 + sx},${H / 2 + sy}) scale(${zoom}) translate(${-x},${-y})`;
  };
  const paper = !!k.paper;
  const board = k.background?.type === 'board';
  const chalk = k.stroke?.style === 'chalk';
  const additive = k.scenes === 'additive';
  useTextures([...(board || chalk ? [GRAIN] : []), ...(board ? [SMUDGE] : []), ...(paper || k.finish ? [PAPER] : []), ...(poster && k.poster?.grain ? [POSTER_GRAIN] : [])]);
  const D = storyboard.duration;
  // Hand made wobble: the whole frame shifts a little and the light flickers on every new drawing.
  const fj = k.jitter?.frame ?? 0;
  const shake = fj ? `translate(${((hash(step, 1) - 0.5) * 2 * fj).toFixed(2)},${((hash(step, 2) - 0.5) * 2 * fj).toFixed(2)})` : undefined;
  const flicker = k.jitter?.flicker ? (hash(step, 3) - 0.5) * 2 * k.jitter.flicker : 0;
  // Blocks that are not paper pieces still get a small nudge so ink lines never sit perfectly still.
  const nudge = (i: number, n: number) =>
    k.jitter && !paper ? undefined : k.jitter ? `translate(${((hash(step, i, n, 4) - 0.5) * 2.4).toFixed(2)},${((hash(step, i, n, 5) - 0.5) * 2.4).toFixed(2)})` : undefined;
  // The whole page drifts a few pixels and tilts a little on a smooth path (real time, so it stays smooth while drawings step).
  const pg = k.page;
  const rt = frame / fps;
  const nowIdx = Math.max(0, storyboard.scenes.indexOf(now));
  const jump = pg && nowIdx > 0 ? (1 - quintOut(progress(t, now.start, 0.35))) * (pg.shift ?? 0) : 0;
  const pageT = pg
    ? `translate(${(pg.drift * (0.6 * Math.sin(rt * 0.37) + 0.4 * Math.sin(rt * 0.91 + 1.3)) + (hash(nowIdx, 7) - 0.5) * 2 * jump).toFixed(2)},${(pg.drift * (0.6 * Math.sin(rt * 0.43 + 2.1) + 0.4 * Math.sin(rt * 0.83 + 0.4)) + (hash(nowIdx, 8) - 0.5) * 2 * jump).toFixed(2)}) rotate(${(pg.rot * Math.sin(rt * 0.29 + 0.7)).toFixed(3)},${W / 2},${H / 2})`
    : undefined;
  const pm = pg ? 90 : 0;
  const fade = Math.max(
    k.fade?.in ? 1 - progress(t, 0, k.fade.in) : 0,
    k.fade?.out ? progress(t, D - k.fade.out, k.fade.out) : 0,
  );

  return (
    <StoryContext.Provider value={{cast: storyboard.cast, speech: storyboard.speech, W, H}}>
    <AbsoluteFill style={{backgroundColor: gray(k.bg)}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={10} stroke={gray(k.mid)} strokeWidth={1.3} />
          </pattern>
          {Object.entries(k.palette ?? {}).map(([name, c]) => (
            <pattern key={name} id={`hatch-${name}`} patternUnits="userSpaceOnUse" width={chalk ? 16 : 10} height={chalk ? 16 : 10} patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={16} stroke={gray(c)} strokeWidth={chalk ? k.lineWidths.construction : 1.3} />
            </pattern>
          ))}
          {paper && <PaperDefs k={k} grain={staticFile(PAPER)} />}
          {k.poster && <PosterDefs k={k} />}
          {!paper && k.finish && (
            <pattern id="paperGrain" patternUnits="userSpaceOnUse" width={512} height={512}>
              <image href={staticFile(PAPER)} width={512} height={512} />
            </pattern>
          )}
          {k.hatch &&
            [['ink1', 0.22, false], ['ink2', 0.2, true], ['ink3', 0.38, true], ['ink4', 0.56, true], ['inkLine', 0.22, false]].map(([id, w, cross]) => {
              const st = k.hatch!.step;
              return (
                <pattern key={id as string} id={id as string} patternUnits="userSpaceOnUse" width={st} height={st} patternTransform="rotate(45)">
                  {id !== 'inkLine' && <rect width={st} height={st} fill={gray(k.hatch!.paper)} />}
                  <rect width={st} height={st * (w as number)} fill={gray(k.hatch!.ink)} />
                  {cross && <rect width={st * (w as number)} height={st} fill={gray(k.hatch!.ink)} />}
                </pattern>
              );
            })}
          {k.hatch && (
            <linearGradient id="hatchFloor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.75} />
              <stop offset="9%" stopColor="#fff" stopOpacity={0.12} />
              <stop offset="40%" stopColor="#fff" stopOpacity={0} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0.8} />
            </linearGradient>
          )}
          {(k.background?.dots || k.rig?.shadeStyle === 'dots') && (
            <>
              <pattern id="benday" patternUnits="userSpaceOnUse" width={15} height={15} patternTransform="rotate(45)">
                <circle cx={7.5} cy={7.5} r={3.7} fill="#000" />
              </pattern>
              <pattern id="bendayS" patternUnits="userSpaceOnUse" width={6.4} height={6.4} patternTransform="rotate(45)">
                <circle cx={3.2} cy={3.2} r={1.75} fill="#000" />
              </pattern>
            </>
          )}
          {k.finish?.stitch && (
            <>
              <filter id="stitchPixels" x="0" y="0" width={W} height={H} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
                <feFlood x={k.finish.stitch / 2 - 0.5} y={k.finish.stitch / 2 - 0.5} width={1} height={1} />
                <feComposite width={k.finish.stitch} height={k.finish.stitch} />
                <feTile result="grid" />
                <feComposite in="SourceGraphic" in2="grid" operator="in" />
                <feMorphology operator="dilate" radius={k.finish.stitch / 2} />
              </filter>
              <pattern id="stitchTex" patternUnits="userSpaceOnUse" width={k.finish.stitch} height={k.finish.stitch}>
                <path d={`M0,0 L${k.finish.stitch},${k.finish.stitch}`} stroke="#fff" strokeWidth={k.finish.stitch * 0.24} opacity={0.24} />
                <path d={`M${k.finish.stitch},0 L0,${k.finish.stitch}`} stroke="#000" strokeWidth={k.finish.stitch * 0.24} opacity={0.18} />
                <path d={`M0,0 H${k.finish.stitch} M0,0 V${k.finish.stitch}`} stroke="#000" strokeWidth={1.4} opacity={0.24} />
              </pattern>
            </>
          )}
          {k.finish?.rough && (
            <filter id="roughInk" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
              <feTurbulence type="fractalNoise" baseFrequency={0.035} numOctaves={2} seed={7} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={k.finish.rough} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          )}
          {tinted && (
            <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity={1} />
              <stop offset="100%" stopColor="#000" stopOpacity={0} />
            </linearGradient>
          )}
          {(table || (k.finish && !board && !chalk)) && (
            <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
              <stop offset="45%" stopColor="#000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000" stopOpacity={1} />
            </radialGradient>
          )}
          {(board || chalk) && (
            <>
              <pattern id="grainP" patternUnits="userSpaceOnUse" width={512} height={512}>
                <image href={staticFile(GRAIN)} width={512} height={512} />
              </pattern>
              <mask id="chalkMask" maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <rect width={W} height={H} fill="url(#grainP)" />
              </mask>
              <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
                <stop offset="45%" stopColor="#000" stopOpacity={0} />
                <stop offset="100%" stopColor="#000" stopOpacity={1} />
              </radialGradient>
            </>
          )}
        </defs>
        <g transform={pageT}>
        {poster || k.background?.type === 'plain' ? <rect width={W} height={H} fill={gray(k.bg)} /> : board ? <Board k={k} W={W} H={H} /> : table ? <Table k={k} W={W} H={H} /> : tinted ? <rect x={-pm} y={-pm} width={W + pm * 2} height={H + pm * 2} fill={gray(k.tints?.[now.tint ?? ''] ?? k.bg)} /> : <Grid t={t} k={k} W={W} H={H} />}
        {k.background?.motes && <Motes t={t} k={k} W={W} H={H} />}
        {pg && k.finish?.grain && <rect x={-pm} y={-pm} width={W + pm * 2} height={H + pm * 2} fill="url(#paperGrain)" opacity={k.finish.grain} />}
        <g mask={chalk ? 'url(#chalkMask)' : undefined} transform={[shake, k.sheet ? sheetTransform(t, D, k, W, H) : undefined].filter(Boolean).join(' ') || undefined}>
          {k.sheet && <Sheet k={k} W={W} H={H} />}
          <Frame t={t} k={k} W={W} H={H} header={storyboard.header} />
          {storyboard.scenes.map((s, si) => {
            // poster: a scene stays on screen while the next one opens over it as an iris
            const irisNext = poster && storyboard.scenes[si + 1]?.transition === 'iris';
            if (t < s.start || (!additive && t > s.end + (irisNext ? 0.75 : 0.001))) return null;
            const exitDur = k.motion.exitDur;
            const isLast = s === last;
            const sp = progress(t, s.start, s.end - s.start);
            const push = s.camera === 'still' || additive ? 1 : 1 + k.motion.cameraPush * cubicInOut(sp);
            const ep = isLast || additive || poster || s.exit === false ? 0 : cubicInOut(progress(t, s.end - exitDur, exitDur));
            const scale = push * (1 - 0.025 * ep);
            const irisP = poster && s.transition === 'iris' && si > 0 ? cubicInOut(progress(t, s.start, 0.6)) : 1;
            const cx = W / 2;
            const cy = H === 1920 ? 860 : H / 2;
            return (
              <g key={s.id} opacity={1 - ep} filter={k.finish?.rough ? 'url(#roughInk)' : k.finish?.stitch ? 'url(#stitchPixels)' : undefined} transform={keyCam ? camOf(s) : `translate(0,${-36 * ep}) translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`}>
                {tinted && (!additive || s === storyboard.scenes[0]) && <TintSet k={k} t={t} W={W} H={H} tint={(additive ? now.tint : s.tint) ?? ''} floor={s.floor ?? k.background?.floor ?? 1320} />}
                {poster && (
                  <>
                    {irisP < 1 && (
                      <clipPath id={`pstiris${si}`}>
                        <circle cx={(s.origin ?? [W / 2, H / 2])[0]} cy={(s.origin ?? [W / 2, H / 2])[1]} r={irisP * 2300} />
                      </clipPath>
                    )}
                    <g clipPath={irisP < 1 ? `url(#pstiris${si})` : undefined}>
                      <PosterBg t={t} k={k} kind={s.tint} seed={si + 1} />
                      {s.blocks.map((b, i) => (
                        <g key={i}>{renderBlock(b, t, k)}</g>
                      ))}
                    </g>
                  </>
                )}
                {!poster && s.blocks.map((b, i) => (
                  <g key={i} transform={b.type === 'cutout' || b.type === 'ransom' ? undefined : nudge(i, s.start)}>
                    {renderBlock(b, t, k)}
                  </g>
                ))}
              </g>
            );
          })}
          {(storyboard.overlay ?? []).map((b, i) => (
            <React.Fragment key={`o${i}`}>{renderBlock(b, t, k)}</React.Fragment>
          ))}
        </g>
        </g>
        {keyCam && <PageWipe k={k} t={t} W={W} H={H} cuts={storyboard.scenes.filter((s) => s.transition === 'page').map((s) => s.start)} />}
        {k.panel && (
          <>
            <path fillRule="evenodd" fill={gray(k.panel.page)} d={`M0,0 H${W} V${H} H0 Z M${k.panel.inset},${k.panel.inset} V${H - k.panel.inset} H${W - k.panel.inset} V${k.panel.inset} Z`} />
            <rect x={k.panel.inset} y={k.panel.inset} width={W - k.panel.inset * 2} height={H - k.panel.inset * 2} fill="none" stroke={gray(k.panel.borderColor ?? k.ink)} strokeWidth={k.panel.border} strokeDasharray={k.panel.dash?.join(' ')} />
          </>
        )}
        {k.finish?.stitch && <rect width={W} height={H} fill="url(#stitchTex)" />}
        {poster && k.poster?.grain && (
          <image
            href={staticFile(POSTER_GRAIN)}
            x={-60 + hash(Math.floor(frame / 3), 1) * 50}
            y={-90 + hash(Math.floor(frame / 3), 2) * 80}
            width={1200}
            height={2100}
            opacity={k.poster.grain}
            style={{mixBlendMode: 'overlay'}}
          />
        )}
        {k.finish?.grain && !pg && <rect width={W} height={H} fill="url(#paperGrain)" opacity={k.finish.grain} />}
        {k.finish?.vignette && <rect width={W} height={H} fill="url(#vignette)" opacity={k.finish.vignette} />}
        <InkSwipe k={k} t={t} W={W} H={H} cuts={storyboard.scenes.filter((s) => s.transition === 'swipe').map((s) => s.start)} />
        {keyCam && <Iris k={k} t={t} W={W} H={H} cuts={storyboard.scenes.filter((s) => s.transition === 'iris').map((s) => s.start)} />}
        {flicker !== 0 && <rect width={W} height={H} fill={flicker > 0 ? '#fff' : '#000'} opacity={Math.abs(flicker)} />}
        {fade > 0 && <rect width={W} height={H} fill={k.fade?.to === 'bg' ? gray(k.bg) : '#000'} opacity={fade} />}
      </svg>
      {!silent && storyboard.audio && <Audio src={staticFile(storyboard.audio)} />}
    </AbsoluteFill>
    </StoryContext.Provider>
  );
};
