import type { LensSession } from './companionLens';

export function canResumeCloudLens(
  requestedArt: string | null, requestedVersion: string | null,
  loadedArt: string | null | undefined, loadedVersion: string | null | undefined,
): boolean {
  return !!requestedArt && !!requestedVersion
    && requestedArt === loadedArt && requestedVersion === loadedVersion;
}

export function retainLensInviteCode(previous: LensSession | null, next: LensSession | null): LensSession | null {
  if (!next || next.status === 'closed' || next.status === 'expired') return next;
  if (previous?.sessionId !== next.sessionId || next.sessionCode) return next;
  if (previous.realtime?.topic && next.realtime?.topic && previous.realtime.topic !== next.realtime.topic) return next;
  return { ...next, sessionCode: previous.sessionCode };
}
