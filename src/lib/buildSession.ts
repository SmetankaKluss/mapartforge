import { supabase } from './supabase';

export interface SessionMaterial {
  nbtName: string;
  displayName: string;
  count: number;
}

export interface SessionInfo {
  title?: string;
  server?: string;
  coords?: string;
  description?: string;
}

export interface BuildSession {
  id: string;
  created_at: string;
  map_grid: { wide: number; tall: number };
  image_preview: string; // base64 dataURL ~200px thumbnail
  litematic_b64?: string; // base64-encoded .litematic file
  materials: SessionMaterial[];
  gathered: Record<string, number>; // nbtName → amount
  placed: Record<string, number>;   // nbtName → amount
  mode: 'gathering' | 'building';
  info: SessionInfo;
}

/** Create a new session, return its id */
export async function createBuildSession(
  mapGrid: { wide: number; tall: number },
  imagePreview: string,
  materials: SessionMaterial[],
  info: SessionInfo = {},
  litematicB64?: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('build_sessions')
    .insert({
      map_grid: mapGrid,
      image_preview: imagePreview,
      litematic_b64: litematicB64 ?? null,
      materials,
      gathered: {},
      placed: {},
      mode: 'gathering',
      info,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/** Fetch a single session */
export async function getSession(id: string): Promise<BuildSession> {
  const { data, error } = await supabase
    .from('build_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as BuildSession;
}

/** Update gathered amounts (partial patch) */
export async function updateGathered(id: string, gathered: Record<string, number>) {
  const { error } = await supabase
    .from('build_sessions')
    .update({ gathered })
    .eq('id', id);
  if (error) throw error;
}

/** Update placed amounts (partial patch) */
export async function updatePlaced(id: string, placed: Record<string, number>) {
  const { error } = await supabase
    .from('build_sessions')
    .update({ placed })
    .eq('id', id);
  if (error) throw error;
}

/** Switch from gathering → building mode */
export async function switchToBuilding(id: string) {
  const { error } = await supabase
    .from('build_sessions')
    .update({ mode: 'building' })
    .eq('id', id);
  if (error) throw error;
}

/** Subscribe to realtime updates on a session */
export function subscribeSession(
  id: string,
  onUpdate: (session: BuildSession) => void,
) {
  const channel = supabase
    .channel(`build_session_${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'build_sessions', filter: `id=eq.${id}` },
      (payload) => onUpdate(payload.new as BuildSession),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/** Build a small thumbnail from ImageData (max 256px wide, base64 PNG) */
export function buildThumbnail(imageData: ImageData): string {
  const MAX = 256;
  const scale = Math.min(1, MAX / imageData.width);
  const w = Math.round(imageData.width  * scale);
  const h = Math.round(imageData.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // Draw scaled down
  const tmp = document.createElement('canvas');
  tmp.width  = imageData.width;
  tmp.height = imageData.height;
  tmp.getContext('2d')!.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
