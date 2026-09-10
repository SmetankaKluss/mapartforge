/** Parse only this project's one-use email verification links; never navigate to them. */
export function trackerLoginLink(value: string): { token_hash: string; type: 'email' | 'magiclink' } {
  if (value.length > 8192) throw new Error('Invalid link');
  const url = new URL(value.trim());
  if (!['https://api.mapkluss.art', 'https://opxgnyadxybceldaokdi.supabase.co'].includes(url.origin)
    || url.pathname !== '/auth/v1/verify' || url.username || url.password || url.hash) throw new Error('Invalid link');
  const token = url.searchParams.get('token_hash') ?? url.searchParams.get('token');
  const type = url.searchParams.get('type');
  if (!token || !/^[a-zA-Z0-9_-]{32,512}$/.test(token) || (type !== 'email' && type !== 'magiclink')
    || (url.searchParams.has('token') && url.searchParams.has('token_hash'))
    || url.searchParams.getAll('token').length > 1 || url.searchParams.getAll('token_hash').length > 1
    || url.searchParams.getAll('type').length !== 1) throw new Error('Invalid link');
  return { token_hash: token, type };
}
