import { useRef, useState, useEffect } from 'react';
import type { DragEvent, ChangeEvent, ClipboardEvent } from 'react';
import { useLocale } from '../lib/locale';

interface Props {
  onImageLoaded: (img: HTMLImageElement, file: File) => void;
}

export function ImageUpload({ onImageLoaded }: Props) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onImageLoaded(img, file);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
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
          loadFile(file);
          return;
        }
      }
    }
  }

  // Регистрируем глобальный обработчик paste для всего документа
  useEffect(() => {
    function handleGlobalPaste(e: Event) {
      // Проверяем, что фокус не в input/textarea/select
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      const clipboardEvent = e as unknown as ClipboardEvent;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            loadFile(file);
            return;
          }
        }
      }
    }

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`upload-zone ${dragging ? 'drag-over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
      title={t('Нажми Ctrl+V чтобы вставить изображение из буфера', 'Press Ctrl+V to paste image from clipboard')}
    >
      <div className="upload-icon">⛏</div>
      <p className="upload-label">{t('Перетащи изображение сюда', 'Drag image here')}</p>
      <p className="upload-sub">{t('или нажми для выбора файла', 'or click to browse')}</p>
      <p className="upload-hint">{t('Ctrl+V — вставить из буфера', 'Ctrl+V — paste from clipboard')}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onChange}
      />
    </div>
  );
}
