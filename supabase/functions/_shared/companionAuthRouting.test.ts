import { assertEquals } from 'jsr:@std/assert@1';
import { classifyCompanionBearer } from './companionAuthRouting.ts';

Deno.test('classifies Supabase JWT and opaque Companion tokens without network fallback', () => {
  assertEquals(classifyCompanionBearer('Bearer header.payload.signature'), {
    token: 'header.payload.signature',
    kind: 'website_jwt',
  });
  assertEquals(classifyCompanionBearer('Bearer opaqueDeviceToken_123'), {
    token: 'opaqueDeviceToken_123',
    kind: 'device_token',
  });
});

Deno.test('malformed and missing bearer values stay safe', () => {
  assertEquals(classifyCompanionBearer(null), null);
  assertEquals(classifyCompanionBearer('Bearer '), null);
  assertEquals(classifyCompanionBearer('Bearer a.b'), {
    token: 'a.b',
    kind: 'device_token',
  });
  assertEquals(classifyCompanionBearer('Bearer a.b.invalid+segment'), {
    token: 'a.b.invalid+segment',
    kind: 'device_token',
  });
});
