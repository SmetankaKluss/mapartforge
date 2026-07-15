import { describe, expect, it } from 'vitest';
import type { Layer } from '../layers';
import {
  autosaveFitsBudget,
  estimateAutosaveSnapshotBytes,
  shouldRestoreEditorAutosave,
} from '../editorAutosave';

describe('editor autosave policy', () => {
  it('restores only the ordinary root editor', () => {
    expect(shouldRestoreEditorAutosave('/', '')).toBe(true);
    expect(shouldRestoreEditorAutosave('/', '?announcement=1')).toBe(true);
    expect(shouldRestoreEditorAutosave('/', '?art=art-id')).toBe(false);
    expect(shouldRestoreEditorAutosave('/', '?cloudFolder=1&cloudFolderMock=1')).toBe(false);
    expect(shouldRestoreEditorAutosave('/cloud', '')).toBe(false);
  });

  it('estimates encoded layer and original-image storage before serialization', () => {
    const image = { data: new Uint8ClampedArray(400) } as ImageData;
    const layer = {
      id: 'layer-1',
      name: 'Layer',
      visible: true,
      locked: false,
      opacity: 100,
      groupId: null,
      buildMode: '2d',
      imageData: image,
    } satisfies Layer;
    expect(estimateAutosaveSnapshotBytes([layer], image))
      .toBeGreaterThan(1024 * 1024 + 800);
  });

  it('keeps snapshots below both the fixed ceiling and safe quota share', () => {
    expect(autosaveFitsBudget(8 * 1024 * 1024)).toBe(true);
    expect(autosaveFitsBudget(129 * 1024 * 1024)).toBe(false);
    expect(autosaveFitsBudget(20 * 1024 * 1024, 100 * 1024 * 1024, 20 * 1024 * 1024)).toBe(true);
    expect(autosaveFitsBudget(21 * 1024 * 1024, 100 * 1024 * 1024, 20 * 1024 * 1024)).toBe(false);
  });
});
