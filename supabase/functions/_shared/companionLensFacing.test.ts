import {
  COMPANION_LENS_FACINGS,
  isCompanionLensFacing,
} from "./companionLensFacing.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("accepts wall, floor and ceiling Lens facings", () => {
  for (const facing of COMPANION_LENS_FACINGS) {
    assert(isCompanionLensFacing(facing));
  }
});

Deno.test("rejects unknown or malformed Lens facings", () => {
  for (const facing of ["", "top", "bottom", "UP", "north "]) {
    assert(!isCompanionLensFacing(facing));
  }
});
