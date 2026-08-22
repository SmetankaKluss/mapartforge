import { archiveDownloadedExport } from './exportArchive';

/** Download first, then archive a background copy for the current editor session. */
export function downloadExportBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: filename });
  anchor.click();
  URL.revokeObjectURL(url);
  archiveDownloadedExport(blob, filename);
}
