import { getSupabaseClient } from './supabase';
import type { BuildSession } from './buildSession';

export type TrackerSummary = [number, number, number, number, number, number];
export interface TrackerSnapshot {
  width: number; height: number; palette: number[]; pixels: string;
  summary: TrackerSummary; parts: (TrackerSummary | null)[]; materials: Record<string, number>;
}
export interface TrackerLive {
  available: boolean; fresh?: boolean; publisher?: string; sequence?: number; updated_at?: string;
  fresh_for_ms?: number; participants?: number; invalidated?: boolean;
  snapshot?: TrackerSnapshot | null; session?: BuildSession;
}

export function trackerSnapshotPixels(s: TrackerSnapshot): ImageData {
  if (!Number.isInteger(s.width) || !Number.isInteger(s.height) || s.width < 1 || s.height < 1 || s.width > 1280 || s.height > 1280
    || !Array.isArray(s.palette) || !s.palette.length || s.palette.length > 1024 || s.palette.some(c => !Number.isInteger(c))) throw new Error('Invalid snapshot');
  if (typeof s.pixels !== 'string' || s.pixels.length !== 4 * Math.ceil(s.width * s.height * 2 / 3)) throw new Error('Invalid pixels');
  const bytes = atob(s.pixels);
  if (bytes.length !== s.width * s.height * 2) throw new Error('Invalid pixels');
  const output = new Uint8ClampedArray(s.width * s.height * 4);
  for (let i = 0; i < bytes.length; i += 2) {
    const index = bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8);
    if (index >= s.palette.length) throw new Error('Invalid colour');
    const colour = s.palette[index], offset = i * 2;
    output[offset] = (colour >>> 16) & 255; output[offset + 1] = (colour >>> 8) & 255;
    output[offset + 2] = colour & 255; output[offset + 3] = colour >>> 24;
  }
  return new ImageData(output, s.width, s.height);
}

export async function readTrackerLive(sessionId: string, previous?: TrackerLive): Promise<TrackerLive> {
  const { data, error } = await getSupabaseClient().functions.invoke('companion-build', {
    body: { action: 'web_read', session_id: sessionId, publisher: previous?.publisher, sequence: previous?.sequence },
  });
  if (error) throw error;
  if (data?.api_version !== 1 || !data.build || typeof data.build.available !== 'boolean') throw new Error('Invalid tracker response');
  return data.build;
}
