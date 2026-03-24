import { driver } from 'driver.js';
import { flushSync } from 'react-dom';

const TOUR_KEY = 'mapkluss_tour_done';

const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

type Tab = 'settings' | 'palette' | 'export';

export function createTour(switchTab?: (tab: Tab) => void) {
  const switchSync = (tab: Tab) => {
    if (!isMobile() || !switchTab) return;
    flushSync(() => switchTab(tab));
  };

  const d = driver({
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.7,
    stagePadding: 6,
    stageRadius: 2,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'NEXT ›',
    prevBtnText: '‹ BACK',
    doneBtnText: 'DONE ✓',
    onDestroyStarted: () => {
      localStorage.setItem(TOUR_KEY, 'true');
      d.destroy();
    },
    steps: [
      // ── 1. Upload ──────────────────────────────────────────────────────────
      {
        element: '.upload-zone',
        popover: {
          title: '1. LOAD YOUR IMAGE',
          description:
            'Drop any image here, click to browse, or press <b>Ctrl+V</b> to paste from clipboard. ' +
            'PNG, JPG, WebP — any size works, the image will be scaled to fit the map grid.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 2. Map grid ────────────────────────────────────────────────────────
      {
        element: '.grid-options',
        popover: {
          title: '2. MAP SIZE',
          description:
            'Each Minecraft map is <b>128×128 blocks</b>. Choose how many maps your art spans — ' +
            '1×1 is a single map, 2×3 gives you a 256×384 block canvas. ' +
            'Larger grids = more detail but more blocks to build.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 3. 2D / 3D mode ───────────────────────────────────────────────────
      {
        element: '.mode-toggle',
        popover: {
          title: '3. BUILD MODE',
          description:
            '<b>2D Flat</b> — all blocks on one level, ~61 colors. Simple to build in survival. ' +
            '<b>3D Staircase</b> — blocks at different heights create 3 shading tones per color, giving ~183 colors. ' +
            'Produces much richer results but requires the Litematica mod to build accurately.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 4. Dithering ──────────────────────────────────────────────────────
      {
        element: '.dither-options',
        popover: {
          title: '4. DITHERING',
          description:
            'Dithering blends nearby pixels to simulate colors that don\'t exist in the block palette. ' +
            '<b>None</b> = flat nearest-color only. <b>KlussDither</b> = our custom algorithm, best for anime and illustrations. ' +
            '<b>Floyd-Steinberg</b> = classic, good general purpose choice.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 5. Adjustments ────────────────────────────────────────────────────
      {
        element: '.adj-sliders',
        popover: {
          title: '5. IMAGE ADJUSTMENTS',
          description:
            'Tweak the source image before it\'s converted. ' +
            'Bumping <b>contrast</b> and slightly increasing <b>saturation</b> often improves results significantly — ' +
            'Minecraft\'s palette is less vibrant than most photos and illustrations.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 6. Canvas / preview ───────────────────────────────────────────────
      {
        element: '.canvas-area',
        popover: {
          title: '6. PREVIEW',
          description:
            'The processed map art appears here after the image is loaded. ' +
            '<b>Drag the split slider</b> left/right to compare the original with the result. ' +
            '<b>Hover any pixel</b> to see the block name, color ID and exact shade. ' +
            'Scroll to zoom, drag to pan.',
          side: 'left',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 8. Toolbar / paint tools ──────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: '7. TOOLBAR',
          description:
            '<b>↩↪</b> Undo / Redo (Ctrl+Z / Ctrl+Y). ' +
            'After processing, paint tools appear: <b>cursor</b> (inspect), <b>eyedropper</b> (E — pick block), ' +
            '<b>brush</b> (B — paint pixels), <b>fill</b> (F — flood fill). ' +
            'Also: toggle <b>block textures</b>, <b>grid overlay</b>, and <b>compare mode</b>.',
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 9. Block palette ──────────────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: '8. BLOCK PALETTE',
          description:
            'Enable or disable individual block color rows. <b>More blocks = more colors available = better quality.</b> ' +
            'Click the dot next to a color to toggle it; click a block icon to pick which variant to use. ' +
            'Use <b>Search</b> to find specific blocks, <b>Presets</b> for quick setups, and <b>Share palette</b> to send your selection to others.',
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 10. Support block ─────────────────────────────────────────────────
      {
        element: '.support-block-section',
        popover: {
          title: '9. SUPPORT BLOCKS (3D)',
          description:
            'In 3D staircase mode some blocks (sand, gravel, lichen…) can\'t float in mid-air. ' +
            'Choose a solid block to place underneath them automatically in the exported schematic. ' +
            '<b>Depth 1</b> = under floating blocks only · <b>2</b> = one block under every art block · <b>3</b> = two blocks under every art block.',
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 11. Materials list ────────────────────────────────────────────────
      {
        element: '.mat-header',
        popover: {
          title: '10. MATERIALS LIST',
          description:
            'Shows every block type used in your map art with exact counts in <b>stacks</b> (64) and <b>shulker boxes</b> (1728). ' +
            'Toggle <b>Max/map</b> to see the maximum needed for a single 128×128 tile — useful for knowing what to bring per session.',
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('export'),
      },

      // ── 12. Export ────────────────────────────────────────────────────────
      {
        element: '#tour-export',
        popover: {
          title: '11. EXPORT',
          description:
            '<b>↓ PNG</b> — download the processed image as a picture. ' +
            '<b>↓ MAP.DAT</b> — ready-to-use Minecraft map files; place in your saves folder. ' +
            '<b>↓ LITEMATIC</b> — building schematic for the <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">Litematica mod</a>. ' +
            '<b>↓ ZIP</b> — one .litematic file per 128×128 tile, zipped (multi-map grids).',
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('export'),
      },

      // ── 13. Get Link ──────────────────────────────────────────────────────
      {
        element: '.link-export-btn',
        popover: {
          title: '12. SHARE LINK',
          description:
            'Generates a <b>permanent link</b> that encodes your image and all current settings (grid, dithering, palette, adjustments). ' +
            'Share it with other builders or bookmark it to continue your project later — no account needed.',
          side: 'top',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('export'),
      },
    ],
  });

  return d;
}

export function shouldAutoStart(): boolean {
  return !localStorage.getItem(TOUR_KEY);
}

export function markTourDone(): void {
  localStorage.setItem(TOUR_KEY, 'true');
}
