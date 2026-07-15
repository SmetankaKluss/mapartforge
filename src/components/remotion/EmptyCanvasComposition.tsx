import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { getEmptyCanvasTimeline } from '../../lib/emptyCanvasMotion';

const FRAME = {
  x: 506,
  y: 104,
  width: 304,
  height: 244,
};

const GRID = [
  '....YY......',
  '...YYYY.....',
  'CCCCCCCCCCCC',
  'CCCCCCCGCCCC',
  'CCCGGGGGGCCC',
  'CGGGGGGGGGGC',
  'GGGBBBBBBGGG',
  'BBBBDDDDBBBB',
] as const;

const COLORS: Record<string, string> = {
  Y: '#FFD700',
  C: '#60c8f0',
  G: '#57FF6E',
  B: '#C8622A',
  D: '#68666b',
};

const PIXEL_SIZE = 16;
const PIXEL_STEP = 19;
const GRID_X = FRAME.x + 38;
const GRID_Y = FRAME.y + 37;

const SOURCE_PIXELS = [
  '#60c8f0', '#60c8f0', '#FFD700', '#FFD700', '#60c8f0',
  '#60c8f0', '#57FF6E', '#57FF6E', '#57FF6E', '#60c8f0',
  '#57FF6E', '#57FF6E', '#C8622A', '#57FF6E', '#57FF6E',
  '#C8622A', '#C8622A', '#68666b', '#C8622A', '#C8622A',
] as const;

const DELIVERY_COLORS = ['#60c8f0', '#57FF6E', '#FFD700', '#C8622A', '#57FF6E', '#68666b'] as const;

const bracketStyle = (horizontal: boolean): React.CSSProperties => ({
  position: 'absolute',
  width: horizontal ? 34 : 2,
  height: horizontal ? 2 : 34,
  background: '#57FF6E',
  opacity: 0.66,
});

export function EmptyCanvasComposition() {
  const frame = useCurrentFrame();
  const timeline = getEmptyCanvasTimeline(frame);
  const sourceEase = Easing.bezier(0.16, 1, 0.3, 1)(timeline.sourceArrival);
  const transferEase = Easing.bezier(0.45, 0, 0.55, 1)(timeline.sourceTransfer);
  const mapEase = Easing.bezier(0.16, 1, 0.3, 1)(timeline.mapArrival);
  const holdPulse = interpolate(Math.sin(frame / 17), [-1, 1], [0.82, 1]);
  const sourceX = interpolate(transferEase, [0, 1], [128, 246]);
  const sourceScale = interpolate(transferEase, [0, 1], [1, 0.76]);
  const sourceOpacity = interpolate(transferEase, [0, 1], [0.92, 0.26]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'transparent',
        color: '#dbd2bc',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        opacity: timeline.cycleOpacity,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: sourceX,
          top: interpolate(sourceEase, [0, 1], [176, 148]),
          width: 152,
          height: 116,
          background: '#17171c',
          border: '2px solid rgba(219,210,188,0.38)',
          opacity: sourceOpacity,
          transform: `scale(${sourceScale})`,
          transformOrigin: 'center center',
        }}
      >
        <div style={{ position: 'absolute', inset: 12, background: '#0d0d12', border: '1px solid rgba(96,200,240,0.34)' }}>
          {SOURCE_PIXELS.map((color, index) => (
            <div
              key={`${color}-${index}`}
              style={{
                position: 'absolute',
                left: 8 + (index % 5) * 22,
                top: 7 + Math.floor(index / 5) * 19,
                width: 19,
                height: 16,
                background: color,
                opacity: 0.72,
              }}
            />
          ))}
        </div>
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 6, height: 2, background: 'rgba(219,210,188,0.24)' }} />
      </div>

      {DELIVERY_COLORS.map((color, index) => {
        const travel = interpolate(frame, [42 + index * 6, 90 + index * 6], [0, 1], {
          easing: Easing.bezier(0.45, 0, 0.55, 1),
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const visibility = Math.sin(Math.PI * travel);
        return (
          <div
            key={`${color}-${index}`}
            style={{
              position: 'absolute',
              left: interpolate(travel, [0, 1], [352, GRID_X + 16 + index * 30]),
              top: interpolate(travel, [0, 1], [208 + (index % 2) * 18, GRID_Y + 22 + (index % 3) * 36]) - Math.sin(Math.PI * travel) * 38,
              width: 13,
              height: 13,
              background: color,
              opacity: visibility * 0.9,
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.width,
          height: FRAME.height,
          background: '#111116',
          border: '2px solid rgba(219,210,188,0.42)',
          opacity: interpolate(mapEase, [0, 1], [0.18, 1]),
          transform: `translateX(${interpolate(mapEase, [0, 1], [28, 0])}px) scale(${interpolate(mapEase, [0, 1], [0.96, 1])})`,
          transformOrigin: 'center center',
        }}
      >
        <div style={{ position: 'absolute', left: 12, top: 11, fontSize: 13, letterSpacing: 1.8, color: 'rgba(210,193,162,0.56)' }}>MAP SHEET</div>
        <div style={{ position: 'absolute', right: 12, top: 11, fontSize: 13, color: 'rgba(87,255,110,0.72)' }}>128 × 128</div>

        {GRID.flatMap((row, rowIndex) => [...row].map((token, columnIndex) => {
          const pixelIndex = rowIndex * row.length + columnIndex;
          const revealAt = 47 + rowIndex * 9 + columnIndex * 2;
          const reveal = interpolate(frame, [revealAt, revealAt + 15], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const color = COLORS[token];
          return (
            <div
              key={`${rowIndex}-${columnIndex}`}
              style={{
                position: 'absolute',
                left: GRID_X - FRAME.x + columnIndex * PIXEL_STEP,
                top: GRID_Y - FRAME.y + rowIndex * PIXEL_STEP,
                width: PIXEL_SIZE,
                height: PIXEL_SIZE,
                background: color ?? '#1e1e25',
                opacity: color ? reveal * holdPulse : 0.38,
                transform: color ? `scale(${interpolate(reveal, [0, 1], [0.72, 1])})` : undefined,
              }}
              data-pixel={pixelIndex}
            />
          );
        }))}

        <div
          data-remotion-scan="true"
          style={{
            position: 'absolute',
            left: 34,
            right: 34,
            top: 35 + timeline.scanProgress * 153,
            height: 2,
            background: '#57FF6E',
            opacity: frame < 52 ? 0 : 0.18 + holdPulse * 0.2,
            boxShadow: '0 0 7px rgba(87,255,110,0.44)',
          }}
        />
        <div style={{ position: 'absolute', left: 34, bottom: 13, width: 132, height: 2, background: 'rgba(219,210,188,0.2)' }} />
        <div style={{ position: 'absolute', right: 34, bottom: 10, fontSize: 11, color: 'rgba(210,193,162,0.48)' }}>READY FOR ART</div>
      </div>

      <div style={{ ...bracketStyle(true), left: FRAME.x - 14, top: FRAME.y - 14, transform: `scaleX(${mapEase})`, transformOrigin: 'left' }} />
      <div style={{ ...bracketStyle(false), left: FRAME.x - 14, top: FRAME.y - 14, transform: `scaleY(${mapEase})`, transformOrigin: 'top' }} />
      <div style={{ ...bracketStyle(true), left: FRAME.x + FRAME.width - 20, top: FRAME.y + FRAME.height + 12, transform: `scaleX(${mapEase})`, transformOrigin: 'right' }} />
      <div style={{ ...bracketStyle(false), left: FRAME.x + FRAME.width + 12, top: FRAME.y + FRAME.height - 20, transform: `scaleY(${mapEase})`, transformOrigin: 'bottom' }} />
    </AbsoluteFill>
  );
}
