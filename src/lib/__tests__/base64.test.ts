import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../base64';

describe('bytesToBase64', () => {
  it('matches native base64 for small byte arrays', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 252, 253, 254, 255]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('encodes large byte arrays without spreading the whole array at once', () => {
    const bytes = new Uint8Array(220_000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 251;
    }
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('round-trips large byte arrays', () => {
    const bytes = new Uint8Array(220_000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (i * 17) % 256;
    }
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
