// Auto-generated from MapartCraft's coloursJSON.json
// csId = colour set index (0-60) — used for sprite sheet Y position
// baseId = Minecraft map colour ID (1-61) — matches palette.ts baseId

export interface PaletteBlock {
  blockId: number;       // sprite X index
  displayName: string;   // e.g. 'White Carpet'
  nbtName: string;       // e.g. 'white_carpet'
  supportBlockMandatory: boolean; // requires a support block (stairs, slabs, etc.)
}

export interface ColourRow {
  csId: number;          // colour set ID (0-60), sprite Y index
  baseId: number;        // Minecraft map colour ID (1-61)
  colourName: string;
  r: number; g: number; b: number; // shade 2 (light) RGB
  blocks: PaletteBlock[];
}

export const COLOUR_ROWS: ColourRow[] = [
  {
    "csId": 0,
    "baseId": 1,
    "colourName": "Grass",
    "r": 127,
    "g": 178,
    "b": 56,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Grass Block",
        "nbtName": "grass_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Slime Block",
        "nbtName": "slime_block",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 1,
    "baseId": 2,
    "colourName": "Sand",
    "r": 247,
    "g": 233,
    "b": 163,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Sand",
        "nbtName": "sand",
        "supportBlockMandatory": true
      },
      {
        "blockId": 1,
        "displayName": "Sandstone",
        "nbtName": "sandstone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Sandstone Slab",
        "nbtName": "sandstone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Birch Log (vertical)",
        "nbtName": "birch_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Birch Planks",
        "nbtName": "birch_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Birch Slab",
        "nbtName": "birch_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 6,
        "displayName": "Glowstone",
        "nbtName": "glowstone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "End Stone",
        "nbtName": "end_stone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "End Stone Bricks",
        "nbtName": "end_stone_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "End Stone Brick Slab",
        "nbtName": "end_stone_brick_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 10,
        "displayName": "Bone Block",
        "nbtName": "bone_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 11,
        "displayName": "Birch Pressure Plate",
        "nbtName": "birch_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 12,
        "displayName": "Ochre Froglight",
        "nbtName": "ochre_froglight",
        "supportBlockMandatory": false
      },
      {
        "blockId": 13,
        "displayName": "Smooth Sandstone",
        "nbtName": "smooth_sandstone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 14,
        "displayName": "Cut Sandstone",
        "nbtName": "cut_sandstone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 15,
        "displayName": "Chiseled Sandstone",
        "nbtName": "chiseled_sandstone",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 2,
    "baseId": 3,
    "colourName": "Cobweb",
    "r": 199,
    "g": 199,
    "b": 199,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Cobweb",
        "nbtName": "cobweb",
        "supportBlockMandatory": true
      },
      {
        "blockId": 1,
        "displayName": "Mushroom Stem",
        "nbtName": "mushroom_stem",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "White Candle",
        "nbtName": "white_candle",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 3,
    "baseId": 4,
    "colourName": "TNT",
    "r": 255,
    "g": 0,
    "b": 0,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "TNT",
        "nbtName": "tnt",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Block of Redstone",
        "nbtName": "redstone_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 4,
    "baseId": 5,
    "colourName": "Ice",
    "r": 160,
    "g": 160,
    "b": 255,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Ice",
        "nbtName": "ice",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Packed Ice",
        "nbtName": "packed_ice",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Blue Ice",
        "nbtName": "blue_ice",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 5,
    "baseId": 6,
    "colourName": "Iron",
    "r": 167,
    "g": 167,
    "b": 167,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Block of Iron",
        "nbtName": "iron_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Iron Trapdoor",
        "nbtName": "iron_trapdoor",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Iron Bars",
        "nbtName": "unknown",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Weighted Pressure Plate (Heavy)",
        "nbtName": "heavy_weighted_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 4,
        "displayName": "Brewing Stand",
        "nbtName": "brewing_stand",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 6,
    "baseId": 7,
    "colourName": "Leaves",
    "r": 0,
    "g": 124,
    "b": 0,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Leaves (Oak)",
        "nbtName": "oak_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Leaves (Spruce)",
        "nbtName": "spruce_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Leaves (Birch)",
        "nbtName": "birch_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 3,
        "displayName": "Leaves (Jungle)",
        "nbtName": "jungle_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Leaves (Acacia)",
        "nbtName": "acacia_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Leaves (Dark Oak)",
        "nbtName": "dark_oak_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Leaves (Azalea)",
        "nbtName": "azalea_leaves",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Block of Bamboo (horizontal)",
        "nbtName": "bamboo_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 7,
    "baseId": 9,
    "colourName": "Clay",
    "r": 164,
    "g": 168,
    "b": 184,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Clay",
        "nbtName": "clay",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 8,
    "baseId": 10,
    "colourName": "Dirt",
    "r": 151,
    "g": 109,
    "b": 77,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Jungle Log (vertical)",
        "nbtName": "jungle_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Jungle Planks",
        "nbtName": "jungle_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Jungle Slab",
        "nbtName": "jungle_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Dirt",
        "nbtName": "dirt",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Coarse Dirt",
        "nbtName": "coarse_dirt",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Rooted Dirt",
        "nbtName": "rooted_dirt",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Jukebox",
        "nbtName": "jukebox",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Granite",
        "nbtName": "granite",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Granite Slab",
        "nbtName": "granite_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 9,
        "displayName": "Jungle Pressure Plate",
        "nbtName": "jungle_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 10,
        "displayName": "Packed Mud",
        "nbtName": "packed_mud",
        "supportBlockMandatory": false
      },
      {
        "blockId": 11,
        "displayName": "Dirt Path",
        "nbtName": "dirt_path",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Polished Granite",
        "nbtName": "polished_granite",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 9,
    "baseId": 11,
    "colourName": "Stone",
    "r": 112,
    "g": 112,
    "b": 112,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Cobblestone",
        "nbtName": "cobblestone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Cobblestone Slab",
        "nbtName": "cobblestone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Mossy Cobblestone",
        "nbtName": "mossy_cobblestone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 3,
        "displayName": "Mossy Cobblestone Slab",
        "nbtName": "mossy_cobblestone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 4,
        "displayName": "Stone",
        "nbtName": "stone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Stone Slab",
        "nbtName": "stone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 6,
        "displayName": "Smooth Stone Slab",
        "nbtName": "smooth_stone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 7,
        "displayName": "Stone Bricks",
        "nbtName": "stone_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Stone Brick Slab",
        "nbtName": "stone_brick_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 9,
        "displayName": "Andesite",
        "nbtName": "andesite",
        "supportBlockMandatory": false
      },
      {
        "blockId": 10,
        "displayName": "Andesite Slab",
        "nbtName": "andesite_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 11,
        "displayName": "Bedrock",
        "nbtName": "bedrock",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Acacia Log (horizontal)",
        "nbtName": "acacia_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 13,
        "displayName": "Gravel",
        "nbtName": "gravel",
        "supportBlockMandatory": true
      },
      {
        "blockId": 14,
        "displayName": "Stone Pressure Plate",
        "nbtName": "stone_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 15,
        "displayName": "Mossy Stone Bricks",
        "nbtName": "mossy_stone_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 16,
        "displayName": "Cracked Stone Bricks",
        "nbtName": "cracked_stone_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 17,
        "displayName": "Chiseled Stone Bricks",
        "nbtName": "chiseled_stone_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 18,
        "displayName": "Smooth Stone",
        "nbtName": "smooth_stone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 19,
        "displayName": "Polished Andesite",
        "nbtName": "polished_andesite",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 10,
    "baseId": 12,
    "colourName": "Water",
    "r": 64,
    "g": 64,
    "b": 255,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Water (Unsupported!)",
        "nbtName": "water",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 11,
    "baseId": 13,
    "colourName": "Oak",
    "r": 143,
    "g": 119,
    "b": 72,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Oak Log (vertical)",
        "nbtName": "oak_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Oak Planks",
        "nbtName": "oak_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Oak Slab",
        "nbtName": "oak_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Crafting Table",
        "nbtName": "crafting_table",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Oak Pressure Plate",
        "nbtName": "oak_pressure_plate",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 12,
    "baseId": 14,
    "colourName": "Birch",
    "r": 255,
    "g": 252,
    "b": 245,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Birch Log (horizontal)",
        "nbtName": "birch_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Diorite",
        "nbtName": "diorite",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Diorite Slab",
        "nbtName": "diorite_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Quartz Block",
        "nbtName": "quartz_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Quartz Slab",
        "nbtName": "quartz_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Sea Lantern",
        "nbtName": "sea_lantern",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Polished Diorite",
        "nbtName": "polished_diorite",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 13,
    "baseId": 8,
    "colourName": "White Wool",
    "r": 255,
    "g": 255,
    "b": 255,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "White Wool",
        "nbtName": "white_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "White Carpet",
        "nbtName": "white_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "White Stained Glass",
        "nbtName": "white_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "White Concrete",
        "nbtName": "white_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "White Concrete Powder",
        "nbtName": "white_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "White Glazed Terracotta",
        "nbtName": "white_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Snow Block",
        "nbtName": "snow_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Snow Layer",
        "nbtName": "snow",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 14,
    "baseId": 15,
    "colourName": "Orange Wool",
    "r": 216,
    "g": 127,
    "b": 51,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Orange Wool",
        "nbtName": "orange_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Orange Carpet",
        "nbtName": "orange_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Orange Stained Glass",
        "nbtName": "orange_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Orange Concrete",
        "nbtName": "orange_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Orange Concrete Powder",
        "nbtName": "orange_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Orange Glazed Terracotta",
        "nbtName": "orange_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Pumpkin",
        "nbtName": "pumpkin",
        "supportBlockMandatory": true
      },
      {
        "blockId": 7,
        "displayName": "Acacia Log (vertical)",
        "nbtName": "acacia_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Acacia Planks",
        "nbtName": "acacia_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "Acacia Slab",
        "nbtName": "acacia_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 10,
        "displayName": "Red Sand",
        "nbtName": "red_sand",
        "supportBlockMandatory": true
      },
      {
        "blockId": 11,
        "displayName": "Red Sandstone",
        "nbtName": "red_sandstone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Red Sandstone Slab",
        "nbtName": "red_sandstone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 13,
        "displayName": "Terracotta",
        "nbtName": "terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 14,
        "displayName": "Honey Block",
        "nbtName": "honey_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 15,
        "displayName": "Honeycomb Block",
        "nbtName": "honeycomb_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 16,
        "displayName": "Block Of Raw Copper",
        "nbtName": "raw_copper_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 17,
        "displayName": "Waxed Block Of Copper",
        "nbtName": "waxed_copper_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 18,
        "displayName": "Waxed Cut Copper Slab",
        "nbtName": "waxed_cut_copper_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 19,
        "displayName": "Acacia Pressure Plate",
        "nbtName": "acacia_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 20,
        "displayName": "Copper Block",
        "nbtName": "copper_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 21,
        "displayName": "Cut Copper",
        "nbtName": "cut_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 22,
        "displayName": "Waxed Cut Copper",
        "nbtName": "waxed_cut_copper",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 15,
    "baseId": 16,
    "colourName": "Magenta Wool",
    "r": 178,
    "g": 76,
    "b": 216,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Magenta Wool",
        "nbtName": "magenta_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Magenta Carpet",
        "nbtName": "magenta_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Magenta Stained Glass",
        "nbtName": "magenta_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Magenta Concrete",
        "nbtName": "magenta_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Magenta Concrete Powder",
        "nbtName": "magenta_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Magenta Glazed Terracotta",
        "nbtName": "magenta_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Purpur Block",
        "nbtName": "purpur_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Purpur Slab",
        "nbtName": "purpur_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 8,
        "displayName": "Purpur Pillar",
        "nbtName": "purpur_pillar",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 16,
    "baseId": 17,
    "colourName": "Light Blue Wool",
    "r": 102,
    "g": 153,
    "b": 216,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Light Blue Wool",
        "nbtName": "light_blue_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Light Blue Carpet",
        "nbtName": "light_blue_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Light Blue Stained Glass",
        "nbtName": "light_blue_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Light Blue Concrete",
        "nbtName": "light_blue_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Light Blue Concrete Powder",
        "nbtName": "light_blue_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Light Blue Glazed Terracotta",
        "nbtName": "light_blue_glazed_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 17,
    "baseId": 18,
    "colourName": "Yellow Wool",
    "r": 229,
    "g": 229,
    "b": 51,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Yellow Wool",
        "nbtName": "yellow_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Yellow Carpet",
        "nbtName": "yellow_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Yellow Stained Glass",
        "nbtName": "yellow_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Yellow Concrete",
        "nbtName": "yellow_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Yellow Concrete Powder",
        "nbtName": "yellow_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Yellow Glazed Terracotta",
        "nbtName": "yellow_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Hay Bale",
        "nbtName": "hay_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Sponge (any)",
        "nbtName": "sponge",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Block of Bamboo (vertical)",
        "nbtName": "bamboo_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "Bamboo Planks",
        "nbtName": "bamboo_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 10,
        "displayName": "Bamboo Slab",
        "nbtName": "bamboo_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 11,
        "displayName": "Bamboo Mosaic",
        "nbtName": "bamboo_mosaic",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Bamboo Mosaic Slab",
        "nbtName": "bamboo_mosaic_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 13,
        "displayName": "Bamboo Pressure Plate",
        "nbtName": "bamboo_pressure_plate",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 18,
    "baseId": 19,
    "colourName": "Lime Wool",
    "r": 127,
    "g": 204,
    "b": 25,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Lime Wool",
        "nbtName": "lime_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Lime Carpet",
        "nbtName": "lime_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Lime Stained Glass",
        "nbtName": "lime_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Lime Concrete",
        "nbtName": "lime_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Lime Concrete Powder",
        "nbtName": "lime_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Lime Glazed Terracotta",
        "nbtName": "lime_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Melon",
        "nbtName": "melon",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 19,
    "baseId": 20,
    "colourName": "Pink Wool",
    "r": 242,
    "g": 127,
    "b": 165,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Pink Wool",
        "nbtName": "pink_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Pink Carpet",
        "nbtName": "pink_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Pink Stained Glass",
        "nbtName": "pink_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Pink Concrete",
        "nbtName": "pink_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Pink Concrete Powder",
        "nbtName": "pink_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Pink Glazed Terracotta",
        "nbtName": "pink_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Pearlescent Froglight",
        "nbtName": "pearlescent_froglight",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Cherry Leaves",
        "nbtName": "cherry_leaves",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 20,
    "baseId": 21,
    "colourName": "Gray Wool",
    "r": 76,
    "g": 76,
    "b": 76,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Gray Wool",
        "nbtName": "gray_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Gray Carpet",
        "nbtName": "gray_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Gray Stained Glass",
        "nbtName": "gray_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Gray Concrete",
        "nbtName": "gray_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Gray Concrete Powder",
        "nbtName": "gray_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Gray Glazed Terracotta",
        "nbtName": "gray_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Dead Tube Coral Block",
        "nbtName": "dead_tube_coral_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Dead Brain Coral Block",
        "nbtName": "dead_brain_coral_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Dead Bubble Coral Block",
        "nbtName": "dead_bubble_coral_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "Dead Fire Coral Block",
        "nbtName": "dead_fire_coral_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 10,
        "displayName": "Dead Horn Coral Block",
        "nbtName": "dead_horn_coral_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 11,
        "displayName": "Tinted Glass",
        "nbtName": "tinted_glass",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 21,
    "baseId": 22,
    "colourName": "Light Gray Wool",
    "r": 153,
    "g": 153,
    "b": 153,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Light Gray Wool",
        "nbtName": "light_gray_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Light Gray Carpet",
        "nbtName": "light_gray_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Light Gray Stained Glass",
        "nbtName": "light_gray_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Light Gray Concrete",
        "nbtName": "light_gray_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Light Gray Concrete Powder",
        "nbtName": "light_gray_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Light Gray Glazed Terracotta",
        "nbtName": "light_gray_glazed_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 22,
    "baseId": 23,
    "colourName": "Cyan Wool",
    "r": 76,
    "g": 127,
    "b": 153,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Cyan Wool",
        "nbtName": "cyan_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Cyan Carpet",
        "nbtName": "cyan_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Cyan Stained Glass",
        "nbtName": "cyan_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Cyan Concrete",
        "nbtName": "cyan_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Cyan Concrete Powder",
        "nbtName": "cyan_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Cyan Glazed Terracotta",
        "nbtName": "cyan_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Prismarine",
        "nbtName": "prismarine",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Prismarine Slab",
        "nbtName": "prismarine_slab",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 23,
    "baseId": 24,
    "colourName": "Purple Wool",
    "r": 127,
    "g": 63,
    "b": 178,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Purple Wool",
        "nbtName": "purple_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Purple Carpet",
        "nbtName": "purple_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Purple Stained Glass",
        "nbtName": "purple_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Purple Concrete",
        "nbtName": "purple_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Purple Concrete Powder",
        "nbtName": "purple_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Purple Glazed Terracotta",
        "nbtName": "purple_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Mycelium",
        "nbtName": "mycelium",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Amethyst Block",
        "nbtName": "amethyst_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Budding Amethyst",
        "nbtName": "budding_amethyst",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 24,
    "baseId": 25,
    "colourName": "Blue Wool",
    "r": 51,
    "g": 76,
    "b": 178,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Blue Wool",
        "nbtName": "blue_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Blue Carpet",
        "nbtName": "blue_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Blue Stained Glass",
        "nbtName": "blue_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Blue Concrete",
        "nbtName": "blue_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Blue Concrete Powder",
        "nbtName": "blue_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Blue Glazed Terracotta",
        "nbtName": "blue_glazed_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 25,
    "baseId": 26,
    "colourName": "Brown Wool",
    "r": 102,
    "g": 76,
    "b": 51,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Brown Wool",
        "nbtName": "brown_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Brown Carpet",
        "nbtName": "brown_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Brown Stained Glass",
        "nbtName": "brown_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Brown Concrete",
        "nbtName": "brown_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Brown Concrete Powder",
        "nbtName": "brown_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Brown Glazed Terracotta",
        "nbtName": "brown_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Dark Oak Log (any direction)",
        "nbtName": "dark_oak_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Dark Oak Planks",
        "nbtName": "dark_oak_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Dark Oak Slab",
        "nbtName": "dark_oak_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 9,
        "displayName": "Spruce Log (horizontal)",
        "nbtName": "spruce_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 10,
        "displayName": "Soul Sand",
        "nbtName": "soul_sand",
        "supportBlockMandatory": false
      },
      {
        "blockId": 11,
        "displayName": "Soul Soil",
        "nbtName": "soul_soil",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Dark Oak Pressure Plate",
        "nbtName": "dark_oak_pressure_plate",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 26,
    "baseId": 27,
    "colourName": "Green Wool",
    "r": 102,
    "g": 127,
    "b": 51,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Green Wool",
        "nbtName": "green_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Green Carpet",
        "nbtName": "green_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Green Stained Glass",
        "nbtName": "green_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Green Concrete",
        "nbtName": "green_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Green Concrete Powder",
        "nbtName": "green_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Green Glazed Terracotta",
        "nbtName": "green_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Dried Kelp Block",
        "nbtName": "dried_kelp_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 27,
    "baseId": 28,
    "colourName": "Red Wool",
    "r": 153,
    "g": 51,
    "b": 51,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Red Wool",
        "nbtName": "red_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Red Carpet",
        "nbtName": "red_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Red Stained Glass",
        "nbtName": "red_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Red Concrete",
        "nbtName": "red_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Red Concrete Powder",
        "nbtName": "red_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Red Glazed Terracotta",
        "nbtName": "red_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Bricks",
        "nbtName": "bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Bricks Slab",
        "nbtName": "brick_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 8,
        "displayName": "Nether Wart Block",
        "nbtName": "nether_wart_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "Shroomlight",
        "nbtName": "shroomlight",
        "supportBlockMandatory": false
      },
      {
        "blockId": 10,
        "displayName": "Mangrove Log (vertical)",
        "nbtName": "mangrove_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 11,
        "displayName": "Mangrove Planks",
        "nbtName": "mangrove_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Mangrove Slab",
        "nbtName": "mangrove_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 13,
        "displayName": "Mangrove Pressure Plate",
        "nbtName": "mangrove_pressure_plate",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 28,
    "baseId": 29,
    "colourName": "Black Wool",
    "r": 25,
    "g": 25,
    "b": 25,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Black Wool",
        "nbtName": "black_wool",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Black Carpet",
        "nbtName": "black_carpet",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Black Stained Glass",
        "nbtName": "black_stained_glass",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Black Concrete",
        "nbtName": "black_concrete",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Black Concrete Powder",
        "nbtName": "black_concrete_powder",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Black Glazed Terracotta",
        "nbtName": "black_glazed_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Block of Coal",
        "nbtName": "coal_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Obsidian",
        "nbtName": "obsidian",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Crying Obsidian",
        "nbtName": "crying_obsidian",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "Blackstone",
        "nbtName": "blackstone",
        "supportBlockMandatory": false
      },
      {
        "blockId": 10,
        "displayName": "Blackstone Slab",
        "nbtName": "blackstone_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 11,
        "displayName": "Basalt",
        "nbtName": "basalt",
        "supportBlockMandatory": false
      },
      {
        "blockId": 12,
        "displayName": "Block Of Netherite",
        "nbtName": "netherite_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 13,
        "displayName": "Polished Blackstone Pressure Plate",
        "nbtName": "polished_blackstone_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 14,
        "displayName": "Sculk",
        "nbtName": "sculk",
        "supportBlockMandatory": false
      },
      {
        "blockId": 15,
        "displayName": "Sculk Catalyst",
        "nbtName": "sculk_catalyst",
        "supportBlockMandatory": false
      },
      {
        "blockId": 16,
        "displayName": "Sculk Shrieker",
        "nbtName": "sculk_shrieker",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 29,
    "baseId": 30,
    "colourName": "Gold",
    "r": 250,
    "g": 238,
    "b": 77,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Block of Gold",
        "nbtName": "gold_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Weighted Pressure Plate (Light)",
        "nbtName": "light_weighted_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 2,
        "displayName": "Block Of Raw Gold",
        "nbtName": "raw_gold_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 30,
    "baseId": 31,
    "colourName": "Diamond",
    "r": 92,
    "g": 219,
    "b": 213,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Block of Diamond",
        "nbtName": "diamond_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Prismarine Bricks",
        "nbtName": "prismarine_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Prismarine Brick Slab",
        "nbtName": "prismarine_brick_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Dark Prismarine",
        "nbtName": "dark_prismarine",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Dark Prismarine Slab",
        "nbtName": "dark_prismarine_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 5,
        "displayName": "Beacon",
        "nbtName": "beacon",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 31,
    "baseId": 32,
    "colourName": "Lapis",
    "r": 74,
    "g": 128,
    "b": 255,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Lapis Lazuli Block",
        "nbtName": "lapis_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 32,
    "baseId": 33,
    "colourName": "Emerald",
    "r": 0,
    "g": 217,
    "b": 58,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Block of Emerald",
        "nbtName": "emerald_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 33,
    "baseId": 34,
    "colourName": "Spruce",
    "r": 129,
    "g": 86,
    "b": 49,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Spruce Log (vertical)",
        "nbtName": "spruce_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Spruce Planks",
        "nbtName": "spruce_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Spruce Slab",
        "nbtName": "spruce_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Oak Log (horizontal)",
        "nbtName": "oak_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Jungle Log (horizontal)",
        "nbtName": "jungle_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Podzol",
        "nbtName": "podzol",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Spruce Pressure Plate",
        "nbtName": "spruce_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 7,
        "displayName": "Mangrove Log (horizontal)",
        "nbtName": "mangrove_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Mangrove Roots",
        "nbtName": "mangrove_roots",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 34,
    "baseId": 35,
    "colourName": "Nether",
    "r": 112,
    "g": 2,
    "b": 0,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Netherrack",
        "nbtName": "netherrack",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Nether Brick",
        "nbtName": "nether_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Nether Brick Slab",
        "nbtName": "nether_brick_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Magma Block",
        "nbtName": "magma_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Red Nether Bricks",
        "nbtName": "red_nether_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Red Nether Brick Slab",
        "nbtName": "red_nether_brick_slab",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 35,
    "baseId": 36,
    "colourName": "White Terracotta",
    "r": 209,
    "g": 177,
    "b": 161,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "White Terracotta",
        "nbtName": "white_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Calcite",
        "nbtName": "calcite",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Cherry Planks",
        "nbtName": "cherry_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 3,
        "displayName": "Cherry Slab",
        "nbtName": "cherry_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 4,
        "displayName": "Cherry Log (vertical)",
        "nbtName": "cherry_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Stripped Cherry Log (vertical)",
        "nbtName": "stripped_cherry_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Cherry Pressure Plate",
        "nbtName": "cherry_pressure_plate",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 36,
    "baseId": 37,
    "colourName": "Orange Terracotta",
    "r": 159,
    "g": 82,
    "b": 36,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Orange Terracotta",
        "nbtName": "orange_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 37,
    "baseId": 38,
    "colourName": "Magenta Terracotta",
    "r": 149,
    "g": 87,
    "b": 108,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Magenta Terracotta",
        "nbtName": "magenta_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 38,
    "baseId": 39,
    "colourName": "Light Blue Terracotta",
    "r": 112,
    "g": 108,
    "b": 138,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Light Blue Terracotta",
        "nbtName": "light_blue_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 39,
    "baseId": 40,
    "colourName": "Yellow Terracotta",
    "r": 186,
    "g": 133,
    "b": 36,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Yellow Terracotta",
        "nbtName": "yellow_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 40,
    "baseId": 41,
    "colourName": "Lime Terracotta",
    "r": 103,
    "g": 117,
    "b": 53,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Lime Terracotta",
        "nbtName": "lime_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 41,
    "baseId": 42,
    "colourName": "Pink Terracotta",
    "r": 160,
    "g": 77,
    "b": 78,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Pink Terracotta",
        "nbtName": "pink_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Stripped Cherry Log (horizontal)",
        "nbtName": "stripped_cherry_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Stripped Cherry Wood",
        "nbtName": "stripped_cherry_wood",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 42,
    "baseId": 43,
    "colourName": "Gray Terracotta",
    "r": 57,
    "g": 41,
    "b": 35,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Gray Terracotta",
        "nbtName": "gray_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Tuff",
        "nbtName": "tuff",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Cherry Log (horizontal)",
        "nbtName": "cherry_log",
        "supportBlockMandatory": false
      },
      {
        "blockId": 3,
        "displayName": "Cherry Wood",
        "nbtName": "cherry_wood",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 43,
    "baseId": 44,
    "colourName": "Light Gray Terracotta",
    "r": 135,
    "g": 107,
    "b": 98,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Light Gray Terracotta",
        "nbtName": "light_gray_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Waxed Exposed Copper",
        "nbtName": "waxed_exposed_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Waxed Exposed Cut Copper Slab",
        "nbtName": "waxed_exposed_cut_copper_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Mud Bricks",
        "nbtName": "mud_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Mud Brick Slab",
        "nbtName": "mud_brick_slab",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Exposed Copper",
        "nbtName": "exposed_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 6,
        "displayName": "Exposed Cut Copper",
        "nbtName": "exposed_cut_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 7,
        "displayName": "Waxed Exposed Cut Copper",
        "nbtName": "waxed_exposed_cut_copper",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 44,
    "baseId": 45,
    "colourName": "Cyan Terracotta",
    "r": 87,
    "g": 92,
    "b": 92,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Cyan Terracotta",
        "nbtName": "cyan_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Mud",
        "nbtName": "mud",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 45,
    "baseId": 46,
    "colourName": "Purple Terracotta",
    "r": 122,
    "g": 73,
    "b": 88,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Purple Terracotta",
        "nbtName": "purple_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 46,
    "baseId": 47,
    "colourName": "Blue Terracotta",
    "r": 76,
    "g": 62,
    "b": 92,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Blue Terracotta",
        "nbtName": "blue_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 47,
    "baseId": 48,
    "colourName": "Brown Terracotta",
    "r": 76,
    "g": 50,
    "b": 35,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Brown Terracotta",
        "nbtName": "brown_terracotta",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Dripstone Block",
        "nbtName": "dripstone_block",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Pointed Dripstone",
        "nbtName": "pointed_dripstone",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 48,
    "baseId": 49,
    "colourName": "Green Terracotta",
    "r": 76,
    "g": 82,
    "b": 42,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Green Terracotta",
        "nbtName": "green_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 49,
    "baseId": 50,
    "colourName": "Red Terracotta",
    "r": 142,
    "g": 60,
    "b": 46,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Red Terracotta",
        "nbtName": "red_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 50,
    "baseId": 51,
    "colourName": "Black Terracotta",
    "r": 37,
    "g": 22,
    "b": 16,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Black Terracotta",
        "nbtName": "black_terracotta",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 51,
    "baseId": 52,
    "colourName": "Crimson Nylium",
    "r": 189,
    "g": 48,
    "b": 49,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Crimson Nylium",
        "nbtName": "crimson_nylium",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 52,
    "baseId": 53,
    "colourName": "Crimson Stem",
    "r": 148,
    "g": 63,
    "b": 97,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Crimson Stem",
        "nbtName": "crimson_stem",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Stripped Crimson Stem",
        "nbtName": "stripped_crimson_stem",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Crimson Planks",
        "nbtName": "crimson_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 3,
        "displayName": "Crimson Slab",
        "nbtName": "crimson_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 4,
        "displayName": "Crimson Pressure Plate",
        "nbtName": "crimson_pressure_plate",
        "supportBlockMandatory": true
      }
    ]
  },
  {
    "csId": 53,
    "baseId": 54,
    "colourName": "Crimson Hyphae",
    "r": 92,
    "g": 25,
    "b": 29,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Crimson Hyphae",
        "nbtName": "crimson_hyphae",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Stripped Crimson Hyphae",
        "nbtName": "stripped_crimson_hyphae",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 54,
    "baseId": 55,
    "colourName": "Warped Nylium",
    "r": 22,
    "g": 126,
    "b": 134,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Warped Nylium",
        "nbtName": "warped_nylium",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Waxed Oxidized Copper",
        "nbtName": "waxed_oxidized_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Waxed Oxidized Cut Copper Slab",
        "nbtName": "waxed_oxidized_cut_copper_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Oxidized Copper",
        "nbtName": "oxidized_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Oxidized Cut Copper",
        "nbtName": "oxidized_cut_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Waxed Oxidized Cut Copper",
        "nbtName": "waxed_oxidized_cut_copper",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 55,
    "baseId": 56,
    "colourName": "Warped Stem",
    "r": 58,
    "g": 142,
    "b": 140,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Warped Stem",
        "nbtName": "warped_stem",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Stripped Warped Stem",
        "nbtName": "stripped_warped_stem",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Warped Planks",
        "nbtName": "warped_planks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 3,
        "displayName": "Warped Slab",
        "nbtName": "warped_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 4,
        "displayName": "Waxed Weathered Copper",
        "nbtName": "waxed_weathered_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Waxed Weathered Cut Copper Slab",
        "nbtName": "waxed_weathered_cut_copper_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 6,
        "displayName": "Warped Pressure Plate",
        "nbtName": "warped_pressure_plate",
        "supportBlockMandatory": true
      },
      {
        "blockId": 7,
        "displayName": "Weathered Copper",
        "nbtName": "weathered_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 8,
        "displayName": "Weathered Cut Copper",
        "nbtName": "weathered_cut_copper",
        "supportBlockMandatory": false
      },
      {
        "blockId": 9,
        "displayName": "Waxed Weathered Cut Copper",
        "nbtName": "waxed_weathered_cut_copper",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 56,
    "baseId": 57,
    "colourName": "Warped Hyphae",
    "r": 86,
    "g": 44,
    "b": 62,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Warped Hyphae",
        "nbtName": "warped_hyphae",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Stripped Warped Hyphae",
        "nbtName": "stripped_warped_hyphae",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 57,
    "baseId": 58,
    "colourName": "Warped Wart",
    "r": 20,
    "g": 180,
    "b": 133,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Warped Wart Block",
        "nbtName": "warped_wart_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 58,
    "baseId": 59,
    "colourName": "Deepslate",
    "r": 100,
    "g": 100,
    "b": 100,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Deepslate",
        "nbtName": "deepslate",
        "supportBlockMandatory": false
      },
      {
        "blockId": 1,
        "displayName": "Cobbled Deepslate",
        "nbtName": "cobbled_deepslate",
        "supportBlockMandatory": false
      },
      {
        "blockId": 2,
        "displayName": "Cobbled Deepslate Slab",
        "nbtName": "cobbled_deepslate_slab",
        "supportBlockMandatory": true
      },
      {
        "blockId": 3,
        "displayName": "Deepslate Bricks",
        "nbtName": "deepslate_bricks",
        "supportBlockMandatory": false
      },
      {
        "blockId": 4,
        "displayName": "Deepslate Tiles",
        "nbtName": "deepslate_tiles",
        "supportBlockMandatory": false
      },
      {
        "blockId": 5,
        "displayName": "Polished Deepslate",
        "nbtName": "polished_deepslate",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 59,
    "baseId": 60,
    "colourName": "Raw Iron",
    "r": 216,
    "g": 175,
    "b": 147,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Block Of Raw Iron",
        "nbtName": "raw_iron_block",
        "supportBlockMandatory": false
      }
    ]
  },
  {
    "csId": 60,
    "baseId": 61,
    "colourName": "Glow Lichen",
    "r": 127,
    "g": 167,
    "b": 150,
    "blocks": [
      {
        "blockId": 0,
        "displayName": "Glow Lichen",
        "nbtName": "glow_lichen",
        "supportBlockMandatory": true
      },
      {
        "blockId": 1,
        "displayName": "Verdant Froglight",
        "nbtName": "verdant_froglight",
        "supportBlockMandatory": false
      }
    ]
  }
];

import { PALETTE } from './palette';
import type { PaletteColor } from './palette';

// ── Block selection state ──────────────────────────────────────────────────
// Maps csId → array of active blockIds within that colour row.
// An empty array means the entire row (baseId) is excluded from the palette.
export type BlockSelection = Record<number, number[]>;

// ── Palette builder ───────────────────────────────────────────────────────

/**
 * Build a PaletteColor[] from a BlockSelection.
 * @param shades  Which shade indices to include (default all 4).
 *   Pass [2] for 2D flat (×1.0 shade only, ~61 colors).
 *   Pass [0,1,2] for 3D staircase (all usable shades, ~183 colors).
 */
export function buildPaletteFromSelection(
  sel: BlockSelection,
  shades: number[] = [0, 1, 2, 3],
): PaletteColor[] {
  const activeBaseIds = new Set<number>();
  for (const [csIdStr, blockIds] of Object.entries(sel)) {
    if (blockIds.length > 0) {
      const row = COLOUR_ROWS[Number(csIdStr)];
      if (row) activeBaseIds.add(row.baseId);
    }
  }
  const shadeSet = new Set(shades);
  return PALETTE.filter(c => activeBaseIds.has(c.baseId) && shadeSet.has(c.shade));
}

/**
 * Return the preferred Minecraft block NBT name for a pixel with the given
 * baseId, using the first active block from the user's selection.
 */
export function getPreferredBlockNbt(baseId: number, sel: BlockSelection): string {
  const row = COLOUR_ROWS.find(r => r.baseId === baseId);
  if (!row) return 'stone';
  const activeIds = sel[row.csId] ?? [];
  const block = row.blocks.find(b => activeIds.includes(b.blockId));
  return block?.nbtName ?? 'stone';
}

/** Returns true if the selected block for this baseId requires a support block underneath. */
export function isMandatorySupport(baseId: number, sel: BlockSelection): boolean {
  const row = COLOUR_ROWS.find(r => r.baseId === baseId);
  if (!row) return false;
  const activeIds = sel[row.csId] ?? [];
  const block = row.blocks.find(b => activeIds.includes(b.blockId)) ?? row.blocks[0];
  return block?.supportBlockMandatory ?? false;
}

// ── Built-in presets ─────────────────────────────────────────────────────

const ALL: BlockSelection = Object.fromEntries(
  COLOUR_ROWS.map(row => [row.csId, row.blocks.slice(0, 1).map(b => b.blockId)]),
);

// Dye-colour row csIds (White Wool → Black Wool = csIds 13–28)
const DYE_CS_IDS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];

function dyeOnly(filterFn: (b: PaletteBlock) => boolean): BlockSelection {
  return Object.fromEntries(
    COLOUR_ROWS.map(row => [
      row.csId,
      DYE_CS_IDS.includes(row.csId)
        ? row.blocks.filter(filterFn).map(b => b.blockId)
        : [],
    ]),
  );
}

export const BUILTIN_PRESETS: Readonly<Record<string, BlockSelection>> = {
  'All Blocks':  ALL,
  'Carpet Only': dyeOnly(b => b.nbtName.endsWith('_carpet')),
};

export const DEFAULT_SELECTION: BlockSelection = ALL;
