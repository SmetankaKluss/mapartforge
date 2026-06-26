import type { IconifyIcon } from '@iconify/react';

import tablerAnchor from '@iconify-icons/tabler/anchor';
import tablerArrowsExchange from '@iconify-icons/tabler/arrows-exchange-2';
import tablerArrowsMove from '@iconify-icons/tabler/arrows-move';
import tablerArtboard from '@iconify-icons/tabler/artboard';
import tablerBook from '@iconify-icons/tabler/book-2';
import tablerBrush from '@iconify-icons/tabler/brush';
import tablerBucket from '@iconify-icons/tabler/bucket';
import tablerCircleX from '@iconify-icons/tabler/circle-x';
import tablerColorPicker from '@iconify-icons/tabler/color-picker';
import tablerColorSwatch from '@iconify-icons/tabler/color-swatch';
import tablerChevronDown from '@iconify-icons/tabler/chevron-down';
import tablerColumns from '@iconify-icons/tabler/columns-2';
import tablerDeviceFloppy from '@iconify-icons/tabler/device-floppy';
import tablerDownload from '@iconify-icons/tabler/download';
import tablerEraser from '@iconify-icons/tabler/eraser';
import tablerFolderOpen from '@iconify-icons/tabler/folder-open';
import tablerGrid4x4 from '@iconify-icons/tabler/grid-4x4';
import tablerGridDots from '@iconify-icons/tabler/grid-dots';
import tablerHelp from '@iconify-icons/tabler/help-hexagon';
import tablerKeyboard from '@iconify-icons/tabler/keyboard';
import tablerLasso from '@iconify-icons/tabler/lasso';
import tablerLetterT from '@iconify-icons/tabler/letter-t';
import tablerMap from '@iconify-icons/tabler/map';
import tablerPackage from '@iconify-icons/tabler/package';
import tablerPalette from '@iconify-icons/tabler/palette';
import tablerPhoto from '@iconify-icons/tabler/photo';
import tablerPointer from '@iconify-icons/tabler/pointer';
import tablerSelect from '@iconify-icons/tabler/select';
import tablerSettings from '@iconify-icons/tabler/settings';
import tablerShare from '@iconify-icons/tabler/share';
import tablerStack from '@iconify-icons/tabler/stack-2';
import tablerStar from '@iconify-icons/tabler/star';
import tablerTrash from '@iconify-icons/tabler/trash';
import tablerUpload from '@iconify-icons/tabler/upload';
import tablerWand from '@iconify-icons/tabler/wand';
import tablerX from '@iconify-icons/tabler/x';
import tablerZoomReset from '@iconify-icons/tabler/zoom-reset';
import gamePaintBrush from '@iconify-icons/game-icons/paint-brush';
import gamePickaxe from '@iconify-icons/game-icons/crossed-axes';
import pixelDownload from '@iconify-icons/pixelarticons/download';
import pixelHeart from '@iconify-icons/pixelarticons/heart';
import pixelImageNew from '@iconify-icons/pixelarticons/image-new';
import pixelPlay from '@iconify-icons/pixelarticons/play';
import pixelRedo from '@iconify-icons/pixelarticons/redo';
import pixelSliders from '@iconify-icons/pixelarticons/sliders';
import pixelUndo from '@iconify-icons/pixelarticons/undo';

export const mkIcons = {
  anchor: tablerAnchor,
  artist: gamePaintBrush,
  blockTextures: tablerPackage,
  brush: tablerBrush,
  chevronDown: tablerChevronDown,
  close: tablerX,
  compare: tablerColumns,
  deselect: tablerCircleX,
  download: pixelDownload,
  eraser: tablerEraser,
  export: tablerDownload,
  fill: tablerBucket,
  gradient: tablerColorSwatch,
  grid: tablerGrid4x4,
  guide: tablerHelp,
  import: tablerUpload,
  invert: tablerArrowsExchange,
  keyboard: tablerKeyboard,
  lasso: tablerLasso,
  layer: tablerStack,
  map: tablerMap,
  move: tablerArrowsMove,
  newCanvas: pixelImageNew,
  palette: tablerPalette,
  package: tablerPackage,
  pattern: tablerGridDots,
  pickaxe: gamePickaxe,
  play: pixelPlay,
  project: tablerFolderOpen,
  redo: pixelRedo,
  reset: pixelUndo,
  save: tablerDeviceFloppy,
  select: tablerPointer,
  selectRect: tablerSelect,
  settings: tablerSettings,
  share: tablerShare,
  support: pixelHeart,
  text: tablerLetterT,
  tourAdvanced: tablerStar,
  trash: tablerTrash,
  upload: tablerUpload,
  view: tablerPhoto,
  wand: tablerWand,
  wiki: tablerBook,
  zoomReset: tablerZoomReset,
  sliders: pixelSliders,
  artboard: tablerArtboard,
  eyedropper: tablerColorPicker,
} satisfies Record<string, IconifyIcon>;
