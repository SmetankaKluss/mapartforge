import { assertEquals } from "jsr:@std/assert@1";
import { formatCompanionServerTiming } from "./companionServerTiming.ts";

Deno.test("formats only fixed privacy-safe save timing stages", () => {
  assertEquals(
    formatCompanionServerTiming({
      total: 12.26,
      auth: 2.04,
      verify: 8.88,
      claim: 1,
      publish: 0.34,
    }),
    "auth;dur=2, claim;dur=1, verify;dur=8.9, publish;dur=0.3, total;dur=12.3",
  );
});

Deno.test("ignores invalid timing values", () => {
  assertEquals(
    formatCompanionServerTiming({ auth: -1, claim: Number.NaN, total: 4 }),
    "total;dur=4",
  );
});
