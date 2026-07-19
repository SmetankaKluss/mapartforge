import JSZip from 'jszip';
import { Zip, ZipDeflate } from 'fflate';
import { companionSlug, sha256Hex } from './companionArtifacts';
import { extractTile, writeLitematicNbt } from './exportLitematic';
import {
  SUPPRESSION_MAX_BUNDLE_BYTES,
  SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES,
  SUPPRESSION_MAX_LITEMATIC_BYTES,
  SUPPRESSION_MAX_PLAN_BYTES,
  buildTwoLayerPlanDraft,
  evaluateSuppressionEligibility,
  type SuppressionPlanV3,
  type SuppressionPlannerInput,
} from './suppressionPlan';
import type { MapGrid } from './types';

export const SUPPRESSION_PLAN_MIME = 'application/vnd.mapkluss.suppression-plan+json;version=3';
export const SUPPRESSION_BUNDLE_SCHEMA = 'mapkluss.suppression-bundle' as const;
export const SUPPRESSION_BUNDLE_VERSION = 2 as const;
export const SUPPRESSION_BUNDLE_MIME = 'application/vnd.mapkluss.suppression-bundle+zip;version=2';

export interface SuppressionArtifacts {
  plan: SuppressionPlanV3;
  planJson: string;
  planBlob: Blob;
  litematicBytes: Uint8Array;
  litematicBlob: Blob;
  planFilename: string;
  litematicFilename: string;
  summary: {
    phases: number;
    initialBlocks: number;
    recoverableBlocks: number;
  };
}

export interface SuppressionBundleTile {
  id: string;
  index: number;
  column: number;
  row: number;
  artifacts: SuppressionArtifacts;
}

export interface SuppressionMultiMapArtifacts {
  title: string;
  grid: MapGrid;
  tiles: SuppressionBundleTile[];
  summary: {
    maps: number;
    phases: number;
    initialBlocks: number;
    recoverableBlocks: number;
  };
}

const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

export async function buildSuppressionArtifacts(
  title: string,
  input: SuppressionPlannerInput,
  options: { filenameStem?: string } = {},
): Promise<SuppressionArtifacts> {
  const built = buildTwoLayerPlanDraft(input);
  const slug = companionSlug(options.filenameStem ?? title).slice(0, 96);
  const litematicFilename = `${slug}_1x1_suppression.litematic`;
  const planFilename = `${slug}_1x1_suppression_plan.json`;
  const litematicBytes = await writeLitematicNbt(built.volume, `${slug}_two_layer`, {
    minecraftVersion: input.minecraftVersion,
    timestampMs: 0,
  });
  if (litematicBytes.byteLength > SUPPRESSION_MAX_LITEMATIC_BYTES) {
    throw new Error('Two-layer Litematic exceeds the 16 MiB safety limit.');
  }
  const litematicSha256 = await sha256Hex(litematicBytes);
  const plan: SuppressionPlanV3 = {
    ...built.plan,
    litematic: { filename: litematicFilename, sha256: litematicSha256 },
  };
  // Compact plans make large mosaics practical while remaining plain JSON and
  // fully compatible with existing v3 readers.
  const planJson = `${JSON.stringify(plan)}\n`;
  const planBytes = new TextEncoder().encode(planJson);
  if (planBytes.byteLength > SUPPRESSION_MAX_PLAN_BYTES) {
    throw new Error('Two-layer plan exceeds the 4 MiB safety limit.');
  }
  return {
    plan,
    planJson,
    planBlob: new Blob([planJson], { type: SUPPRESSION_PLAN_MIME }),
    litematicBytes,
    litematicBlob: new Blob([new Uint8Array(litematicBytes)], { type: 'application/octet-stream' }),
    planFilename,
    litematicFilename,
    summary: built.summary,
  };
}

function eligibilityMessage(input: SuppressionPlannerInput): string {
  const result = evaluateSuppressionEligibility(input);
  return result.reasons
    .map(reason => `${reason.code}${reason.detail ? `:${reason.detail}` : ''}`)
    .join(', ');
}

export async function buildSuppressionMultiMapArtifacts(
  title: string,
  input: SuppressionPlannerInput,
): Promise<SuppressionMultiMapArtifacts> {
  const eligibility = evaluateSuppressionEligibility(input);
  if (!eligibility.eligible) {
    throw new Error(`Two-layer is not available: ${eligibilityMessage(input)}`);
  }

  const tiles: SuppressionBundleTile[] = [];
  const base = companionSlug(title).slice(0, 64);
  const total = input.grid.wide * input.grid.tall;
  const padWidth = Math.max(3, String(total).length);
  let expandedPayloadBytes = 0;
  let index = 1;
  for (let row = 0; row < input.grid.tall; row++) {
    for (let column = 0; column < input.grid.wide; column++) {
      const id = `tile_${String(index).padStart(padWidth, '0')}`;
      const coordinate = `${column + 1}x${row + 1}`;
      const artifacts = await buildSuppressionArtifacts(title, {
        ...input,
        imageData: extractTile(input.imageData as ImageData, column, row),
        grid: { wide: 1, tall: 1 },
      }, {
        filenameStem: `${base}_part_${String(index).padStart(padWidth, '0')}_${coordinate}`,
      });
      expandedPayloadBytes += new TextEncoder().encode(artifacts.planJson).byteLength
        + artifacts.litematicBytes.byteLength;
      if (expandedPayloadBytes > SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES) {
        throw new Error('Two-layer bundle expands beyond the 192 MiB safety limit. Reduce the map grid.');
      }
      tiles.push({ id, index, column, row, artifacts });
      index++;
    }
  }

  return {
    title,
    grid: { wide: input.grid.wide, tall: input.grid.tall },
    tiles,
    summary: {
      maps: tiles.length,
      phases: tiles.reduce((sum, tile) => sum + tile.artifacts.summary.phases, 0),
      initialBlocks: tiles.reduce((sum, tile) => sum + tile.artifacts.summary.initialBlocks, 0),
      recoverableBlocks: tiles.reduce((sum, tile) => sum + tile.artifacts.summary.recoverableBlocks, 0),
    },
  };
}

function readmeRu(artifacts: SuppressionArtifacts): string {
  return [
    'MapKluss Two-layer — экспериментальный режим',
    '',
    '1. Импортируй suppression.litematic и построй только сам двухслойный арт.',
    '2. В Companion открой Two-layer и выбери этот ZIP.',
    '3. Возьми чистую незаблокированную карту масштаба 0 и укажи северо-западную опору арта.',
    '4. Следуй подсветке и вручную бери карту в руку только на отмеченной точке.',
    '5. После итоговой проверки заблокируй карту стеклянной панелью.',
    '',
    `Этапов: ${artifacts.summary.phases}`,
    `Блоков в полной схеме: ${artifacts.summary.initialBlocks}`,
    `Можно вернуть после демонтажа: ${artifacts.summary.recoverableBlocks}`,
    '',
    'Во время записи стой неподвижно и не открывай карту по пути между точками.',
    'Companion не блокирует инвентарь и не берёт карту вместо игрока.',
    'MapKluss не ломает и не ставит блоки автоматически.',
  ].join('\n');
}

function readmeEn(artifacts: SuppressionArtifacts): string {
  return [
    'MapKluss Two-layer — experimental workflow',
    '',
    '1. Import suppression.litematic and build only the two-layer art itself.',
    '2. Open Two-layer in Companion and select this ZIP.',
    '3. Hold a clean unlocked scale-0 map and select the support block below the art’s north-west edge.',
    '4. Follow the highlights and manually hold the map only while standing on the marked point.',
    '5. After final verification, lock the map with a glass pane.',
    '',
    `Phases: ${artifacts.summary.phases}`,
    `Blocks in the complete schematic: ${artifacts.summary.initialBlocks}`,
    `Recoverable after removal: ${artifacts.summary.recoverableBlocks}`,
    '',
    'Stand still during capture and do not open the map while travelling between points.',
    'Companion does not lock inventory controls or equip the map for you.',
    'MapKluss never places or breaks blocks automatically.',
  ].join('\n');
}

function multiReadmeRu(grid: MapGrid, maps: number): string {
  return [
    'MapKluss Two-layer — большой арт',
    '',
    `Сетка: ${grid.wide}×${grid.tall} карт.`,
    `Частей в архиве: ${maps}.`,
    '',
    '1. Открой Two-layer в Companion и импортируй этот ZIP.',
    '2. Выбери нужную часть. Нумерация идёт слева направо, затем сверху вниз.',
    '3. Companion установит схему и откроет отдельную сессию только для выбранной карты.',
    '4. Возьми чистую незаблокированную карту масштаба 0 и следуй подсветке.',
    '5. После завершения останови сессию и выбери следующую часть из того же ZIP.',
    '',
    'Companion не блокирует инвентарь, не берёт карту вместо игрока, не ломает и не ставит блоки.',
  ].join('\n');
}

function multiReadmeEn(grid: MapGrid, maps: number): string {
  return [
    'MapKluss Two-layer — large map art',
    '',
    `Grid: ${grid.wide}×${grid.tall} maps.`,
    `Parts in this archive: ${maps}.`,
    '',
    '1. Open Two-layer in Companion and import this ZIP.',
    '2. Choose a part. Numbering runs left to right, then top to bottom.',
    '3. Companion installs the schematic and starts a separate session only for the selected map.',
    '4. Hold a clean unlocked scale-0 map and follow the highlights.',
    '5. After completion, stop the session and choose the next part from the same ZIP.',
    '',
    'Companion does not lock inventory controls, equip maps for you, break blocks, or place blocks.',
  ].join('\n');
}

interface StreamingZipWriter {
  add(path: string, bytes: Uint8Array): void;
  finish(): Promise<Blob>;
  abort(): void;
  expandedBytes(): number;
}

function createStreamingZipWriter(): StreamingZipWriter {
  const chunks: Uint8Array[] = [];
  let compressedBytes = 0;
  let expandedBytes = 0;
  let settled = false;
  let fatalError: Error | null = null;
  let resolveCompletion!: (blob: Blob) => void;
  let rejectCompletion!: (error: Error) => void;
  const completion = new Promise<Blob>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    fatalError = error;
    rejectCompletion(error);
  };
  const zip = new Zip((error, data, final) => {
    if (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    compressedBytes += data.byteLength;
    if (compressedBytes > SUPPRESSION_MAX_BUNDLE_BYTES) {
      fail(new Error('Two-layer bundle exceeds the 128 MiB compressed safety limit. Reduce the map grid.'));
      return;
    }
    chunks.push(data);
    if (final && !settled) {
      settled = true;
      resolveCompletion(new Blob(chunks.map(chunk => new Uint8Array(chunk)), { type: SUPPRESSION_BUNDLE_MIME }));
    }
  });

  return {
    add(path, bytes) {
      if (fatalError) throw fatalError;
      expandedBytes += bytes.byteLength;
      if (expandedBytes > SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES) {
        throw new Error('Two-layer bundle expands beyond the 192 MiB safety limit. Reduce the map grid.');
      }
      const entry = new ZipDeflate(path, { level: 9 });
      entry.mtime = ZIP_DATE;
      entry.os = 0;
      zip.add(entry);
      entry.push(bytes, true);
      if (fatalError) throw fatalError;
    },
    finish() {
      zip.end();
      return completion;
    },
    abort() {
      zip.terminate();
      void completion.catch(() => undefined);
    },
    expandedBytes: () => expandedBytes,
  };
}

/**
 * Production multi-map path. Each tile is generated, hashed and compressed
 * before the next tile is built, so a 10x10 art does not retain 100 full plans
 * and Litematics in browser memory.
 */
export async function buildSuppressionMultiMapZipFromInput(
  title: string,
  input: SuppressionPlannerInput,
): Promise<Blob> {
  const eligibility = evaluateSuppressionEligibility(input);
  if (!eligibility.eligible) {
    throw new Error(`Two-layer is not available: ${eligibilityMessage(input)}`);
  }

  const writer = createStreamingZipWriter();
  try {
    const base = companionSlug(title).slice(0, 64);
    const total = input.grid.wide * input.grid.tall;
    const padWidth = Math.max(3, String(total).length);
    const manifestTiles = [];
    const manifestFiles = [];
    let phases = 0;
    let initialBlocks = 0;
    let recoverableBlocks = 0;
    let index = 1;

    for (let row = 0; row < input.grid.tall; row++) {
      for (let column = 0; column < input.grid.wide; column++) {
        const id = `tile_${String(index).padStart(padWidth, '0')}`;
        const coordinate = `${column + 1}x${row + 1}`;
        const artifacts = await buildSuppressionArtifacts(title, {
          ...input,
          imageData: extractTile(input.imageData as ImageData, column, row),
          grid: { wide: 1, tall: 1 },
        }, {
          filenameStem: `${base}_part_${String(index).padStart(padWidth, '0')}_${coordinate}`,
        });
        const folder = `tiles/${id}_${coordinate}`;
        const planPath = `${folder}/${artifacts.planFilename}`;
        const litematicPath = `${folder}/${artifacts.litematicFilename}`;
        const planBytes = new TextEncoder().encode(artifacts.planJson);
        const planSha256 = await sha256Hex(planBytes);
        writer.add(litematicPath, artifacts.litematicBytes);
        writer.add(planPath, planBytes);
        manifestFiles.push(
          { path: litematicPath, sizeBytes: artifacts.litematicBytes.byteLength, sha256: artifacts.plan.litematic.sha256 },
          { path: planPath, sizeBytes: planBytes.byteLength, sha256: planSha256 },
        );
        manifestTiles.push({
          id, index, column, row,
          plan: { path: planPath, sizeBytes: planBytes.byteLength, sha256: planSha256 },
          litematic: {
            path: litematicPath,
            sizeBytes: artifacts.litematicBytes.byteLength,
            sha256: artifacts.plan.litematic.sha256,
          },
          summary: artifacts.summary,
        });
        phases += artifacts.summary.phases;
        initialBlocks += artifacts.summary.initialBlocks;
        recoverableBlocks += artifacts.summary.recoverableBlocks;
        index++;
        if ((index & 3) === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const ru = new TextEncoder().encode(`${multiReadmeRu(input.grid, total)}\n`);
    const en = new TextEncoder().encode(`${multiReadmeEn(input.grid, total)}\n`);
    writer.add('README_RU.txt', ru);
    writer.add('README_EN.txt', en);
    manifestFiles.push(
      { path: 'README_RU.txt', sizeBytes: ru.byteLength, sha256: await sha256Hex(ru) },
      { path: 'README_EN.txt', sizeBytes: en.byteLength, sha256: await sha256Hex(en) },
    );
    const manifest = new TextEncoder().encode(`${JSON.stringify({
      schema: SUPPRESSION_BUNDLE_SCHEMA,
      version: SUPPRESSION_BUNDLE_VERSION,
      title,
      grid: { wide: input.grid.wide, tall: input.grid.tall },
      tileOrder: 'row_major_top_left',
      tiles: manifestTiles,
      files: manifestFiles,
      summary: { maps: total, phases, initialBlocks, recoverableBlocks },
    })}\n`);
    writer.add('SHA256.json', manifest);
    if (writer.expandedBytes() > SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES) {
      throw new Error('Two-layer bundle expands beyond the 192 MiB safety limit. Reduce the map grid.');
    }
    return await writer.finish();
  } catch (error) {
    writer.abort();
    throw error;
  }
}

export async function buildSuppressionZipBlob(artifacts: SuppressionArtifacts): Promise<Blob> {
  const zip = new JSZip();
  const ru = `${readmeRu(artifacts)}\n`;
  const en = `${readmeEn(artifacts)}\n`;
  const files = [
    { path: artifacts.litematicFilename, body: artifacts.litematicBytes },
    { path: artifacts.planFilename, body: artifacts.planJson },
    { path: 'README_RU.txt', body: ru },
    { path: 'README_EN.txt', body: en },
  ] as const;
  const manifestFiles = [];
  for (const file of files) {
    const bytes = typeof file.body === 'string' ? new TextEncoder().encode(file.body) : file.body;
    manifestFiles.push({ path: file.path, sizeBytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
    zip.file(file.path, file.body, { date: ZIP_DATE });
  }
  const manifest = `${JSON.stringify({
    schema: SUPPRESSION_BUNDLE_SCHEMA,
    version: 1,
    files: manifestFiles,
  }, null, 2)}\n`;
  zip.file('SHA256.json', manifest, { date: ZIP_DATE });
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

export async function buildSuppressionMultiMapZipBlob(bundle: SuppressionMultiMapArtifacts): Promise<Blob> {
  const zip = new JSZip();
  const files: Array<{ path: string; body: Uint8Array | string }> = [];
  const manifestTiles = [];

  for (const tile of bundle.tiles) {
    const folder = `tiles/${tile.id}_${tile.column + 1}x${tile.row + 1}`;
    const planPath = `${folder}/${tile.artifacts.planFilename}`;
    const litematicPath = `${folder}/${tile.artifacts.litematicFilename}`;
    const planBytes = new TextEncoder().encode(tile.artifacts.planJson);
    files.push(
      { path: litematicPath, body: tile.artifacts.litematicBytes },
      { path: planPath, body: tile.artifacts.planJson },
    );
    manifestTiles.push({
      id: tile.id,
      index: tile.index,
      column: tile.column,
      row: tile.row,
      plan: {
        path: planPath,
        sizeBytes: planBytes.byteLength,
        sha256: await sha256Hex(planBytes),
      },
      litematic: {
        path: litematicPath,
        sizeBytes: tile.artifacts.litematicBytes.byteLength,
        sha256: tile.artifacts.plan.litematic.sha256,
      },
      summary: tile.artifacts.summary,
    });
  }

  files.push(
    { path: 'README_RU.txt', body: `${multiReadmeRu(bundle.grid, bundle.tiles.length)}\n` },
    { path: 'README_EN.txt', body: `${multiReadmeEn(bundle.grid, bundle.tiles.length)}\n` },
  );
  const manifestFiles = [];
  for (const file of files) {
    const bytes = typeof file.body === 'string' ? new TextEncoder().encode(file.body) : file.body;
    manifestFiles.push({ path: file.path, sizeBytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
    zip.file(file.path, file.body, { date: ZIP_DATE, createFolders: false });
  }
  const manifest = `${JSON.stringify({
    schema: SUPPRESSION_BUNDLE_SCHEMA,
    version: SUPPRESSION_BUNDLE_VERSION,
    title: bundle.title,
    grid: bundle.grid,
    tileOrder: 'row_major_top_left',
    tiles: manifestTiles,
    files: manifestFiles,
  })}\n`;
  const expandedBytes = files.reduce((sum, file) => sum + (
    typeof file.body === 'string' ? new TextEncoder().encode(file.body).byteLength : file.body.byteLength
  ), 0) + new TextEncoder().encode(manifest).byteLength;
  if (expandedBytes > SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES) {
    throw new Error('Two-layer bundle expands beyond the 192 MiB safety limit. Reduce the map grid.');
  }
  zip.file('SHA256.json', manifest, { date: ZIP_DATE });
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  if (blob.size > SUPPRESSION_MAX_BUNDLE_BYTES) {
    throw new Error('Two-layer bundle exceeds the 128 MiB safety limit. Reduce the map grid.');
  }
  return blob;
}

export function downloadSuppressionZip(blob: Blob, title: string, grid: MapGrid = { wide: 1, tall: 1 }): void {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), {
    href: url,
    download: `${companionSlug(title)}_${grid.wide}x${grid.tall}_two_layer.zip`,
  });
  anchor.click();
  URL.revokeObjectURL(url);
}
