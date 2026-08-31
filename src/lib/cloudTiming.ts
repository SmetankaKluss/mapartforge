export const LOCAL_CLOUD_TIMING_EVENT = 'mapkluss:cloud-timing';

export type LocalCloudTimingStage =
  | 'generation'
  | 'hash'
  | 'prepare'
  | 'upload'
  | 'finalize'
  | 'total';

export type LocalCloudTimingRecord = Readonly<{
  runId: string;
  operation: 'companion_save';
  outcome: 'ready' | 'failed';
  stages: Readonly<Record<LocalCloudTimingStage, number>>;
  artifactCount: number;
  payloadKiB: number;
}>;

type LocalCloudTimingInput = Omit<LocalCloudTimingRecord, 'runId' | 'operation'>;

export type LocalCloudTimingTrace = Readonly<{
  complete: (input: LocalCloudTimingInput) => void;
}>;

type LocalCloudTimingEnvironment = Readonly<{
  development?: boolean;
  search?: string;
  createRunId?: () => string;
  dispatch?: (record: LocalCloudTimingRecord) => void;
}>;

export function isLocalCloudTimingEnabled(
  development = import.meta.env.DEV,
  search = typeof window === 'undefined' ? '' : window.location.search,
): boolean {
  return development && new URLSearchParams(search).get('cloudTiming') === '1';
}

export function createLocalCloudTimingTrace(
  operation: LocalCloudTimingRecord['operation'],
  environment: LocalCloudTimingEnvironment = {},
): LocalCloudTimingTrace | undefined {
  const development = environment.development ?? import.meta.env.DEV;
  const search = environment.search ?? (typeof window === 'undefined' ? '' : window.location.search);
  if (!isLocalCloudTimingEnabled(development, search)) return undefined;

  const runId = environment.createRunId?.() ?? crypto.randomUUID();
  const dispatch = environment.dispatch ?? (record => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<LocalCloudTimingRecord>(LOCAL_CLOUD_TIMING_EVENT, { detail: record }));
  });
  let completed = false;

  return {
    complete(input) {
      if (completed) return;
      completed = true;
      const record: LocalCloudTimingRecord = { runId, operation, ...input };
      dispatch(record);
    },
  };
}
