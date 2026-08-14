const TIMING_ORDER = ["auth", "claim", "verify", "publish", "total"] as const;

export type CompanionServerTimingName = (typeof TIMING_ORDER)[number];
export type CompanionServerTimings = Partial<
  Record<CompanionServerTimingName, number>
>;

export function formatCompanionServerTiming(
  timings: CompanionServerTimings,
): string {
  return TIMING_ORDER.flatMap((name) => {
    const duration = timings[name];
    if (
      typeof duration !== "number" || !Number.isFinite(duration) || duration < 0
    ) return [];
    return [`${name};dur=${Math.round(duration * 10) / 10}`];
  }).join(", ");
}
