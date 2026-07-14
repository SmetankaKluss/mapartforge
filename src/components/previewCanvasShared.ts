import type { TextAlign } from '../lib/textRender';

export type PaintTool = 'eyedropper' | 'brush' | 'fill' | 'eraser' | 'pattern' | 'text'
  | 'select-rect' | 'select-lasso' | 'select-magic' | 'select-pixel'
  | 'pattern-tile' | 'gradient' | 'move';

export interface PaintBlock {
  csId: number;
  blockId: number;
  baseId: number;
  /** Map shade (0=dark/down, 1=flat, 2=bright/up). Used by brush in 3D mode. */
  shade: number;
  displayName: string;
  colourName: string;
}

/**
 * Serializable description of a text layer's editable text. Stored on the Layer
 * so committed text can be re-selected and edited/moved later (not flattened
 * irreversibly). The non-null shape of the text tool's editing state matches
 * this exactly.
 */
export interface TextLayerMeta {
  px: number; py: number;
  value: string; font: string; size: number;
  bold: boolean; italic: boolean;
  align: TextAlign;
  lineHeight: number; letterSpacing: number;
  smooth: boolean;
  fillBlock: PaintBlock | null;
  strokeWidth: number; strokeBlock: PaintBlock | null;
  scaleX: number; scaleY: number;
}

/** Sentinel value: painting with this block erases pixels (alpha = 0). */
export const TRANSPARENT_PAINT_BLOCK: PaintBlock = {
  csId: -1, blockId: -1, baseId: -1, shade: 1,
  displayName: 'Transparent', colourName: 'Air',
};

export const TEXT_FONTS = [
  { label: 'Monospace', value: 'monospace' },
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Courier New', value: '"Courier New"' },
  { label: 'Impact', value: 'Impact' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Arial Black', value: '"Arial Black"' },
] as const;
