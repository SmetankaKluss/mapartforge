import type { ElementType } from 'react';

export type MkIcon = ElementType;
export type MkIconFamily = 'radix' | 'tabler' | 'pixel';

export interface MkIconDefinition {
  component: MkIcon;
  family: MkIconFamily;
  defaultSize: number;
}

interface IconGlyphProps {
  icon: MkIconDefinition;
  className?: string;
  size?: number | string;
}

export function IconGlyph({ icon, className, size = icon.defaultSize }: IconGlyphProps) {
  const Glyph = icon.component;
  const classes = ['mk-icon', `mk-icon--${icon.family}`, className].filter(Boolean).join(' ');

  return (
    <Glyph
      className={classes}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    />
  );
}
