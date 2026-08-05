export type CompanionBearerKind = 'website_jwt' | 'device_token';

export type CompanionBearer = {
  token: string;
  kind: CompanionBearerKind;
};

const JWT_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function classifyCompanionBearer(authorization: string | null): CompanionBearer | null {
  const token = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const parts = token.split('.');
  const kind: CompanionBearerKind = parts.length === 3 && parts.every(part => part.length > 0 && JWT_SEGMENT.test(part))
    ? 'website_jwt'
    : 'device_token';
  return { token, kind };
}
