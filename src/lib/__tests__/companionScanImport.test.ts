import { describe, expect, it } from 'vitest';
import { normalizeCompanionScanImport } from '../companionCloud';
import type { CompanionScanImport } from '../companionTypes';

describe('companion scan imports', () => {
  it('normalizes missing map metadata and manual wall source', () => {
    const normalized = normalizeCompanionScanImport({
      importId: 'import-1',
      source: 'manual-wall',
      title: 'Wall scan',
      mapGrid: { wide: 3, tall: 2 },
      imagePath: 'scan.png',
      sizeBytes: 12,
      sha256: 'abc',
      metadata: { missing_maps: 4 },
      missingMaps: 0,
      createdAt: '2026-06-30T12:00:00Z',
    } satisfies CompanionScanImport);

    expect(normalized.source).toBe('manual_wall');
    expect(normalized.missingMaps).toBe(4);
  });
});
