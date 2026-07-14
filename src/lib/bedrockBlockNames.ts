/**
 * Bedrock Edition block name mapping for .mcstructure export.
 *
 * Most block names in Bedrock 1.20.80+ match Java Edition.
 * Only blocks that still differ are listed here.
 *
 * Bedrock block states differ from Java: values can be TAG_String,
 * TAG_Int, or TAG_Byte (for booleans), depending on the block.
 *
 * Target: Bedrock 1.20.80+ (block version 18090528 = 1.21.0.3)
 */

export interface BedrockBlockDef {
  name: string;                          // Bedrock name (with minecraft: prefix)
  stringStates?: Record<string, string>; // TAG_String states
  intStates?: Record<string, number>;    // TAG_Int states
  byteStates?: Record<string, number>;   // TAG_Byte states (0/1 for booleans)
}

/** Bedrock block version encoded in every palette entry. */
export const BEDROCK_BLOCK_VERSION = 18090528;

/**
 * Java nbtName (no minecraft: prefix) → Bedrock block definition.
 * Only blocks that still differ from Java naming in Bedrock 1.20+.
 */
const JAVA_TO_BEDROCK: Record<string, BedrockBlockDef> = {
  // Snow layers (Java 'snow') ≠ Bedrock 'snow_layer'
  // Java's full snow block ('snow_block') matches Bedrock 1.20+.
  'snow': { name: 'minecraft:snow_layer', intStates: { height: 0 } },

  // Dirt path: Java renamed 'grass_path' → 'dirt_path' in 1.17.
  // Bedrock kept the old name.
  'dirt_path': { name: 'minecraft:grass_path' },
};

/**
 * Convert a Java block name (e.g. "minecraft:snow") to the Bedrock
 * block definition for .mcstructure palette entries.
 * Falls back to the Java name for blocks that are compatible in Bedrock 1.20+.
 */
export function toBedrockBlock(javaName: string): BedrockBlockDef {
  const short = javaName.startsWith('minecraft:') ? javaName.slice(10) : javaName;
  const mapped = JAVA_TO_BEDROCK[short];
  if (mapped) return mapped;
  // Most blocks are compatible; use Java name as-is.
  return { name: javaName.startsWith('minecraft:') ? javaName : `minecraft:${javaName}` };
}

/**
 * Additional blocks to exclude from the Bedrock palette
 * (beyond what platformMode.ts already marks as unsafe).
 */
export const EXTRA_BEDROCK_UNSAFE = new Set([
  'resin_block', // Java 1.21.4 Pale Garden update — not yet in Bedrock
]);
