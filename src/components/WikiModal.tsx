import { useState } from 'react';

type WikiSection = 'overview' | 'getting-started' | 'map-grid' | 'dithering' | '2d-vs-3d' | 'blocks' | 'tools' | 'export' | 'tips' | 'troubleshoot';

export function WikiModal({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState<WikiSection>('overview');

  const sections: Record<WikiSection, { title: string; content: React.ReactNode }> = {
    overview: {
      title: 'What is MapKluss?',
      content: (
        <div>
          <p>
            <b>MapKluss</b> is a free, browser-based Minecraft map art generator. It converts any image into a schematic or map.dat file that you can build in Minecraft using the <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">Litematica mod</a> or vanilla survival mode.
          </p>
          <h4>Key features:</h4>
          <ul>
            <li><b>Multiple dithering algorithms</b> — KlussDither (custom), Floyd–Steinberg, Stucki, and more</li>
            <li><b>2D and 3D modes</b> — flat art (~61 colors) or staircase art with shading (~183 colors)</li>
            <li><b>Export formats</b> — PNG, MAP.DAT, LITEMATIC, ZIP</li>
            <li><b>Paint tools</b> — eyedropper, brush, fill, undo/redo</li>
            <li><b>Materials list</b> — exact block counts in stacks and shulker boxes</li>
            <li><b>Shareable links</b> — permalink your settings and image without an account</li>
          </ul>
          <p>No signup required. No limits.</p>
        </div>
      ),
    },

    'getting-started': {
      title: 'Getting Started',
      content: (
        <div>
          <h4>Step-by-step:</h4>
          <ol>
            <li>
              <b>Load an image</b> — Drop a PNG, JPG, or WebP onto the upload zone, click to browse, or press <code>Ctrl+V</code> to paste from clipboard.
            </li>
            <li>
              <b>Choose map size</b> — Select a grid (1×1 to 3×3 maps, each 128×128 blocks). Larger = more detail but more blocks to gather.
            </li>
            <li>
              <b>Pick a build mode</b> — <b>2D Flat</b> for simplicity, <b>3D Staircase</b> for richer shading.
            </li>
            <li>
              <b>Select dithering</b> — Start with <b>KlussDither</b> for anime/illustrations or <b>Floyd–Steinberg</b> for photos.
            </li>
            <li>
              <b>Adjust if needed</b> — Tweak brightness, contrast, saturation if colors look off.
            </li>
            <li>
              <b>Review blocks</b> — In the Palette panel, disable any block colors you don't want to use.
            </li>
            <li>
              <b>Export</b> — Download as LITEMATIC for the mod or MAP.DAT to place directly in your world.
            </li>
          </ol>
          <p><b>Tip:</b> Minecraft's palette is less vibrant than most photos. Increasing contrast before processing helps a lot.</p>
        </div>
      ),
    },

    'map-grid': {
      title: 'Map Grid Sizes',
      content: (
        <div>
          <p>Each Minecraft <b>map</b> is exactly <b>128×128 blocks</b>. Choose how many maps your art spans:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px' }}>Grid</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Blocks</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Maps</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Use case</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px' }}>1×1</td>
                <td style={{ padding: '6px' }}>128×128</td>
                <td style={{ padding: '6px' }}>1</td>
                <td style={{ padding: '6px' }}>Small portraits, logos</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px' }}>2×2</td>
                <td style={{ padding: '6px' }}>256×256</td>
                <td style={{ padding: '6px' }}>4</td>
                <td style={{ padding: '6px' }}>Medium scenes, characters</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px' }}>3×3</td>
                <td style={{ padding: '6px' }}>384×384</td>
                <td style={{ padding: '6px' }}>9</td>
                <td style={{ padding: '6px' }}>Large landscapes, posters</td>
              </tr>
              <tr>
                <td style={{ padding: '6px' }}>Custom</td>
                <td style={{ padding: '6px' }}>Any W×H</td>
                <td style={{ padding: '6px' }}>Any</td>
                <td style={{ padding: '6px' }}>Exact aspect ratio</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: '10px' }}>
            <b>Note:</b> Larger grids preserve more detail but require significantly more blocks and time to build.
          </p>
        </div>
      ),
    },

    dithering: {
      title: 'Dithering Algorithms',
      content: (
        <div>
          <p>
            Dithering simulates colors that don't exist in Minecraft's palette by mixing nearby pixels. Each algorithm has a different "feel":
          </p>
          <h4>None</h4>
          <p>No dithering. Uses the nearest available color for each pixel. Fast, clean, but limited color range.</p>

          <h4>Floyd–Steinberg (Recommended for most)</h4>
          <p>
            Classic serpentine diffusion. Good balance of color accuracy and smoothness. Spreads error in a predictable pattern.
          </p>

          <h4>Stucki</h4>
          <p>Smoother than Floyd–Steinberg but slower. Uses 12-neighbor diffusion. Better for photos with subtle gradients.</p>

          <h4>JJN (Jarvis-Judice-Ninke)</h4>
          <p>Similar to Stucki, another 12-neighbor algorithm. Produces slightly different results.</p>

          <h4>Atkinson</h4>
          <p>Apple HyperCard style. Weaker diffusion, produces a "retro pixel art" feel. Good for low-detail images.</p>

          <h4>Blue Noise</h4>
          <p>
            Ordered (aperiodic) dithering using Improved Gradient Noise. Creates a more uniform, natural-looking pattern than error diffusion.
          </p>

          <h4>Yliluoma #2</h4>
          <p>Pattern dithering optimized for pixel art. Works best with stylized, already-pixelated images.</p>

          <h4>KlussDither (Our Custom Algorithm)</h4>
          <p>
            Designed for anime and illustrations. Uses IGN-blend dithering with:
          </p>
          <ul>
            <li>Gamma-corrected error diffusion (perceptually accurate)</li>
            <li>Serpentine scanning (reduces banding)</li>
            <li>8-neighbor boundary detection (softer edges)</li>
            <li>Per-channel jitter (reduces color artifacts)</li>
            <li>Soft fade at image boundaries</li>
          </ul>
          <p><b>Best for:</b> Anime, illustrations, drawn art. Often produces the richest results.</p>

          <h4>Intensity slider</h4>
          <p>
            Controls how strongly the dithering spreads error. Low (20–40%) = cleaner, smoother. High (80–100%) = more color-accurate but noisier. Most images look good at 70–85%.
          </p>
        </div>
      ),
    },

    '2d-vs-3d': {
      title: '2D vs 3D Modes',
      content: (
        <div>
          <h4>2D Flat Mode</h4>
          <p>All blocks placed on a single Y-level.</p>
          <ul>
            <li><b>Available colors:</b> ~61 (one shade per block color)</li>
            <li><b>Build difficulty:</b> Easy — can be done entirely in survival mode</li>
            <li><b>Mod required:</b> No, can use MAP.DAT directly in vanilla</li>
            <li><b>File size:</b> Smaller</li>
            <li><b>Best for:</b> Logos, flat designs, survival players</li>
          </ul>

          <h4>3D Staircase Mode</h4>
          <p>Blocks placed at different heights (Y-levels) to create shading tones.</p>
          <ul>
            <li><b>Available colors:</b> ~183 (3 shades per block color = dark/medium/bright)</li>
            <li><b>Build difficulty:</b> Moderate to hard — requires Litematica mod to build accurately</li>
            <li><b>Mod required:</b> Yes, Litematica</li>
            <li><b>File size:</b> Slightly larger</li>
            <li><b>Best for:</b> Realistic photos, portraits, detailed scenes</li>
          </ul>

          <h4>How 3D shading works:</h4>
          <p>
            Minecraft map shading depends on the pixel's northward neighbor (Z-1):
          </p>
          <ul>
            <li><b>Shade 0 (dark):</b> North is higher → place current block 1 level lower</li>
            <li><b>Shade 1 (medium):</b> Same height → place current block at same level</li>
            <li><b>Shade 2 (bright):</b> North is lower → place current block 1 level higher</li>
          </ul>
          <p>This creates the 3D staircase effect when viewed on a map.</p>

          <h4>Support blocks in 3D mode</h4>
          <p>
            Some blocks (sand, gravel, glow lichen, etc.) can't float in mid-air. Choose a support block (e.g., stone, deepslate) and MapKluss will place it underneath:
          </p>
          <ul>
            <li><b>Mode 1:</b> Under floating blocks only (sand, gravel, lichen…)</li>
            <li><b>Mode 2:</b> One block under every art block (default, safest)</li>
            <li><b>Mode 3:</b> Two blocks under every art block (for very tall structures)</li>
          </ul>
        </div>
      ),
    },

    blocks: {
      title: 'Block Palette',
      content: (
        <div>
          <p>
            The <b>Palette</b> panel on the right lets you choose which Minecraft blocks to use. More blocks = more colors available = higher quality.
          </p>

          <h4>How to use:</h4>
          <ul>
            <li>
              <b>Toggle colors:</b> Click the dot (●) next to a color row to enable/disable it. Disabled colors won't appear in your map art.
            </li>
            <li>
              <b>Pick variants:</b> Click a block icon to choose which variant to use (e.g., oak wood vs spruce wood for the same brown color).
            </li>
            <li>
              <b>Deselect all:</b> Click "Clear" to disable all colors, then re-enable only what you want.
            </li>
            <li>
              <b>Search:</b> Type a block name to find specific colors (e.g., "oak" or "red").
            </li>
          </ul>

          <h4>Presets</h4>
          <p>
            Quick-start palettes for common scenarios:
          </p>
          <ul>
            <li><b>All blocks:</b> Every available color (default, best quality)</li>
            <li><b>Carpet Only:</b> Only dyed carpet colors (easy to farm, limited palette)</li>
            <li>Custom: Save your own preset for reuse</li>
          </ul>

          <h4>Share palette</h4>
          <p>
            Click <b>⬡ Share palette</b> to generate a link that encodes your exact block selection. Share with teammates to ensure everyone uses the same colors.
          </p>

          <h4>Tips for quality:</h4>
          <ul>
            <li>Enable all available blocks for best color accuracy (unless you're in a challenge)</li>
            <li>Avoid disabling entire color families (e.g., all reds) unless intentional</li>
            <li>In 2D mode, fewer colors = flatter look. In 3D mode, shading helps compensate</li>
          </ul>
        </div>
      ),
    },

    tools: {
      title: 'Paint Tools',
      content: (
        <div>
          <p>
            After processing an image, a toolbar appears above the preview with tools to refine your map art manually.
          </p>

          <h4>Cursor / Select</h4>
          <p>
            Default mode. Hover any pixel to see:
          </p>
          <ul>
            <li>Block name and texture</li>
            <li>RGB color value</li>
            <li>Shade (0=dark, 1=medium, 2=bright in 3D mode)</li>
          </ul>

          <h4>Eyedropper (E)</h4>
          <p>
            Click a pixel to pick its block and shade. The selected block appears in the toolbar. Useful for sampling colors from your preview.
          </p>

          <h4>Brush (B)</h4>
          <p>
            Paint pixels with the selected block. Brush sizes 1×1, 2×2, 3×3 available. In 3D mode, the brush preserves the shade you picked.
          </p>

          <h4>Fill (F)</h4>
          <p>
            Flood-fill: click a pixel to replace all connected pixels of the same color with your selected block. Useful for fixing large miscolored areas.
          </p>

          <h4>Block picker</h4>
          <p>
            Click <b>▾</b> to open a quick-select grid of all available blocks. Left-click to select, hover to preview shade colors (in 3D mode).
          </p>

          <h4>Shade selector (3D mode only)</h4>
          <p>
            Three color swatches show dark/medium/bright variants of the selected block. Click to choose which shade to paint with.
          </p>

          <h4>Undo / Redo</h4>
          <p>
            <code>↩</code> Undo (Ctrl+Z), <code>↪</code> Redo (Ctrl+Y). Full paint history.
          </p>

          <h4>View options</h4>
          <ul>
            <li><b>Blocks:</b> Toggle block textures on/off in preview</li>
            <li><b>Grid:</b> Overlay a grid to see block boundaries</li>
            <li><b>Compare:</b> Split-slider view to compare original vs processed</li>
          </ul>
        </div>
      ),
    },

    export: {
      title: 'Export Formats',
      content: (
        <div>
          <h4>↓ PNG</h4>
          <p>
            Download the processed map art as an image file. Useful for:
          </p>
          <ul>
            <li>Previewing the final result offline</li>
            <li>Sharing a preview before building</li>
            <li>Creating a reference image for manual building</li>
          </ul>

          <h4>↓ MAP.DAT</h4>
          <p>
            Ready-to-use Minecraft map files. One per 128×128 tile.
          </p>
          <ul>
            <li><b>Where to place:</b> <code>.minecraft/saves/[world]/data/map_*.dat</code></li>
            <li><b>How to view:</b> Open the map in-game by right-clicking a map in your inventory</li>
            <li><b>No mod required:</b> Works in vanilla survival</li>
            <li><b>Best for:</b> Vanilla players, quick reference</li>
          </ul>

          <h4>↓ LITEMATIC</h4>
          <p>
            Building schematic for the <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">Litematica mod</a>.
          </p>
          <ul>
            <li><b>Format:</b> Single .litematic file containing the full structure</li>
            <li><b>2D mode:</b> Flat schematic (blocks at Y=0)</li>
            <li><b>3D mode:</b> Staircase schematic with variable heights + support layer</li>
            <li><b>How to use:</b> Open Litematica and load the file, then use the "Build" feature to guide placement</li>
            <li><b>Best for:</b> Accurate building with visual guides</li>
          </ul>

          <h4>↓ ZIP (Multi-map grids only)</h4>
          <p>
            Splits a multi-map grid into separate 128×128 .litematic files, one per tile.
          </p>
          <ul>
            <li><b>File naming:</b> <code>mapart_1.litematic</code>, <code>mapart_2.litematic</code>, etc. (Z-order: left→right, top→bottom)</li>
            <li><b>Use case:</b> Building with a team — each person takes 1–2 tiles</li>
            <li><b>Tip:</b> Unzip all files into your Litematica schematics folder</li>
          </ul>

          <h4>🔗 GET LINK</h4>
          <p>
            Generate a shareable permalink that encodes your image + all settings.
          </p>
          <ul>
            <li><b>What's saved:</b> Image data, grid size, dithering, intensity, palette selection, adjustments, map mode</li>
            <li><b>No account needed:</b> Works via URL parameters</li>
            <li><b>Persistence:</b> Link never expires (depends on server)</li>
            <li><b>Use case:</b> Collaborate with teammates, bookmark your project, resume later</li>
          </ul>
        </div>
      ),
    },

    tips: {
      title: 'Pro Tips & Tricks',
      content: (
        <div>
          <h4>Image preparation</h4>
          <ul>
            <li><b>Increase contrast:</b> Minecraft's palette is less vibrant than photos. Bumping contrast by +10–20 helps a lot.</li>
            <li><b>Boost saturation:</b> +10–15 makes colors pop. Avoid oversaturation.</li>
            <li><b>Reduce brightness:</b> Dark images often convert better than bright ones.</li>
            <li><b>Crop smartly:</b> Use the crop tool (in left panel) to match your map grid aspect ratio exactly.</li>
          </ul>

          <h4>Dithering strategy</h4>
          <ul>
            <li><b>Anime/illustrations:</b> Try KlussDither first (intensity 70–85%)</li>
            <li><b>Photos:</b> Start with Floyd–Steinberg (intensity 75–90%)</li>
            <li><b>Low-poly art:</b> Try Yliluoma #2 or Atkinson</li>
            <li><b>Experiment:</b> Process the same image with 2–3 algorithms and compare</li>
          </ul>

          <h4>Block palette optimization</h4>
          <ul>
            <li><b>Start with all blocks:</b> Disable colors only if you have a reason (e.g., no access to a specific block)</li>
            <li><b>Disable entire rows if needed:</b> Click the dot next to a color to toggle the whole family</li>
            <li><b>Check material costs:</b> The Materials list shows exact block counts — plan gathering/farming accordingly</li>
          </ul>

          <h4>Building in survival</h4>
          <ul>
            <li><b>2D mode is easier:</b> All blocks on one level, no height precision needed</li>
            <li><b>Use Litematica:</b> Even in survival, Litematica's ghost blocks make placement foolproof</li>
            <li><b>Build in chunks:</b> Work tile-by-tile (one 128×128 section at a time) to stay organized</li>
            <li><b>Copy+paste:</b> If your art has repeating patterns, build one section and clone it</li>
          </ul>

          <h4>Multi-map coordination</h4>
          <ul>
            <li><b>Use ZIP export:</b> Everyone gets a separate .litematic file for their tile</li>
            <li><b>Share palette:</b> Generate a palette link so all teammates use the exact same blocks</li>
            <li><b>Save the link:</b> Bookmark the main project link so anyone can regenerate tiles if needed</li>
          </ul>

          <h4>Quality troubleshooting</h4>
          <ul>
            <li><b>Too noisy?</b> Lower intensity or try a different dithering algorithm</li>
            <li><b>Too flat?</b> Use 3D mode (if you have the mod) or increase contrast in adjustments</li>
            <li><b>Wrong colors?</b> Check your palette — you might have disabled important colors</li>
            <li><b>Artefacts?</b> Try smoothing the original image before uploading, or use KlussDither</li>
          </ul>
        </div>
      ),
    },

    troubleshoot: {
      title: 'Troubleshooting',
      content: (
        <div>
          <h4>Image won't load</h4>
          <ul>
            <li>Supported formats: PNG, JPG, WebP</li>
            <li>Max file size: usually ~50 MB (browser dependent)</li>
            <li>Try converting to PNG if the original format fails</li>
          </ul>

          <h4>Preview looks wrong</h4>
          <ul>
            <li><b>Too pixelated?</b> Disable block textures (toggle "Blocks" in toolbar)</li>
            <li><b>Colors off?</b> Check palette — you might have disabled colors</li>
            <li><b>Artifacts?</b> Try a different dithering algorithm or lower intensity</li>
          </ul>

          <h4>Blocks are floating (3D mode)</h4>
          <ul>
            <li>Select a support block in the Palette panel</li>
            <li>MapKluss will automatically place support blocks underneath floating blocks</li>
            <li>If still floating: Check that the support block isn't also floating (e.g., if you disabled all stone variants)</li>
          </ul>

          <h4>MAP.DAT won't load in-game</h4>
          <ul>
            <li>Correct path: <code>.minecraft/saves/[worldname]/data/</code></li>
            <li>Right-click a map item in inventory to view</li>
            <li>Make sure the game is closed before placing files</li>
            <li>Try recreating the map in-game and opening it (may re-index the file)</li>
          </ul>

          <h4>LITEMATIC won't load in Litematica</h4>
          <ul>
            <li>Correct path: <code>.minecraft/schematics/</code> (or wherever Litematica is configured)</li>
            <li>Make sure Litematica is installed and working</li>
            <li>Try /schem list in-game to refresh the schematic list</li>
          </ul>

          <h4>ZIP files are corrupted</h4>
          <ul>
            <li>Don't rename or modify the zip while downloading</li>
            <li>Unzip completely before using individual files</li>
            <li>If extraction fails, try a different unzip tool</li>
          </ul>

          <h4>Share link doesn't work</h4>
          <ul>
            <li>Make sure you copied the full URL</li>
            <li>Links are permanent (don't expire)</li>
            <li>If the link is very long, it encodes a large image — that's normal</li>
          </ul>

          <h4>Performance is slow</h4>
          <ul>
            <li>Very large images (4000×4000+) may lag during processing</li>
            <li>Crop or reduce image size before uploading</li>
            <li>Close other browser tabs to free up memory</li>
          </ul>

          <h4>Still stuck?</h4>
          <p>
            Check the <b>? GUIDE</b> button for a step-by-step interactive tour, or review the relevant section above.
          </p>
        </div>
      ),
    },
  };

  const sectionList: { id: WikiSection; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'map-grid', label: 'Map Sizes' },
    { id: 'dithering', label: 'Dithering' },
    { id: '2d-vs-3d', label: '2D vs 3D' },
    { id: 'blocks', label: 'Blocks' },
    { id: 'tools', label: 'Tools' },
    { id: 'export', label: 'Export' },
    { id: 'tips', label: 'Tips' },
    { id: 'troubleshoot', label: 'Help' },
  ];

  const current = sections[activeSection];

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div className="wiki-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-header">
          <h2>MapKluss Wiki</h2>
          <button className="wiki-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="wiki-container">
          <div className="wiki-sidebar">
            {sectionList.map(({ id, label }) => (
              <button
                key={id}
                className={`wiki-nav-btn${activeSection === id ? ' active' : ''}`}
                onClick={() => setActiveSection(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="wiki-content">
            <h3>{current.title}</h3>
            {current.content}
          </div>
        </div>
      </div>
    </div>
  );
}
