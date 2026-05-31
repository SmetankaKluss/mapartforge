import { Icon, type IconifyIcon } from '@iconify/react';

interface IconGlyphProps {
  icon: IconifyIcon;
  className?: string;
  size?: number | string;
}

export function IconGlyph({ icon, className, size = 16 }: IconGlyphProps) {
  return <Icon icon={icon} className={className ?? 'mk-icon'} width={size} height={size} aria-hidden="true" />;
}
