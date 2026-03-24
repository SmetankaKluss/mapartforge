import { driver } from 'driver.js';
import { flushSync } from 'react-dom';

const TOUR_KEY = 'klussforge_tour_done';

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
      {
        element: '.upload-zone',
        popover: {
          title: 'START HERE',
          description: 'Drop any image or click to browse. PNG, JPG, WebP — any size works.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },
      {
        element: '.grid-options',
        popover: {
          title: 'MAP GRID',
          description: 'Choose how many Minecraft maps your art will span. 1×1 = one map (128×128 blocks), 2×3 = six maps.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },
      {
        element: '.dither-options',
        popover: {
          title: 'DITHERING',
          description: 'Select a mixing algorithm. KlussDither is our custom algorithm — best for anime and illustrations.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },
      {
        element: '.panel-right',
        popover: {
          title: 'BLOCK PALETTE',
          description: 'Choose which blocks to use. More blocks = better color accuracy.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('palette'),
      },
      {
        element: '.canvas-area',
        popover: {
          title: 'BEFORE / AFTER',
          description: 'After processing, drag the slider in the preview to compare original vs result.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },
      {
        element: '.panel-footer.mobile-export-content',
        popover: {
          title: 'EXPORT',
          description: 'Download as .litematic for Litematica mod, or map.dat to use directly in game.',
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('export'),
      },
      {
        element: '.link-export-btn',
        popover: {
          title: 'SHARE LINK',
          description: 'Share your settings with other builders via link.',
          side: 'bottom',
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
