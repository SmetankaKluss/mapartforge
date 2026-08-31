import { describe, expect, it } from 'vitest';
import { createLocalCloudTimingTrace, isLocalCloudTimingEnabled, type LocalCloudTimingRecord } from '../cloudTiming';

describe('local Cloud timing gate', () => {
  it('requires both a development build and an explicit local query flag', () => {
    expect(isLocalCloudTimingEnabled(false, '?cloudTiming=1')).toBe(false);
    expect(isLocalCloudTimingEnabled(true, '')).toBe(false);
    expect(isLocalCloudTimingEnabled(true, '?cloudTiming=0')).toBe(false);
    expect(isLocalCloudTimingEnabled(true, '?cloudTiming=1')).toBe(true);
  });

  it('keeps one local trace identifier and emits no identifying Cloud data', () => {
    const records: LocalCloudTimingRecord[] = [];
    const trace = createLocalCloudTimingTrace('companion_save', {
      development: true,
      search: '?cloudTiming=1',
      createRunId: () => 'local-run',
      dispatch: record => records.push(record),
    });

    trace?.complete({
      outcome: 'ready',
      stages: { generation: 1, hash: 2, prepare: 3, upload: 4, finalize: 5, total: 15 },
      artifactCount: 9,
      payloadKiB: 24,
    });
    trace?.complete({
      outcome: 'failed',
      stages: { generation: 0, hash: 0, prepare: 0, upload: 0, finalize: 0, total: 0 },
      artifactCount: 0,
      payloadKiB: 0,
    });

    expect(records).toEqual([{
      runId: 'local-run',
      operation: 'companion_save',
      outcome: 'ready',
      stages: { generation: 1, hash: 2, prepare: 3, upload: 4, finalize: 5, total: 15 },
      artifactCount: 9,
      payloadKiB: 24,
    }]);
  });
});
