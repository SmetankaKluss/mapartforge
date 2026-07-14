/** Download an ImageData as a PNG file. */
export function downloadPng(imageData: ImageData, filename: string): void {
  const canvas = document.createElement('canvas');
  canvas.width  = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
