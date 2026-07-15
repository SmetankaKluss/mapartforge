import { useEffect, useRef } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import {
  EMPTY_CANVAS_DURATION,
  EMPTY_CANVAS_FPS,
  EMPTY_CANVAS_HEIGHT,
  EMPTY_CANVAS_WIDTH,
} from '../lib/emptyCanvasMotion';
import { EmptyCanvasComposition } from './remotion/EmptyCanvasComposition';

interface EmptyCanvasMotionProps {
  playing: boolean;
  initialFrame: number;
}

const PLAYER_STYLE = { width: '100%', height: '100%' } as const;

export function EmptyCanvasMotion({ playing, initialFrame }: EmptyCanvasMotionProps) {
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const syncPlayback = () => {
      if (playing && document.visibilityState === 'visible') player.play();
      else player.pause();
    };

    syncPlayback();
    document.addEventListener('visibilitychange', syncPlayback);
    return () => document.removeEventListener('visibilitychange', syncPlayback);
  }, [playing]);

  return (
    <Player
      ref={playerRef}
      component={EmptyCanvasComposition}
      durationInFrames={EMPTY_CANVAS_DURATION}
      fps={EMPTY_CANVAS_FPS}
      compositionWidth={EMPTY_CANVAS_WIDTH}
      compositionHeight={EMPTY_CANVAS_HEIGHT}
      initialFrame={initialFrame}
      autoPlay={playing}
      loop
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      allowFullscreen={false}
      initiallyMuted
      numberOfSharedAudioTags={0}
      acknowledgeRemotionLicense
      className="empty-canvas-player"
      style={PLAYER_STYLE}
      errorFallback={() => <div className="empty-canvas-motion-fallback" />}
    />
  );
}
