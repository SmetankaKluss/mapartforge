export const COMPANION_LENS_FACINGS = [
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
] as const;

export type CompanionLensFacing = typeof COMPANION_LENS_FACINGS[number];

const COMPANION_LENS_FACING_SET = new Set<string>(COMPANION_LENS_FACINGS);

export function isCompanionLensFacing(
  value: string,
): value is CompanionLensFacing {
  return COMPANION_LENS_FACING_SET.has(value);
}
