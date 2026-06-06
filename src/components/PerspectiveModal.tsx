import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { MapGrid } from '../lib/types';
import type { SupportMode } from '../lib/exportLitematic';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { useLocale } from '../lib/useLocale';
import {
  buildSchematicPreviewModel,
  getSceneArtSize,
  SCENE_PRESETS,
  type PreviewMode,
  type SchematicPreviewBlock,
} from '../lib/preview3d';
import {
  loadGallerySceneLitematic,
  type SceneFrameAnchor,
  type SceneLitematicAsset,
  type ScenePaletteEntry,
} from '../lib/sceneLitematic';
import { wikiTextureUrl } from '../lib/blockTexture';

interface Props {
  imageData: ImageData | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  supportMode: SupportMode;
  supportBlock: string;
  mapGrid: MapGrid;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onClose: () => void;
}

type SchematicView = 'perspective' | 'top' | 'side';
type SchematicDisplay = 'art' | 'full' | 'height';

const SCHEMATIC_VIEW_OPTIONS: SchematicView[] = ['perspective', 'top', 'side'];
const SCHEMATIC_DISPLAY_OPTIONS: SchematicDisplay[] = ['art', 'full', 'height'];
const SCENE_EDGE_MATERIAL = new THREE.LineBasicMaterial({
  color: 0x171410,
  transparent: true,
  opacity: 0.26,
  depthWrite: false,
});

const GALLERY_CAMERA_BOUNDS = {
  min: new THREE.Vector3(-4.38, 0.85, -8.95),
  max: new THREE.Vector3(0.18, 7.15, 8.95),
  targetMin: new THREE.Vector3(-0.25, 1.1, -3.2),
  targetMax: new THREE.Vector3(0.5, 5.65, 3.2),
};

const TEXTURE_NAME_OVERRIDES: Record<string, string> = {
  grass_block_top: 'Grass_Block_Top',
  grass_block_side: 'Grass_Block_Side',
  dirt: 'Dirt',
  oak_planks: 'Oak_Planks',
  white_concrete: 'White_Concrete',
  black_concrete: 'Black_Concrete',
  smooth_sandstone: 'Smooth_Sandstone',
  gray_stained_glass_pane: 'Gray_Stained_Glass_Pane',
  red_carpet: 'Red_Carpet',
  dark_oak_planks: 'Dark_Oak_Planks',
  spruce_planks: 'Spruce_Planks',
  composter_side: 'Composter_Side',
  composter_top: 'Composter_Top',
  lectern_base: 'Lectern_Base',
  lectern_front: 'Lectern_Front',
  lectern_side: 'Lectern_Side',
  cherry_leaves: 'Cherry_Leaves',
};

const FALLBACK_TEXTURE_COLORS: Record<string, [string, string, string]> = {
  grass_block_top: ['#5d9a3a', '#6fb148', '#44762f'],
  grass_block_side: ['#7a5a33', '#5d9a3a', '#3f6d2b'],
  dirt: ['#7a5436', '#8a6040', '#5f3e28'],
  oak_planks: ['#a9834f', '#bd955d', '#725531'],
  white_concrete: ['#d8d5cc', '#ebe7dc', '#bdb8ad'],
  black_concrete: ['#171719', '#26262b', '#080809'],
  smooth_sandstone: ['#c8b982', '#ddcf99', '#9f8f5f'],
  gray_stained_glass_pane: ['#8d96a1', '#c0c8d1', '#5f6872'],
  red_carpet: ['#a32322', '#c43632', '#691716'],
  dark_oak_planks: ['#4a2f1c', '#604026', '#2f1e12'],
  spruce_planks: ['#705234', '#8a6741', '#4c3722'],
  composter_side: ['#5f4125', '#7d5a34', '#332312'],
  composter_top: ['#4d341e', '#6b4a2a', '#26180c'],
  lectern_base: ['#73512f', '#9b7140', '#3c2918'],
  lectern_front: ['#8b6339', '#bd8d53', '#4a321d'],
  lectern_side: ['#6b4a2b', '#9d7442', '#3f2b19'],
  cherry_leaves: ['#bd6e86', '#d88aa0', '#7d4051'],
};

const LOCAL_ONLY_SCENE_TEXTURES = new Set([
  'grass_block_top',
  'grass_block_side',
  'composter_side',
  'composter_top',
  'lectern_base',
  'lectern_front',
  'lectern_side',
]);

const SUPPORT_COLORS: Record<string, number> = {
  stone: 0x8d8d8d,
  cobblestone: 0x767676,
  deepslate: 0x4d4d57,
  smooth_stone: 0xb0aeaa,
  granite: 0x8c5f4e,
  diorite: 0xc4c1bd,
  andesite: 0x7a7a80,
  dirt: 0x7b5a3c,
  oak_planks: 0xa57b47,
  netherrack: 0x6a3434,
  blackstone: 0x38343d,
  air: 0x7c7568,
};

function imageDataToTexture(imageData: ImageData): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function downloadCanvasImage(canvas: HTMLCanvasElement, filename: string) {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function makeInstancedVoxelGroup(
  blocks: SchematicPreviewBlock[],
  center: { x: number; y: number; z: number },
  analyticalView = false,
) {
  const root = new THREE.Group();
  if (blocks.length === 0) return root;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const tempMatrix = new THREE.Matrix4();
  const colorBuckets = new Map<string, SchematicPreviewBlock[]>();

  for (const block of blocks) {
    const key = `${block.kind}:${block.color}`;
    const bucket = colorBuckets.get(key);
    if (bucket) bucket.push(block);
    else colorBuckets.set(key, [block]);
  }

  for (const [key, bucket] of colorBuckets) {
    const [kind, colorStr] = key.split(':');
    const color = Number(colorStr);
    const opacity = analyticalView
      ? kind === 'art' ? 0.48 : kind === 'support' ? 0.18 : 0.22
      : kind === 'noobline' ? 0.72 : kind === 'support' ? 0.92 : 1;
    const material = new THREE.MeshLambertMaterial({
      color,
      transparent: analyticalView || kind !== 'art',
      opacity,
      depthWrite: !analyticalView,
    });
    const instanced = new THREE.InstancedMesh(geometry, material, bucket.length);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bucket.forEach((block, index) => {
      tempMatrix.makeTranslation(
        block.x - center.x,
        block.y + 0.5 - center.y,
        -block.z - center.z,
      );
      instanced.setMatrixAt(index, tempMatrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.frustumCulled = false;
    instanced.renderOrder = kind === 'art' ? 2 : kind === 'support' ? 1 : 0;
    root.add(instanced);
  }

  return root;
}

function makeTopProjectionGroup(
  blocks: SchematicPreviewBlock[],
  center: { x: number; z: number },
) {
  const root = new THREE.Group();
  if (blocks.length === 0) return root;
  const geometry = new THREE.BoxGeometry(1, 0.08, 1);
  const tempMatrix = new THREE.Matrix4();
  const footprint = new Map<string, SchematicPreviewBlock>();

  for (const block of blocks) {
    const key = `${block.kind}:${block.x}:${block.z}`;
    const existing = footprint.get(key);
    if (!existing || block.y > existing.y) footprint.set(key, block);
  }

  const colorBuckets = new Map<string, SchematicPreviewBlock[]>();
  for (const block of footprint.values()) {
    const key = `${block.kind}:${block.color}`;
    const bucket = colorBuckets.get(key);
    if (bucket) bucket.push(block);
    else colorBuckets.set(key, [block]);
  }

  for (const [key, bucket] of colorBuckets) {
    const [kind, colorStr] = key.split(':');
    const material = new THREE.MeshLambertMaterial({
      color: Number(colorStr),
      transparent: kind !== 'art',
      opacity: kind === 'art' ? 1 : kind === 'support' ? 0.22 : 0.35,
      depthWrite: false,
    });
    const instanced = new THREE.InstancedMesh(geometry, material, bucket.length);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bucket.forEach((block, index) => {
      tempMatrix.makeTranslation(
        block.x - center.x,
        kind === 'art' ? 0.06 : kind === 'support' ? 0.02 : 0.1,
        -block.z + center.z,
      );
      instanced.setMatrixAt(index, tempMatrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.frustumCulled = false;
    instanced.renderOrder = kind === 'art' ? 2 : kind === 'support' ? 0 : 1;
    root.add(instanced);
  }

  return root;
}

function makeBlockTexture(kind: 'gallery-wall' | 'gallery-floor' | 'nether-wall' | 'nether-floor' | 'house-wall' | 'house-floor') {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const fill = (base: string, accent: string, line: string, noisy = false) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 8) {
      for (let x = 0; x < 32; x += 8) {
        ctx.fillStyle = ((x + y) / 8) % 2 === 0 ? accent : base;
        ctx.fillRect(x, y, 8, 8);
        if (noisy) {
          ctx.fillStyle = line;
          ctx.fillRect(x + 2, y + 1, 2, 2);
          ctx.fillRect(x + 5, y + 5, 1, 1);
        }
      }
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 32; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i + 0.5, 0);
      ctx.lineTo(i + 0.5, 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i + 0.5);
      ctx.lineTo(32, i + 0.5);
      ctx.stroke();
    }
  };

  switch (kind) {
    case 'gallery-wall': fill('#b8ae9a', '#c6bba5', '#908773'); break;
    case 'gallery-floor': fill('#7f5c37', '#936d44', '#5b4125'); break;
    case 'nether-wall': fill('#6a2f2b', '#7c3c34', '#4b1e1c', true); break;
    case 'nether-floor': fill('#3d2b2f', '#4c3438', '#211518', true); break;
    case 'house-wall': fill('#d8ceb8', '#e4dbc8', '#ac9d83'); break;
    case 'house-floor': fill('#9e6d3e', '#b57f49', '#734c29'); break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function textureFileUrl(textureName: string) {
  const override = TEXTURE_NAME_OVERRIDES[textureName];
  if (override) return `https://minecraft.wiki/w/Special:FilePath/${override}.png`;
  return wikiTextureUrl(textureName);
}

function makeFallbackBlockTexture(textureName: string) {
  const colors = FALLBACK_TEXTURE_COLORS[textureName] ?? ['#8d8578', '#a49b8d', '#5d574f'];
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const hash = (x * 37 + y * 53 + textureName.length * 11) % 17;
      if (hash < 4) {
        ctx.fillStyle = hash % 2 === 0 ? colors[1] : colors[2];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  if (textureName.includes('planks') || textureName.includes('lectern') || textureName.includes('composter')) {
    ctx.strokeStyle = colors[2];
    ctx.globalAlpha = 0.7;
    for (let y = 4; y < 16; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(16, y + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (textureName.includes('glass')) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(154, 172, 190, 0.45)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.strokeStyle = 'rgba(220, 235, 255, 0.95)';
    ctx.strokeRect(1.5, 1.5, 13, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(4, 3, 2, 9);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeTextureMaterial(
  textureName: string,
  materialCache: Map<string, THREE.Material>,
  textureCache: Map<string, THREE.Texture>,
  options: { transparent?: boolean; opacity?: number; emissive?: number } = {},
) {
  const key = `${textureName}:${options.transparent ? 't' : 'o'}:${options.opacity ?? 1}:${options.emissive ?? 0}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  let texture = textureCache.get(textureName);
  if (!texture) {
    const fallbackTexture = makeFallbackBlockTexture(textureName) ?? new THREE.Texture();
    texture = fallbackTexture;
    textureCache.set(textureName, texture);

    if (!LOCAL_ONLY_SCENE_TEXTURES.has(textureName)) {
      new THREE.TextureLoader()
        .setCrossOrigin('anonymous')
        .load(
          textureFileUrl(textureName),
          loadedTexture => {
            loadedTexture.magFilter = THREE.NearestFilter;
            loadedTexture.minFilter = THREE.NearestFilter;
            loadedTexture.wrapS = THREE.RepeatWrapping;
            loadedTexture.wrapT = THREE.RepeatWrapping;
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            textureCache.set(textureName, loadedTexture);
            fallbackTexture.dispose();
            materialCache.forEach(material => {
              if (material instanceof THREE.MeshLambertMaterial && material.userData.textureName === textureName) {
                material.map = loadedTexture;
                material.needsUpdate = true;
              }
            });
            renderRefGlobal?.();
          },
          undefined,
          () => {
            // Keep the generated pixel fallback if the external texture cannot load.
          },
        );
    }
  }

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    alphaTest: options.transparent ? 0.08 : 0,
    emissive: options.emissive ?? 0x000000,
  });
  material.userData.textureName = textureName;
  materialCache.set(key, material);
  return material;
}

let renderRefGlobal: (() => void) | null = null;

function makeSolidSceneMaterial(
  key: string,
  materialCache: Map<string, THREE.Material>,
  options: { color: number; transparent?: boolean; opacity?: number; emissive?: number },
) {
  const cacheKey = `solid:${key}:${options.color}:${options.opacity ?? 1}:${options.transparent ? 't' : 'o'}`;
  const cached = materialCache.get(cacheKey);
  if (cached) return cached;
  const material = new THREE.MeshLambertMaterial({
    color: options.color,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
  });
  materialCache.set(cacheKey, material);
  return material;
}

function makeCubeMaterials(
  side: string,
  top: string,
  bottom: string,
  materialCache: Map<string, THREE.Material>,
  textureCache: Map<string, THREE.Texture>,
  options?: { transparent?: boolean; opacity?: number; emissive?: number },
) {
  const sideMat = makeTextureMaterial(side, materialCache, textureCache, options);
  const topMat = makeTextureMaterial(top, materialCache, textureCache, options);
  const bottomMat = makeTextureMaterial(bottom, materialCache, textureCache, options);
  return [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
}

function addRoomBox(scene: THREE.Scene, size: [number, number, number], center: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(center[0], center[1], center[2]);
  scene.add(mesh);
  return mesh;
}

function makeFramedArtGroup(imageData: ImageData, artSize: { width: number; height: number }) {
  const artTexture = imageDataToTexture(imageData);
  const artGroup = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x4b2d16 });
  const backingMat = new THREE.MeshLambertMaterial({ color: 0x1f1510 });
  const artMat = new THREE.MeshBasicMaterial({ map: artTexture, transparent: true });
  const rail = 0.18;
  const depth = 0.16;
  const backing = new THREE.Mesh(new THREE.BoxGeometry(artSize.width + rail * 2, artSize.height + rail * 2, 0.08), backingMat);
  const top = new THREE.Mesh(new THREE.BoxGeometry(artSize.width + rail * 2, rail, depth), frameMat);
  const bottom = top.clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(rail, artSize.height, depth), frameMat);
  const right = left.clone();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(artSize.width, artSize.height), artMat);

  backing.position.z = -0.04;
  top.position.set(0, artSize.height / 2 + rail / 2, 0.04);
  bottom.position.set(0, -artSize.height / 2 - rail / 2, 0.04);
  left.position.set(-artSize.width / 2 - rail / 2, 0, 0.04);
  right.position.set(artSize.width / 2 + rail / 2, 0, 0.04);
  plane.position.z = 0.12;
  artGroup.add(backing, top, bottom, left, right, plane);
  return { artGroup, artTexture };
}

function disposeObject3DResources(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      return;
    }
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach(material => {
          if (material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshBasicMaterial) {
            material.map?.dispose();
          }
          material.dispose();
        });
      } else {
        if (object.material instanceof THREE.MeshLambertMaterial || object.material instanceof THREE.MeshBasicMaterial) {
          object.material.map?.dispose();
        }
        object.material.dispose();
      }
    }
  });
}

function extractTileImageData(imageData: ImageData, col: number, row: number) {
  const out = new ImageData(128, 128);
  const offsetX = col * 128;
  const offsetY = row * 128;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const srcIndex = ((offsetY + y) * imageData.width + (offsetX + x)) * 4;
      const dstIndex = (y * 128 + x) * 4;
      out.data[dstIndex] = imageData.data[srcIndex];
      out.data[dstIndex + 1] = imageData.data[srcIndex + 1];
      out.data[dstIndex + 2] = imageData.data[srcIndex + 2];
      out.data[dstIndex + 3] = imageData.data[srcIndex + 3];
    }
  }
  return out;
}

function makeGlowItemFrame(texture: THREE.Texture) {
  const frameGroup = new THREE.Group();
  const outerMat = new THREE.MeshLambertMaterial({ color: 0x8c6a2d, emissive: 0x3a2d0d });
  const innerMat = new THREE.MeshLambertMaterial({ color: 0x4e3418 });
  const artMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const border = 0.09;
  const depth = 0.08;

  const backing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), innerMat);
  backing.position.set(0, 0, -0.005);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, border, depth), outerMat);
  top.position.set(0, 0.5 - border / 2, 0.02);
  const bottom = top.clone();
  bottom.position.set(0, -0.5 + border / 2, 0.02);
  const left = new THREE.Mesh(new THREE.BoxGeometry(border, 1 - border * 2, depth), outerMat);
  left.position.set(-0.5 + border / 2, 0, 0.02);
  const right = left.clone();
  right.position.set(0.5 - border / 2, 0, 0.02);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), artMat);
  art.position.z = 0.055;

  frameGroup.add(backing, top, bottom, left, right, art);
  return frameGroup;
}

function makeGalleryArtGrid(imageData: ImageData, mapGrid: MapGrid, frame: SceneFrameAnchor) {
  const artGroup = new THREE.Group();
  const textures: THREE.Texture[] = [];

  for (let row = 0; row < mapGrid.tall; row++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const tileImage = extractTileImageData(imageData, col, row);
      const texture = imageDataToTexture(tileImage);
      textures.push(texture);
      const tile = makeGlowItemFrame(texture);
      const leftOffset = mapGrid.wide - 1 - col;
      const upOffset = mapGrid.tall - 1 - row;
      tile.position.set(
        frame.center[0] + frame.leftStep[0] * leftOffset + frame.upStep[0] * upOffset,
        frame.center[1] + frame.leftStep[1] * leftOffset + frame.upStep[1] * upOffset,
        frame.center[2] + frame.leftStep[2] * leftOffset + frame.upStep[2] * upOffset,
      );
      tile.rotation.y = frame.rotationY;
      artGroup.add(tile);
    }
  }

  return {
    artGroup,
    dispose: () => textures.forEach(texture => texture.dispose()),
  };
}

function makeGalleryBlockMaterials(
  entry: ScenePaletteEntry,
  materialCache: Map<string, THREE.Material>,
  textureCache: Map<string, THREE.Texture>,
): THREE.Material | THREE.Material[] {
  const name = entry.name.replace(/^minecraft:/, '');
  switch (name) {
    case 'grass_block':
      return makeCubeMaterials('grass_block_side', 'grass_block_top', 'dirt', materialCache, textureCache);
    case 'gray_stained_glass_pane':
      return makeSolidSceneMaterial('gray_stained_glass_pane', materialCache, { color: 0xaeb7c3, transparent: true, opacity: 0.32 });
    case 'cherry_leaves':
      return makeTextureMaterial('cherry_leaves', materialCache, textureCache, { transparent: true, opacity: 0.86 });
    case 'spruce_slab':
      return makeCubeMaterials('spruce_planks', 'spruce_planks', 'spruce_planks', materialCache, textureCache);
    case 'dark_oak_stairs':
      return makeCubeMaterials('dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', materialCache, textureCache);
    case 'composter':
      return makeCubeMaterials('composter_side', 'composter_top', 'composter_side', materialCache, textureCache);
    case 'lectern':
      return makeCubeMaterials('lectern_side', 'lectern_front', 'lectern_base', materialCache, textureCache);
    case 'red_carpet':
      return makeTextureMaterial('red_carpet', materialCache, textureCache);
    default:
      return makeTextureMaterial(name, materialCache, textureCache);
  }
}

function addBox(parent: THREE.Object3D, size: [number, number, number], center: [number, number, number], material: THREE.Material | THREE.Material[], showEdges = true) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geometry, material);
  if (showEdges) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), SCENE_EDGE_MATERIAL);
    edges.renderOrder = 4;
    mesh.add(edges);
  }
  mesh.position.set(center[0], center[1], center[2]);
  parent.add(mesh);
}

function makeGalleryBlockObject(
  entry: ScenePaletteEntry,
  materialCache: Map<string, THREE.Material>,
  textureCache: Map<string, THREE.Texture>,
) {
  const material = makeGalleryBlockMaterials(entry, materialCache, textureCache);
  const object = new THREE.Group();
  const props = entry.properties ?? {};

  switch (entry.name) {
    case 'minecraft:spruce_slab': {
      const isTop = props.type === 'top';
      addBox(object, [1, 0.5, 1], [0.5, isTop ? 0.75 : 0.25, 0.5], material);
      break;
    }
    case 'minecraft:red_carpet':
      addBox(object, [1, 0.0625, 1], [0.5, 0.03125, 0.5], material);
      break;
    case 'minecraft:gray_stained_glass_pane': {
      const northSouth = props.north === 'true' || props.south === 'true';
      addBox(object, northSouth ? [0.125, 1, 1] : [1, 1, 0.125], [0.5, 0.5, 0.5], material, false);
      break;
    }
    case 'minecraft:dark_oak_stairs': {
      addBox(object, [1, 0.5, 1], [0.5, 0.25, 0.5], material);
      const facing = props.facing ?? 'north';
      if (facing === 'north') addBox(object, [1, 0.5, 0.5], [0.5, 0.75, 0.25], material);
      else if (facing === 'south') addBox(object, [1, 0.5, 0.5], [0.5, 0.75, 0.75], material);
      else if (facing === 'west') addBox(object, [0.5, 0.5, 1], [0.25, 0.75, 0.5], material);
      else addBox(object, [0.5, 0.5, 1], [0.75, 0.75, 0.5], material);
      break;
    }
    case 'minecraft:composter':
      addBox(object, [0.875, 0.875, 0.875], [0.5, 0.4375, 0.5], material);
      break;
    case 'minecraft:lectern': {
      addBox(object, [0.72, 0.12, 0.72], [0.5, 0.06, 0.5], material);
      addBox(object, [0.18, 0.62, 0.18], [0.5, 0.37, 0.5], material);
      addBox(object, [0.8, 0.14, 0.62], [0.5, 0.82, 0.44], material);
      object.rotation.y = props.facing === 'north' ? Math.PI : props.facing === 'south' ? 0 : props.facing === 'west' ? -Math.PI / 2 : Math.PI / 2;
      break;
    }
    default:
      addBox(object, [1, 1, 1], [0.5, 0.5, 0.5], material);
      break;
  }

  return object;
}

function makeGallerySceneGroup(asset: SceneLitematicAsset) {
  const group = new THREE.Group();
  group.position.set(...asset.originOffset);
  const materialCache = new Map<string, THREE.Material>();
  const textureCache = new Map<string, THREE.Texture>();

  for (const block of asset.blocks) {
    const entry = asset.palette[block.paletteIndex];
    if (!entry) continue;
    const object = makeGalleryBlockObject(entry, materialCache, textureCache);
    object.position.set(block.x, block.y, block.z);
    group.add(object);
  }

  return group;
}

function getGalleryArtGridCenter(mapGrid: MapGrid, frame: SceneFrameAnchor): THREE.Vector3 {
  return new THREE.Vector3(
    frame.center[0]
      + frame.leftStep[0] * ((mapGrid.wide - 1) / 2)
      + frame.upStep[0] * ((mapGrid.tall - 1) / 2),
    frame.center[1]
      + frame.leftStep[1] * ((mapGrid.wide - 1) / 2)
      + frame.upStep[1] * ((mapGrid.tall - 1) / 2),
    frame.center[2]
      + frame.leftStep[2] * ((mapGrid.wide - 1) / 2)
      + frame.upStep[2] * ((mapGrid.tall - 1) / 2),
  );
}

function clampVector(vector: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3) {
  vector.set(
    THREE.MathUtils.clamp(vector.x, min.x, max.x),
    THREE.MathUtils.clamp(vector.y, min.y, max.y),
    THREE.MathUtils.clamp(vector.z, min.z, max.z),
  );
}

function constrainGalleryCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  clampVector(controls.target, GALLERY_CAMERA_BOUNDS.targetMin, GALLERY_CAMERA_BOUNDS.targetMax);
  clampVector(camera.position, GALLERY_CAMERA_BOUNDS.min, GALLERY_CAMERA_BOUNDS.max);

  const offset = camera.position.clone().sub(controls.target);
  const distance = offset.length();
  if (distance < controls.minDistance) {
    camera.position.copy(controls.target.clone().add(offset.normalize().multiplyScalar(controls.minDistance)));
  } else if (distance > controls.maxDistance) {
    camera.position.copy(controls.target.clone().add(offset.normalize().multiplyScalar(controls.maxDistance)));
  }
  clampVector(camera.position, GALLERY_CAMERA_BOUNDS.min, GALLERY_CAMERA_BOUNDS.max);
}

function getSceneAnchor(presetId: string, artSize: { width: number; height: number }): { position: [number, number, number]; rotationY: number } {
  const y = Math.max(3, artSize.height / 2 + 0.85);
  if (presetId === 'house-interior') return { position: [4.45, y, 0], rotationY: -Math.PI / 2 };
  if (presetId === 'nether-corridor') return { position: [0, y, -9.35], rotationY: 0 };
  return { position: [0, y, -4.45], rotationY: 0 };
}

function addSceneEnvironment(scene: THREE.Scene, presetId: string, artMesh: THREE.Object3D, artSize: { width: number; height: number }) {
  const roomWidth = Math.max(14, artSize.width + 4);
  const roomHeight = Math.max(8, artSize.height + 2.2);
  const corridorWidth = Math.max(8, artSize.width + 1.2);
  const corridorHeight = Math.max(7, artSize.height + 1.8);
  const houseSize = Math.max(14, artSize.width + 4, artSize.height + 4);
  const blockMaterials = {
    galleryWall: new THREE.MeshLambertMaterial({ map: makeBlockTexture('gallery-wall') ?? undefined }),
    galleryFloor: new THREE.MeshLambertMaterial({ map: makeBlockTexture('gallery-floor') ?? undefined }),
    netherWall: new THREE.MeshLambertMaterial({ map: makeBlockTexture('nether-wall') ?? undefined }),
    netherFloor: new THREE.MeshLambertMaterial({ map: makeBlockTexture('nether-floor') ?? undefined }),
    houseWall: new THREE.MeshLambertMaterial({ map: makeBlockTexture('house-wall') ?? undefined }),
    houseFloor: new THREE.MeshLambertMaterial({ map: makeBlockTexture('house-floor') ?? undefined }),
  };

  switch (presetId) {
    case 'gallery-wall':
      addRoomBox(scene, [roomWidth, 0.8, 12], [0, -0.4, 0], blockMaterials.galleryFloor);
      addRoomBox(scene, [roomWidth, roomHeight, 0.6], [0, roomHeight / 2 - 0.4, -4.8], blockMaterials.galleryWall);
      addRoomBox(scene, [0.6, roomHeight, 12], [-roomWidth / 2 + 0.3, roomHeight / 2 - 0.4, 0], blockMaterials.galleryWall);
      addRoomBox(scene, [0.6, roomHeight, 12], [roomWidth / 2 - 0.3, roomHeight / 2 - 0.4, 0], blockMaterials.galleryWall);
      addRoomBox(scene, [roomWidth, 0.5, 0.4], [0, roomHeight - 0.8, -4.45], new THREE.MeshLambertMaterial({ color: 0x5c4d36 }));
      scene.add(artMesh);
      break;
    case 'nether-corridor':
      addRoomBox(scene, [corridorWidth, 0.8, 22], [0, -0.4, 0], blockMaterials.netherFloor);
      addRoomBox(scene, [corridorWidth, 0.6, 22], [0, corridorHeight - 0.8, 0], blockMaterials.netherWall);
      addRoomBox(scene, [0.7, corridorHeight, 22], [-corridorWidth / 2 - 0.35, corridorHeight / 2 - 0.4, 0], blockMaterials.netherWall);
      addRoomBox(scene, [0.7, corridorHeight, 22], [corridorWidth / 2 + 0.35, corridorHeight / 2 - 0.4, 0], blockMaterials.netherWall);
      addRoomBox(scene, [corridorWidth, corridorHeight, 0.8], [0, corridorHeight / 2 - 0.4, -9.8], blockMaterials.netherWall);
      for (let i = -8; i <= 8; i += 4) {
        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xe5a343, emissive: 0x8a4d12 }));
        lantern.position.set(0, corridorHeight - 1.5, i);
        scene.add(lantern);
      }
      scene.add(artMesh);
      break;
    case 'house-interior':
      addRoomBox(scene, [houseSize, 0.8, houseSize], [0, -0.4, 0], blockMaterials.houseFloor);
      addRoomBox(scene, [houseSize, roomHeight, 0.7], [0, roomHeight / 2 - 0.4, -houseSize / 2 + 0.2], blockMaterials.houseWall);
      addRoomBox(scene, [0.7, roomHeight, houseSize], [houseSize / 2 - 0.2, roomHeight / 2 - 0.4, 0], blockMaterials.houseWall);
      addRoomBox(scene, [houseSize, 0.6, houseSize], [0, roomHeight - 0.4, 0], new THREE.MeshLambertMaterial({ color: 0x7d5934 }));
      addRoomBox(scene, [2.4, 1.1, 1.2], [-3.8, 0.55, -2.2], new THREE.MeshLambertMaterial({ color: 0x6b533a }));
      addRoomBox(scene, [2.1, 1.6, 0.9], [-3.8, 1.3, -1.4], new THREE.MeshLambertMaterial({ color: 0xb68d5b }));
      scene.add(artMesh);
      break;
  }
}

export function PerspectiveModal({
  imageData,
  cp,
  blockSelection,
  mapMode,
  staircaseMode,
  supportMode,
  supportBlock,
  mapGrid,
  previewMode,
  onPreviewModeChange,
  onClose,
}: Props) {
  const { t } = useLocale();
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const [schematicView, setSchematicView] = useState<SchematicView>('perspective');
  const [schematicDisplay, setSchematicDisplay] = useState<SchematicDisplay>('full');
  const [scenePresetId, setScenePresetId] = useState(SCENE_PRESETS[0].id);
  const [sceneCameraId, setSceneCameraId] = useState(SCENE_PRESETS[0].cameraPresets[0].id);
  const [gallerySceneAsset, setGallerySceneAsset] = useState<SceneLitematicAsset | null>(null);

  const supportColor = SUPPORT_COLORS[supportBlock] ?? 0x7c7568;
  const model = useMemo(
    () => imageData
      ? buildSchematicPreviewModel({
          imageData,
          cp,
          blockSelection,
          mapMode,
          staircaseMode,
          supportMode,
          supportBlockNbt: supportBlock,
          supportColor,
        })
      : null,
    [imageData, cp, blockSelection, mapMode, staircaseMode, supportMode, supportBlock, supportColor],
  );

  const activeScenePreset = useMemo(
    () => SCENE_PRESETS.find(preset => preset.id === scenePresetId) ?? SCENE_PRESETS[0],
    [scenePresetId],
  );

  const sceneCameraPresets = activeScenePreset.cameraPresets;
  const effectiveSceneCameraId = sceneCameraPresets.some(cam => cam.id === sceneCameraId)
    ? sceneCameraId
    : sceneCameraPresets[0].id;

  useEffect(() => {
    let cancelled = false;
    loadGallerySceneLitematic()
      .then(asset => {
        if (!cancelled) setGallerySceneAsset(asset);
      })
      .catch(() => {
        if (!cancelled) setGallerySceneAsset(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111214);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    cameraRef.current = camera;
    const render = () => renderer.render(scene, camera);
    renderRef.current = render;
    renderRefGlobal = render;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener('change', render);
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0xffffff, 1.05);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(8, 14, 12);
    const fill = new THREE.DirectionalLight(0x87a6ff, 0.35);
    fill.position.set(-10, 8, 6);
    scene.add(ambient, key, fill);

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
      render();
    };
    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      controls.removeEventListener('change', render);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      renderRef.current = null;
      renderRefGlobal = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const render = renderRef.current;
    if (!scene || !camera || !controls || !render) return;

    const keep = scene.children.filter(
      (child: THREE.Object3D) => child.type.includes('Light'),
    );
    scene.clear();
    for (const child of keep) scene.add(child);

    const grid = new THREE.GridHelper(32, 32, 0x353c45, 0x242930);
    grid.position.y = -0.02;
    scene.add(grid);
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    camera.fov = 40;
    camera.updateProjectionMatrix();

    if (previewMode === 'schematic3d' && model) {
      const denom = Math.max(model.heightRange, 1);
      const displayBlocks = model.blocks
        .filter(block => schematicDisplay !== 'art' || block.kind === 'art')
        .map(block => (
          block.kind === 'art' && schematicDisplay === 'height'
            ? { ...block, color: new THREE.Color().setHSL(0.58 - ((block.y - model.minHeight) / denom) * 0.46, 0.65, 0.54).getHex() }
            : block
        ));
      const root = schematicView === 'top'
        ? makeTopProjectionGroup(displayBlocks, {
            x: (model.width - 1) / 2,
            z: model.exportDepth / 2,
          })
        : makeInstancedVoxelGroup(displayBlocks, {
            x: (model.width - 1) / 2,
            y: model.minHeight < 0 ? model.minHeight - 0.5 : -0.5,
            z: -model.exportDepth / 2,
          }, schematicView !== 'perspective');
      scene.add(root);

      controls.enableRotate = schematicView === 'perspective';
      controls.enablePan = true;
      controls.enableZoom = true;

      if (schematicView === 'perspective') {
        const size = Math.max(model.width, model.exportDepth);
        camera.position.set(size * 0.78, model.maxHeight + size * 0.7 + 2.5, size * 1.08);
        controls.target.set(0, (model.maxHeight - model.minHeight) / 2 + 0.6, 0);
      } else if (schematicView === 'top') {
        const size = Math.max(model.width, model.exportDepth);
        camera.position.set(0, Math.max(12, size + 6), 0.001);
        controls.target.set(0, 0, 0);
      } else {
        const size = Math.max(model.exportDepth, model.heightRange + 4);
        camera.position.set(size * 1.2, Math.max(3, model.maxHeight + 2), 0.001);
        controls.target.set(0, Math.max(0.5, (model.maxHeight + model.minHeight) / 2), 0);
      }
      controls.update();
      render();
      return;
    }

    if (previewMode === 'scene' && imageData) {
      if (activeScenePreset.id === 'gallery-wall') {
        if (!gallerySceneAsset) {
          render();
          return;
        }

        const sceneRoot = makeGallerySceneGroup(gallerySceneAsset);
        const { artGroup, dispose } = makeGalleryArtGrid(imageData, mapGrid, gallerySceneAsset.frame);
        scene.add(sceneRoot);
        scene.add(artGroup);

        camera.fov = 58;
        camera.updateProjectionMatrix();
        controls.enableRotate = true;
        controls.enablePan = false;
        controls.minDistance = 3.2;
        controls.maxDistance = 10.5;
        controls.minPolarAngle = 0.44;
        controls.maxPolarAngle = 1.48;
        controls.minAzimuthAngle = -2.7;
        controls.maxAzimuthAngle = -0.42;

        const preset = sceneCameraPresets.find(cam => cam.id === effectiveSceneCameraId) ?? sceneCameraPresets[0];
        const gridCenter = getGalleryArtGridCenter(mapGrid, gallerySceneAsset.frame);
        const target = new THREE.Vector3(...preset.target);
        target.lerp(gridCenter, 0.72);
        const position = new THREE.Vector3(...preset.position);
        const viewVector = position.clone().sub(new THREE.Vector3(...preset.target));
        const artSpan = Math.max(mapGrid.wide, mapGrid.tall);
        const minDistance = Math.max(viewVector.length(), artSpan * 1.45 + 4.2);
        camera.position.copy(target.clone().add(viewVector.setLength(minDistance)));
        controls.target.copy(target);
        constrainGalleryCamera(camera, controls);
        controls.update();
        const clampCamera = () => {
          constrainGalleryCamera(camera, controls);
          render();
        };
        controls.addEventListener('change', clampCamera);
        render();

        return () => {
          controls.removeEventListener('change', clampCamera);
          dispose();
          disposeObject3DResources(sceneRoot);
          disposeObject3DResources(artGroup);
        };
      }

      const artSize = getSceneArtSize(mapGrid);
      const { artGroup, artTexture } = makeFramedArtGroup(imageData, artSize);
      const anchor = getSceneAnchor(activeScenePreset.id, artSize);
      artGroup.position.set(...anchor.position);
      artGroup.rotation.y = anchor.rotationY;
      addSceneEnvironment(scene, activeScenePreset.id, artGroup, artSize);

      controls.enableRotate = true;
      controls.enablePan = false;
      controls.minDistance = 4;
      controls.maxDistance = Math.max(26, Math.max(artSize.width, artSize.height) * 3);
      const preset = sceneCameraPresets.find(cam => cam.id === effectiveSceneCameraId) ?? sceneCameraPresets[0];
      const target = new THREE.Vector3(...preset.target);
      target.y = Math.max(target.y, anchor.position[1]);
      const position = new THREE.Vector3(...preset.position);
      const viewVector = position.sub(target);
      const minDistance = Math.max(viewVector.length(), Math.max(artSize.width, artSize.height) * 1.35 + 3);
      camera.position.copy(target.clone().add(viewVector.setLength(minDistance)));
      controls.target.copy(target);
      controls.update();
      render();
      return () => artTexture.dispose();
    }
  }, [
    activeScenePreset,
    gallerySceneAsset,
    imageData,
    mapGrid,
    model,
    previewMode,
    effectiveSceneCameraId,
    sceneCameraPresets,
    schematicDisplay,
    schematicView,
  ]);

  const handleDownload = useCallback(() => {
    const canvas = rendererRef.current?.domElement;
    const render = renderRef.current;
    if (!canvas) return;
    render?.();
    const filename = previewMode === 'scene'
      ? `mapkluss_scene_${scenePresetId}.png`
      : 'mapkluss_schematic_preview.png';
    downloadCanvasImage(canvas, filename);
  }, [previewMode, scenePresetId]);

  return (
    <div className="persp-overlay" onClick={onClose}>
      <div className="persp-modal persp-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="persp-header">
          <span className="persp-title"><IconGlyph icon={mkIcons.view} /> {t('ПРЕДПРОСМОТР', 'PREVIEW')}</span>
          <div className="persp-header-tabs" role="tablist" aria-label={t('Режим предпросмотра', 'Preview mode')}>
            <button
              className={`persp-header-tab${previewMode === 'schematic3d' ? ' active' : ''}`}
              onClick={() => onPreviewModeChange('schematic3d')}
            >{t('Схематика 3D', '3D Schematic')}</button>
            <button
              className={`persp-header-tab${previewMode === 'scene' ? ' active' : ''}`}
              onClick={() => onPreviewModeChange('scene')}
            >{t('Сцена', 'Scene')}</button>
          </div>
          <button className="persp-close" onClick={onClose}><IconGlyph icon={mkIcons.close} size={15} /></button>
        </div>

        <div className="persp-body">
          <div className="persp-viewport" ref={mountRef} />
          <div className="persp-sidebar">
            {previewMode === 'schematic3d' && (
              <>
                <div className="persp-control-group">
                  <div className="persp-control-group-title">{t('Вид', 'View')}</div>
                  <div className="persp-segmented">
                    {SCHEMATIC_VIEW_OPTIONS.map(view => (
                      <button
                        key={view}
                        className={`persp-chip${schematicView === view ? ' active' : ''}`}
                        onClick={() => setSchematicView(view)}
                      >
                        {view === 'perspective' ? t('Персп.', 'Perspective') : view === 'top' ? t('Сверху', 'Top') : t('Сбоку', 'Side')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="persp-control-group">
                  <div className="persp-control-group-title">{t('Слои показа', 'Display')}</div>
                  <div className="persp-segmented">
                    {SCHEMATIC_DISPLAY_OPTIONS.map(mode => (
                      <button
                        key={mode}
                        className={`persp-chip${schematicDisplay === mode ? ' active' : ''}`}
                        onClick={() => setSchematicDisplay(mode)}
                      >
                        {mode === 'art' ? t('Только арт', 'Art only') : mode === 'full' ? t('Арт + опоры', 'Art + supports') : t('Тон высот', 'Height tint')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="persp-control-group">
                  <div className="persp-control-group-title">{t('Сложность', 'Complexity')}</div>
                  <div className="persp-stats">
                    <div className="persp-stat"><span>{t('Режим', 'Mode')}</span><strong>{mapMode === '3d' ? '3D Stair' : '2D Flat'}</strong></div>
                    <div className="persp-stat"><span>{t('Высота min/max', 'Height min/max')}</span><strong>{model ? `${model.minHeight} / ${model.maxHeight}` : '0 / 0'}</strong></div>
                    <div className="persp-stat"><span>{t('Перепад', 'Range')}</span><strong>{model?.heightRange ?? 0}</strong></div>
                    <div className="persp-stat"><span>{t('Блоков арта', 'Art blocks')}</span><strong>{model?.nonTransparentCount ?? 0}</strong></div>
                    <div className="persp-stat"><span>{t('Прозрачных', 'Transparent')}</span><strong>{model?.transparentCount ?? 0}</strong></div>
                    <div className="persp-stat"><span>{t('Опорных блоков', 'Support blocks')}</span><strong>{mapMode === '3d' ? (model?.supportCount ?? 0) : 0}</strong></div>
                    <div className="persp-stat"><span>{t('Ступени', 'Staircase')}</span><strong>{mapMode === '3d' ? staircaseMode : 'flat'}</strong></div>
                  </div>
                </div>
              </>
            )}

            {previewMode === 'scene' && (
              <>
                <div className="persp-control-group">
                  <div className="persp-control-group-title">{t('Интерьер', 'Interior')}</div>
                  <div className="persp-stacked">
                    {SCENE_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        className={`persp-preset-btn${scenePresetId === preset.id ? ' active' : ''}`}
                        onClick={() => setScenePresetId(preset.id)}
                      >
                        <strong>{t(preset.titleRu, preset.titleEn)}</strong>
                        <span>{preset.environment === 'gallery'
                          ? t('Галерейная стена', 'Gallery wall')
                          : preset.environment === 'nether'
                            ? t('Тоннель в аду', 'Nether corridor')
                            : t('Комната дома', 'House interior')}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="persp-control-group">
                  <div className="persp-control-group-title">{t('Камера', 'Camera')}</div>
                  <div className="persp-segmented">
                    {sceneCameraPresets.map(cameraPreset => (
                      <button
                        key={cameraPreset.id}
                        className={`persp-chip${effectiveSceneCameraId === cameraPreset.id ? ' active' : ''}`}
                        onClick={() => setSceneCameraId(cameraPreset.id)}
                      >
                        {t(cameraPreset.titleRu, cameraPreset.titleEn)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="persp-control-group">
                  <div className="persp-scene-info">
                    <div>{t('Размер карты', 'Map size')}: <strong>{mapGrid.wide}x{mapGrid.tall}</strong></div>
                    <div>{t('Масштаб на стене', 'Wall scale')}: <strong>{t('по числу карт', 'map-count based')}</strong></div>
                    <div>{t('Текстура', 'Texture')}: <strong>{t('без сглаживания', 'nearest-neighbor')}</strong></div>
                  </div>
                </div>
              </>
            )}

            <div className="persp-actions">
              <button className="persp-reset-btn" onClick={handleDownload}>
                ↓ {t(previewMode === 'scene' ? 'Сцена PNG' : 'Схематика PNG', previewMode === 'scene' ? 'Scene PNG' : 'Schematic PNG')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
