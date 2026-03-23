import { driver } from 'driver.js';

const TOUR_KEY = 'klussforge_tour_done';

export function createTour() {
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
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '.grid-options',
        popover: {
          title: 'MAP GRID',
          description: 'Choose how many Minecraft maps your art will span. 1×1 = one map (128×128 blocks), 2×3 = six maps.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '.dither-options',
        popover: {
          title: 'DITHERING',
          description: 'Select a mixing algorithm. KlussDither is our custom algorithm — best for anime and illustrations.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '.panel-right',
        popover: {
          title: 'BLOCK PALETTE',
          description: 'Choose which blocks to use. More blocks = better color accuracy.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '.canvas-area',
        popover: {
          title: 'BEFORE / AFTER',
          description: 'After processing, drag the slider in the preview to compare original vs result.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '.panel-footer.mobile-export-content',
        popover: {
          title: 'EXPORT',
          description: 'Download as .litematic for Litematica mod, or map.dat to use directly in game.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '.link-export-btn',
        popover: {
          title: 'SHARE LINK',
          description: 'Share your settings with other builders via link.',
          side: 'left',
          align: 'start',
        },
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
