import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DragEvent, ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';
import { useLocale } from '../lib/useLocale';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { trackEvent } from '../lib/analytics';

interface Props {
  onImageLoaded: (img: HTMLImageElement, file: File) => void;
  onDatFile?: (file: File) => void;
  onGifFile?: (file: File) => void;
}

export interface ImageUploadHandle {
  openPicker: () => void;
}

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function hasAllowedImageExtension(name: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(name);
}

export const ImageUpload = forwardRef<ImageUploadHandle, Props>(function ImageUpload({ onImageLoaded, onDatFile, onGifFile }: Props, ref) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // Counter to handle enter/leave across child elements
  const dragCounterRef = useRef(0);

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
  }), []);

  function loadFile(file: File, source: 'click' | 'drop' | 'paste' | 'global_drop' | 'global_paste' = 'click') {
    setUploadError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t('Файл слишком большой. Максимум 80 МБ.', 'File is too large. Maximum size is 80 MB.'));
      return;
    }
    // Handle Minecraft map.dat files
    if (file.name.endsWith('.dat') && onDatFile) {
      trackEvent('mapdat_uploaded', { source, size_mb: Math.round(file.size / 1024 / 1024) });
      onDatFile(file);
      return;
    }
    // Handle animated GIF
    if (file.type === 'image/gif' && onGifFile) {
      trackEvent('gif_uploaded', { source, size_mb: Math.round(file.size / 1024 / 1024) });
      onGifFile(file);
      return;
    }
    const isAllowedImage = ACCEPTED_IMAGE_TYPES.has(file.type) || (!file.type && hasAllowedImageExtension(file.name));
    if (!isAllowedImage) {
      setUploadError(t('Поддерживаются PNG, JPG, WebP, GIF и map.dat.', 'Supported files: PNG, JPG, WebP, GIF, and map.dat.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      trackEvent('image_uploaded', {
        source,
        file_type: file.type || file.name.split('.').pop()?.toLowerCase() || 'unknown',
        size_mb: Math.round(file.size / 1024 / 1024),
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      onImageLoaded(img, file);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setUploadError(t('Не удалось прочитать изображение.', 'Could not read this image.'));
    };
    img.src = url;
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file, 'drop');
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file, 'click');
    e.target.value = '';
  }

  // Обработка вставки из буфера обмена (Ctrl+V)
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadFile(file, 'paste');
          return;
        }
      }
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  // Глобальные обработчики paste и drag-and-drop для всего документа
  useEffect(() => {
    function resetGlobalDrag() {
      dragCounterRef.current = 0;
      setGlobalDragging(false);
      setDragging(false);
    }

    function handleGlobalPaste(e: Event) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const clipboardEvent = e as unknown as ClipboardEvent;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); loadFile(file, 'global_paste'); return; }
        }
      }
    }

    function handleDragEnter(e: Event) {
      const de = e as unknown as DragEvent;
      if (!de.dataTransfer?.types.includes('Files')) return;
      dragCounterRef.current++;
      setGlobalDragging(true);
    }

    function handleDragLeave() {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setGlobalDragging(false);
      }
    }

    function handleDragOver(e: Event) { e.preventDefault(); }

    function handleGlobalDrop(e: Event) {
      e.preventDefault();
      resetGlobalDrag();
      const de = e as unknown as DragEvent;
      const file = de.dataTransfer?.files[0];
      if (file) loadFile(file, 'global_drop');
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') resetGlobalDrag();
    }

    document.addEventListener('paste', handleGlobalPaste);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleGlobalDrop);
    document.addEventListener('dragend', resetGlobalDrag);
    window.addEventListener('blur', resetGlobalDrag);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
      document.removeEventListener('dragend', resetGlobalDrag);
      window.removeEventListener('blur', resetGlobalDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div
        className={`upload-zone ${dragging ? 'drag-over' : ''}`}
        data-tour="upload"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="button"
        aria-label={t('Загрузить изображение, GIF или map.dat', 'Upload image, GIF, or map.dat')}
        title={t('Нажми Ctrl+V чтобы вставить изображение из буфера', 'Press Ctrl+V to paste image from clipboard')}
      >
        <p className="upload-label">{t('Исходник', 'Source image')}</p>
        <p className="upload-sub">{t('нажми, перетащи или вставь', 'click, drop, or paste')}</p>
        <p className="upload-hint">PNG · JPG · WebP · GIF · MAP.DAT · Ctrl+V</p>
        {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,.dat"
          style={{ display: 'none' }}
          onChange={onChange}
        />
      </div>

      {globalDragging && createPortal(
        <div className="global-drop-overlay">
          <div className="global-drop-inner">
            <div className="global-drop-icon"><IconGlyph icon={mkIcons.pickaxe} size={52} /></div>
            <p className="global-drop-text">{t('Отпусти чтобы загрузить', 'Drop to load image')}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
});
