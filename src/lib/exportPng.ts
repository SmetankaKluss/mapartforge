import { downloadExportBlob } from './exportDownload';

/** Download an ImageData as a PNG file. */
export function downloadPng(imageData: ImageData, filename: string): void {
  const canvas = document.createElement('canvas');
  canvas.width  = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  canvas.toBlob(blob => {
    if (!blob) return;
    downloadExportBlob(blob, filename);
  }, 'image/png');
}
