import { useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

interface Props {
  onImageLoaded: (img: HTMLImageElement) => void;
}

export function ImageUpload({ onImageLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onImageLoaded(img);
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

  return (
    <div
      className={`upload-zone ${dragging ? 'drag-over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="upload-icon">⛏</div>
      <p className="upload-label">Drop an image here</p>
      <p className="upload-sub">or click to browse</p>
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
