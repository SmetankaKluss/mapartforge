import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isThemeId,
  readStoredTheme,
  resolveTheme,
  THEME_IDS,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
} from '../theme';

const themeCss = readFileSync('src/theme.css', 'utf8');
const appCss = readFileSync('src/App.css', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

const REQUIRED_TOKENS = [
  'color-app-bg',
  'color-surface-primary',
  'color-surface-secondary',
  'color-surface-elevated',
  'color-field-bg',
  'color-text-primary',
  'color-text-secondary',
  'color-text-disabled',
  'color-on-accent',
  'color-border',
  'color-border-subtle',
  'color-border-strong',
  'color-accent',
  'color-accent-hover',
  'color-accent-active',
  'color-focus',
  'color-success',
  'color-warning',
  'color-error',
  'color-info',
  'color-loading',
  'color-export',
  'color-technical',
  'color-value',
  'canvas-workspace-bg',
  'canvas-empty-primary',
  'canvas-empty-secondary',
] as const;

const SURFACE_TOKENS = [
  'color-app-bg',
  'color-surface-primary',
  'color-surface-secondary',
  'color-surface-elevated',
  'color-field-bg',
] as const;

const READABLE_TOKENS = [
  'color-text-primary',
  'color-text-secondary',
  'color-text-disabled',
  'color-accent',
  'color-success',
  'color-warning',
  'color-error',
  'color-info',
  'color-loading',
  'color-export',
  'color-technical',
  'color-value',
] as const;

function themeBlock(theme: string): string {
  const selector = theme === 'classic'
    ? String.raw`:root,\s*:root\[data-theme='classic'\]`
    : String.raw`:root\[data-theme='${theme}'\]`;
  return themeCss.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
}

function tokensFor(theme: string): Record<string, string> {
  return Object.fromEntries(
    [...themeBlock(theme).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)]
      .map(match => [match[1], match[2].toLowerCase()]),
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('MapKluss interface themes', () => {
  it('exposes ten unique themes with dark and light options', () => {
    expect(THEME_IDS).toHaveLength(10);
    expect(new Set(THEME_IDS).size).toBe(10);
    expect(THEME_OPTIONS.map(option => option.id)).toEqual([...THEME_IDS]);
    expect(THEME_OPTIONS.filter(option => option.colorScheme === 'dark')).toHaveLength(6);
    expect(THEME_OPTIONS.filter(option => option.colorScheme === 'light')).toHaveLength(4);
  });

  it('resolves invalid or unavailable storage safely to Classic', () => {
    expect(resolveTheme('deep-ocean', 'amethyst')).toBe('deep-ocean');
    expect(resolveTheme('unknown', 'amethyst')).toBe('amethyst');
    expect(resolveTheme('unknown', 'also-unknown')).toBe('classic');
    expect(isThemeId('rose-oxide')).toBe(true);
    expect(isThemeId('unknown')).toBe(false);
    expect(readStoredTheme({ getItem: () => { throw new Error('blocked'); } })).toBe('classic');
  });

  it('defines the complete semantic token contract for every theme', () => {
    for (const theme of THEME_IDS) {
      const tokens = tokensFor(theme);
      expect(themeBlock(theme), theme).not.toBe('');
      for (const token of REQUIRED_TOKENS) expect(tokens[token], `${theme}: ${token}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(tokens['color-app-bg'], `${theme}: themeColor`).toBe(
        THEME_OPTIONS.find(option => option.id === theme)?.themeColor,
      );
    }
  });

  it('keeps readable semantic colours at WCAG AA contrast on all interface surfaces', () => {
    for (const theme of THEME_IDS) {
      const tokens = tokensFor(theme);
      for (const foreground of READABLE_TOKENS) {
        for (const background of SURFACE_TOKENS) {
          expect(
            contrast(tokens[foreground], tokens[background]),
            `${theme}: ${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keeps filled selections readable and defines a distinct hierarchy contract', () => {
    for (const theme of THEME_IDS) {
      const tokens = tokensFor(theme);
      expect(
        contrast(tokens['color-on-accent'], tokens['color-accent']),
        `${theme}: color-on-accent on color-accent`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    for (const token of [
      'color-heading',
      'color-label',
      'color-control-selected-bg',
      'color-control-selected-text',
      'color-control-selected-border',
      'color-row-selected-bg',
      'color-section-surface',
      'color-value-surface',
    ]) {
      expect(themeCss, token).toContain(`--${token}:`);
    }
  });

  it('keeps the new hierarchy outside MapKluss Classic', () => {
    expect(appCss).toContain(":root:not([data-theme='classic']) :is(");
    expect(appCss).toContain(":root[data-theme='classic'] :is(.section-header, .control-title, .pe-section-title)");
    expect(themeBlock('classic')).toContain('--palette-list-edge: transparent;');
    expect(themeCss).toContain(":root[data-theme='classic'] .theme-selector__option[aria-checked='true']");
  });

  it('keeps the pre-paint bootstrap synchronized to prevent a Classic flash', () => {
    expect(indexHtml).toContain(THEME_STORAGE_KEY);
    for (const option of THEME_OPTIONS) {
      expect(indexHtml, option.id).toContain(`'${option.id}'`);
      expect(indexHtml, option.themeColor).toContain(option.themeColor);
      if (option.colorScheme === 'light') expect(indexHtml).toContain(`'${option.id}'`);
    }
    expect(indexHtml.indexOf('applySavedMapKlussTheme')).toBeLessThan(indexHtml.indexOf('/src/main.tsx'));
  });

  it('themes the editor workspace without touching artwork pixels', () => {
    const workspaceColours = THEME_IDS.map(theme => tokensFor(theme)['canvas-workspace-bg']);
    expect(new Set(workspaceColours).size).toBe(THEME_IDS.length);
    for (const theme of THEME_IDS) {
      const block = themeBlock(theme);
      expect(block, `${theme}: canvas-grid-line`).toContain('--canvas-grid-line:');
      expect(block, `${theme}: canvas-grid-major`).toContain('--canvas-grid-major:');
      expect(block, `${theme}: canvas-grid-size`).toContain('--canvas-grid-size:');
    }
  });
});
