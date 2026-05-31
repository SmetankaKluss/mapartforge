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
  type SceneCameraPreset,
  type SchematicPreviewBlock,
} from '../lib/preview3d';

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

  const applyCameraPreset = useCallback((cameraPreset: SceneCameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(...cameraPreset.position);
    controls.target.set(...cameraPreset.target);
    controls.update();
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
    applyCameraPreset,
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
