import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { getEmptyCanvasTimeline } from '../../lib/emptyCanvasMotion';

const TILE_SIZE = 128;
const TILE_LEFT = 256;
const TILE_TOP = 46;

const easeOut = (value: number) => Easing.bezier(0.16, 1, 0.3, 1)(value);
const easeInOut = (value: number) => Easing.bezier(0.65, 0, 0.35, 1)(value);

function MapLayer({
  depth,
  open,
  arrival,
}: {
  depth: 'back' | 'middle' | 'front';
  open: number;
  arrival: number;
}) {
  const config = {
    back: {
      rotate: [-24, -5],
      translateX: [-14, 7],
      translateY: [8, 8],
      scale: [0.78, 0.96],
      background: 'var(--canvas-empty-secondary)',
      opacity: 0.52,
    },
    middle: {
      rotate: [18, 4],
      translateX: [15, 4],
      translateY: [4, 4],
      scale: [0.84, 0.98],
      background: 'var(--canvas-empty-primary)',
      opacity: 0.72,
    },
    front: {
      rotate: [-7, 0],
      translateX: [0, 0],
      translateY: [0, 0],
      scale: [0.9, 1],
      background: 'color-mix(in srgb, var(--canvas-empty-primary) 7%, var(--canvas-workspace-bg))',
      opacity: 1,
    },
  }[depth];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        background: config.background,
        border: depth === 'front' ? '3px solid var(--canvas-empty-primary)' : '0',
        opacity: arrival * config.opacity,
        rotate: `${interpolate(open, [0, 1], config.rotate)}deg`,
        translate: `${interpolate(open, [0, 1], config.translateX)}px ${interpolate(open, [0, 1], config.translateY)}px`,
        scale: interpolate(arrival * open, [0, 1], [config.scale[0], config.scale[1]]),
        transformOrigin: 'center center',
      }}
    />
  );
}

export function EmptyCanvasComposition() {
  const frame = useCurrentFrame();
  const timeline = getEmptyCanvasTimeline(frame);
  const arrival = easeOut(timeline.stackArrival);
  const open = easeInOut(timeline.mapOpen);
  const emblem = easeOut(timeline.emblemReveal);
  const sweep = easeInOut(timeline.lightSweep);
  const sweepVisibility = Math.sin(Math.PI * sweep) * emblem;
  const shadowWidth = interpolate(open, [0, 1], [68, 116]);

  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        opacity: timeline.cycleOpacity,
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 320 - shadowWidth / 2,
          top: TILE_TOP + TILE_SIZE + 14,
          width: shadowWidth,
          height: 9,
          borderRadius: '50%',
          background: 'rgb(var(--color-shadow-rgb) / 0.5)',
          filter: 'blur(7px)',
          opacity: arrival * interpolate(open, [0, 1], [0.28, 0.5]),
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: TILE_LEFT,
          top: TILE_TOP + interpolate(arrival, [0, 1], [12, 0]),
          width: TILE_SIZE,
          height: TILE_SIZE,
          opacity: arrival,
          scale: interpolate(arrival, [0, 1], [0.88, 1]),
          transformOrigin: 'center center',
        }}
      >
        <MapLayer depth="back" open={open} arrival={arrival} />
        <MapLayer depth="middle" open={open} arrival={arrival} />
        <MapLayer depth="front" open={open} arrival={arrival} />

        <div
          style={{
            position: 'absolute',
            inset: 11,
            background: 'var(--canvas-workspace-bg)',
            opacity: arrival,
            scale: interpolate(open, [0, 1], [0.86, 1]),
          }}
        />

        <div
          style={{
            position: 'absolute',
            right: 3,
            top: 3,
            width: 30,
            height: 30,
            background: 'var(--canvas-empty-secondary)',
            clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
            opacity: arrival * interpolate(open, [0, 1], [0.38, 0.92]),
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 16,
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            opacity: emblem,
            scale: interpolate(emblem, [0, 1], [0.82, 1]),
            translate: `0 ${interpolate(emblem, [0, 1], [7, 0])}px`,
            clipPath: `inset(${interpolate(emblem, [0, 1], [45, 0])}% 0 ${interpolate(emblem, [0, 1], [45, 0])}% 0)`,
          }}
        >
          <Img
            src={staticFile('logo-opt.png')}
            style={{
              width: 86,
              height: 86,
              objectFit: 'contain',
              imageRendering: 'pixelated',
              filter: `brightness(${interpolate(sweepVisibility, [0, 1], [1, 1.2])}) saturate(${interpolate(emblem, [0, 1], [0.9, 1.08])})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -8,
              bottom: -8,
              left: interpolate(sweep, [0, 1], [-34, 118]),
              width: 22,
              background: 'rgb(var(--color-text-primary-rgb) / 0.15)',
              filter: 'blur(6px)',
              opacity: sweepVisibility,
              rotate: '9deg',
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute',
            left: 11,
            bottom: 7,
            width: interpolate(emblem, [0, 1], [0, 52]),
            height: 5,
            background: 'var(--canvas-empty-primary)',
            opacity: emblem,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
