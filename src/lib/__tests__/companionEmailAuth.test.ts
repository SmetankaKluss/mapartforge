import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
}));

vi.mock('../supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithOtp: authMocks.signInWithOtp,
    },
  }),
}));

import { signInWithCompanionEmail } from '../companionCloud';

describe('signInWithCompanionEmail', () => {
  beforeEach(() => {
    authMocks.signInWithOtp.mockReset();
  });

  it('uses the native Supabase OTP flow with the production redirect', async () => {
    authMocks.signInWithOtp.mockResolvedValue({ error: null });

    await signInWithCompanionEmail('builder@example.com', 'http://localhost:5173/device?code=ABCD');

    expect(authMocks.signInWithOtp).toHaveBeenCalledOnce();
    expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'builder@example.com',
      options: {
        emailRedirectTo: 'https://mapkluss.art/device?code=ABCD',
        shouldCreateUser: true,
      },
    });
  });

  it('surfaces Supabase Auth delivery errors', async () => {
    const error = new Error('email rate limit exceeded');
    authMocks.signInWithOtp.mockResolvedValue({ error });

    await expect(signInWithCompanionEmail('builder@example.com', 'https://mapkluss.art/cloud'))
      .rejects.toBe(error);
  });
});
