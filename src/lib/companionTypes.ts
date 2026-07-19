import type { MapGrid } from './types';
import type { DitheringMode } from './dithering';
import type { MinecraftVersion } from './versionPresets';
import type { BuildTechnique } from './buildTechnique';

export type ArtPrivacy = 'private' | 'unlisted' | 'public';
export type EditableArtPrivacy = 'private' | 'unlisted';

export function normalizeEditableArtPrivacy(value: ArtPrivacy | null | undefined): EditableArtPrivacy {
  return value === 'private' ? 'private' : 'unlisted';
}

export type CompanionArtifactKind =
  | 'project'
  | 'preview_png'
  | 'litematic'
  | 'litematic_tiles_zip'
  | 'materials_txt'
  | 'materials_csv'
  | 'mapdat_zip'
  | 'frame_commands'
  | 'frame_datapack'
  | 'suppression_litematic'
  | 'suppression_plan'
  | 'suppression_bundle';

export interface CompanionArtifactManifestEntry {
  id: string;
  kind: CompanionArtifactKind;
  filename: string;
  storagePath: string;
  signedUrl?: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
}

export interface CompanionArtManifest {
  artId: string;
  versionId: string;
  ownerId: string;
  title: string;
  privacy: ArtPrivacy;
  grid: MapGrid;
  mode: '2d' | '3d';
  dithering?: DitheringMode;
  minecraftVersion?: MinecraftVersion;
  buildTechnique?: BuildTechnique;
  previewUrl: string | null;
  isFavorite?: boolean;
  collectionIds?: string[];
  artifacts: CompanionArtifactManifestEntry[];
  updatedAt: string;
}

export interface CompanionArtVersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
  grid: MapGrid;
  mode: '2d' | '3d';
  minecraftVersion?: MinecraftVersion;
  artifactCount: number;
  isCurrent: boolean;
  previewUrl?: string | null;
  projectUrl?: string | null;
}

export interface CompanionArtVersionProject {
  artId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  createdAt: string;
  projectUrl: string;
}

export interface CompanionLibraryItem {
  artId: string;
  currentVersionId: string | null;
  title: string;
  privacy: ArtPrivacy;
  grid: MapGrid;
  mode: '2d' | '3d';
  previewUrl: string | null;
  updatedAt: string;
  isFavorite: boolean;
}

export interface CompanionCollection {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}

export interface CompanionProfileSummary {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
}

export interface TelegramAuthPayload {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export interface CompanionUsageSummary {
  artCount: number;
  artLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
}

export interface CompanionCloudOverview {
  profile: CompanionProfileSummary;
  usage: CompanionUsageSummary;
  arts: CompanionLibraryItem[];
  favorites: CompanionLibraryItem[];
  recent: CompanionLibraryItem[];
  collections: CompanionCollection[];
  imports: CompanionScanImport[];
}

export interface CompanionArtOverview {
  manifest: CompanionArtManifest;
  owner: CompanionProfileSummary | null;
  collections: CompanionCollection[];
  versions: CompanionArtVersionSummary[];
}

export interface CompanionCollectionOverview {
  collection: CompanionCollection;
  items: CompanionLibraryItem[];
}

export interface CompanionScanUploadResult {
  importId: string;
  imagePath: string;
  signedUrl?: string;
  sha256: string;
  createdAt: string;
  reused?: boolean;
}

export interface CompanionScanImport {
  importId: string;
  source: 'hand' | 'frame' | 'wall' | 'manual_wall' | string;
  title: string;
  mapGrid: MapGrid;
  imagePath: string;
  signedUrl?: string;
  sizeBytes: number;
  sha256: string;
  createdArtId?: string | null;
  metadata: Record<string, unknown>;
  missingMaps: number;
  createdAt: string;
}

export interface CompanionBuildSessionMaterial {
  nbtName: string;
  displayName: string;
  count: number;
}

export interface CompanionBuildSession {
  id: string;
  map_grid: { wide: number; tall: number };
  image_preview: string;
  materials: CompanionBuildSessionMaterial[];
  gathered: Record<string, number>;
  placed: Record<string, number>;
  mode: 'gathering' | 'building';
  info: Record<string, unknown>;
  art_id?: string | null;
  art_version_id?: string | null;
}

export interface CompanionDeviceStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface CompanionDevicePollResponse {
  status: 'pending' | 'approved' | 'expired' | 'denied';
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
}
