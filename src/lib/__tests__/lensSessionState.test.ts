import { describe, expect, it } from 'vitest';
import type { LensSession } from '../companionLens';
import { canResumeCloudLens, retainLensInviteCode } from '../lensSessionState';

describe('native Lens project readiness', () => {
  it('requires the exact successfully loaded version before attaching', () => {
    expect(canResumeCloudLens('art', 'v2', 'art', 'v2')).toBe(true);
    expect(canResumeCloudLens('art', 'v2', 'art', 'v1')).toBe(false);
    expect(canResumeCloudLens('art', 'v2', 'other', 'v2')).toBe(false);
    expect(canResumeCloudLens('art', 'v2', 'art', null)).toBe(false);
    expect(canResumeCloudLens('art', null, 'art', null)).toBe(false);
  });
});

const session = (changes: Partial<LensSession> = {}): LensSession => ({
  sessionId: 'first', title: '', status: 'active', grid: { wide: 1, tall: 1 },
  mapMode: '2d', revision: 1, tileResolution: 128, previewWidth: 128,
  previewHeight: 128, viewerCount: 0, editorLastSeenAt: '', expiresAt: '',
  ownedByUser: true, ...changes,
});

describe('Lens invitation lifetime', () => {
  it('keeps the code through publish and status responses', () => {
    const initial = session({ sessionCode: 'TESTCODE' });
    const published = retainLensInviteCode(initial, session({ revision: 2 }));
    expect(retainLensInviteCode(published, session({ status: 'offline' }))?.sessionCode).toBe('TESTCODE');
  });
  it('adopts an explicitly rotated code', () => {
    expect(retainLensInviteCode(session({ sessionCode: 'OLD' }), session({ sessionCode: 'NEW' }))?.sessionCode).toBe('NEW');
  });
  it('never transfers codes into another or terminal session', () => {
    const previous = session({ sessionCode: 'PRIVATE' });
    expect(retainLensInviteCode(previous, session({ sessionId: 'second' }))?.sessionCode).toBeUndefined();
    expect(retainLensInviteCode(previous, session({ status: 'closed' }))?.sessionCode).toBeUndefined();
    expect(retainLensInviteCode(previous, null)).toBeNull();
  });
});
