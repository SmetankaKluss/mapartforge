import { describe, expect, it } from 'vitest';
import { trackerLoginLink } from '../../components/dev/trackerLoginLink';
describe('Local one-use email login', () => {
  const token = 'a'.repeat(64);
  it('accepts only this project verification links, without using redirect destinations', () => {
    expect(trackerLoginLink(`https://api.mapkluss.art/auth/v1/verify?token=${token}&type=magiclink&redirect_to=https%3A%2F%2Fmapkluss.art%2Fcloud`)).toEqual({token_hash:token,type:'magiclink'});
    expect(trackerLoginLink(`https://opxgnyadxybceldaokdi.supabase.co/auth/v1/verify?token_hash=${token}&type=email`)).toEqual({token_hash:token,type:'email'});
  });
  it('rejects other projects, recovery links, credentials and ambiguous input', () => {
    for (const link of [`https://evil.test/auth/v1/verify?token=${token}&type=email`, `https://api.mapkluss.art.evil.test/auth/v1/verify?token=${token}&type=email`,
      `https://api.mapkluss.art/auth/v1/verify?token=${token}&type=recovery`, `https://user@api.mapkluss.art/auth/v1/verify?token=${token}&type=email`,
      `https://api.mapkluss.art/auth/v1/verify?token=${token}&type=email&type=email`, `https://api.mapkluss.art/cloud#access_token=${token}`, 'javascript:alert(1)']) expect(()=>trackerLoginLink(link)).toThrow();
  });
});
