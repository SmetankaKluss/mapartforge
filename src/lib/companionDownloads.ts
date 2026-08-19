import type { MinecraftVersion } from './versionPresets';

const COMPANION_MOD_DOWNLOAD_REV = '20260820-companion-0-13-1';

export const COMPANION_MOD_VERSION_OPTIONS = [
  {
    minecraftVersion: '26.2',
    badge: 'Java 25',
    href: `/downloads/mod/mapkluss-companion-26.2-0.13.1.jar?v=${COMPANION_MOD_DOWNLOAD_REV}`,
    filename: 'mapkluss-companion-26.2-0.13.1.jar',
  },
  {
    minecraftVersion: '1.21.11',
    badge: 'Java 21',
    href: `/downloads/mod/mapkluss-companion-1.21.11-0.13.1.jar?v=${COMPANION_MOD_DOWNLOAD_REV}`,
    filename: 'mapkluss-companion-1.21.11-0.13.1.jar',
  },
  {
    minecraftVersion: '1.21.8',
    badge: 'Java 21',
    href: `/downloads/mod/mapkluss-companion-1.21.8-0.13.1.jar?v=${COMPANION_MOD_DOWNLOAD_REV}`,
    filename: 'mapkluss-companion-1.21.8-0.13.1.jar',
  },
  {
    minecraftVersion: '1.21.4',
    badge: 'Java 21',
    href: `/downloads/mod/mapkluss-companion-1.21.4-0.13.1.jar?v=${COMPANION_MOD_DOWNLOAD_REV}`,
    filename: 'mapkluss-companion-1.21.4-0.13.1.jar',
  },
] as const;

export type CompanionModVersion = typeof COMPANION_MOD_VERSION_OPTIONS[number]['minecraftVersion'];

export const COMPANION_MODRINTH_URL = 'https://modrinth.com/mod/mapkluss-companion';
export const COMPANION_CURSEFORGE_URL = 'https://www.curseforge.com/minecraft/mc-mods/mapkluss-companion';
export const FABRIC_API_URL = 'https://modrinth.com/mod/fabric-api';
export const LITEMATICA_URL = 'https://modrinth.com/mod/litematica';
export const MALILIB_URL = 'https://modrinth.com/mod/malilib';

export function companionVersionForMinecraft(version: MinecraftVersion): CompanionModVersion {
  const exact = COMPANION_MOD_VERSION_OPTIONS.find(option => option.minecraftVersion === version);
  return exact?.minecraftVersion ?? '1.21.4';
}

export function companionDownloadOption(version: CompanionModVersion) {
  return COMPANION_MOD_VERSION_OPTIONS.find(option => option.minecraftVersion === version)
    ?? COMPANION_MOD_VERSION_OPTIONS[0];
}

export function isCompanionMinecraftVersion(version: MinecraftVersion): boolean {
  return COMPANION_MOD_VERSION_OPTIONS.some(option => option.minecraftVersion === version);
}
