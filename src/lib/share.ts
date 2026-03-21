import { supabase } from './supabase';
import type { SavedSettings } from './localStorage';

const SHARE_BASE = 'https://mapartforge.vercel.app';
const BUCKET = 'mapartforge';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function imageElementToBlob(img: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png'),
  );
}

function imageDataToBlob(data: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png'),
  );
}

export async function uploadPermalink(
  sourceImage: HTMLImageElement,
  previewData: ImageData,
  settings: SavedSettings,
): Promise<string> {
  const id = generateId();

  const [srcBlob, previewBlob] = await Promise.all([
    imageElementToBlob(sourceImage),
    imageDataToBlob(previewData),
  ]);

  const [imgUpload, previewUpload] = await Promise.all([
    supabase.storage.from(BUCKET).upload(`images/${id}.png`,   srcBlob,     { contentType: 'image/png' }),
    supabase.storage.from(BUCKET).upload(`previews/${id}.png`, previewBlob, { contentType: 'image/png' }),
  ]);
  if (imgUpload.error)     { console.error('[share] image upload failed:', imgUpload.error); throw imgUpload.error; }
  if (previewUpload.error) { console.error('[share] preview upload failed:', previewUpload.error); throw previewUpload.error; }

  const { error: dbErr } = await supabase.from('shares').insert({
    id,
    settings,
    image_path:   `images/${id}.png`,
    preview_path: `previews/${id}.png`,
  });
  if (dbErr) { console.error('[share] database insert failed:', dbErr); throw dbErr; }

  return `${SHARE_BASE}/?share=${id}`;
}

export async function loadShare(id: string): Promise<{
  settings: SavedSettings;
  imageUrl: string;
} | null> {
  const { data, error } = await supabase
    .from('shares')
    .select('settings, image_path')
    .eq('id', id)
    .single();
  if (error || !data) return null;

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.image_path as string);

  return {
    settings: data.settings as SavedSettings,
    imageUrl: urlData.publicUrl,
  };
}
