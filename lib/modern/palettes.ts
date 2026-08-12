// Colour palettes for the Modern print.
//
// A palette is the whole print's colour scheme in one pick — the customer chooses
// "Atlantic Blue", not six separate hexes. Each one carries four decisions:
//
//   paper    the poster background the information block prints onto
//   ink      the heading, divider and captions
//   land     the map's landmass
//   water    the sea, lakes and the out-of-Ireland mask
//
// Everything else the map needs (roads, contours, buildings, labels) is derived from
// those four in `mapPaletteFor` below, so a new palette never has to reason about
// contour greys. The DED polygon colour is chosen separately — see POLYGON_COLOUR_OPTIONS
// in mapStyle.ts — but each palette names the polygon colour it was tuned against, used
// as the default until the customer overrides it.

import { mixHex } from "@/lib/design/appearance";
import type { ModernPalette } from "./mapStyle";

export type PrintPalette = {
  id: string;
  label: string;
  /** Poster background behind the information block. */
  paper: string;
  /** Heading, divider and caption colour. */
  ink: string;
  /** Landmass fill. */
  land: string;
  /** Sea, lakes, and everything outside Ireland. */
  water: string;
  /** Default DED overlay colour for this palette. */
  polygon: string;
};

// Ordered as they appear in the picker: neutrals first (the safe, most-picked choices),
// then blues and greens, then the warm end. A customer scanning the grid should hit a
// usable monochrome in the first row rather than having to hunt past twenty colours.
export const PRINT_PALETTES: PrintPalette[] = [
  // ── Neutrals ──────────────────────────────────────────────────────
  {
    id: "monochrome",
    label: "Monochrome",
    paper: "#FFFFFF",
    ink: "#1A1A1A",
    land: "#FAFAFA",
    water: "#EDEDED",
    polygon: "#1A1A1A",
  },
  {
    id: "chalk-ink",
    label: "Chalk Ink",
    paper: "#F4F2EC",
    ink: "#20211F",
    land: "#EAE7DE",
    water: "#D6D2C6",
    polygon: "#20211F",
  },
  {
    id: "pebble",
    label: "Pebble",
    paper: "#F7F6F3",
    ink: "#3D3B37",
    land: "#EFEDE7",
    water: "#DAD7CE",
    polygon: "#6E6A61",
  },
  {
    id: "stone-taupe",
    label: "Stone Taupe",
    paper: "#F6F3EE",
    ink: "#4A423A",
    land: "#EDE7DE",
    water: "#CFC5B6",
    polygon: "#7B6B58",
  },
  {
    id: "heritage-topo",
    label: "Heritage Topo",
    paper: "#F7F1E4",
    ink: "#4B3D28",
    land: "#F3EBDA",
    water: "#D8CDB4",
    polygon: "#8A6A3B",
  },
  {
    id: "slate",
    label: "Slate",
    paper: "#F4F4F3",
    ink: "#2E3439",
    land: "#E9EAEA",
    water: "#CDD3D7",
    polygon: "#4B5563",
  },

  // ── Blues ─────────────────────────────────────────────────────────
  {
    id: "stone-navy",
    label: "Stone Navy",
    paper: "#F5F4F0",
    ink: "#1C2A44",
    land: "#EDECE6",
    water: "#C7CCD6",
    polygon: "#1C2A44",
  },
  {
    id: "atlantic-blue",
    label: "Atlantic Blue",
    paper: "#F3F5F7",
    ink: "#13324F",
    land: "#E8EDF1",
    water: "#1D4B72",
    polygon: "#0E2942",
  },
  {
    id: "ice-navy",
    label: "Ice Navy",
    paper: "#F4F7F9",
    ink: "#1B2E48",
    land: "#E4EBF1",
    water: "#B9CBDA",
    polygon: "#22406A",
  },
  {
    id: "powder-blue",
    label: "Powder Blue",
    paper: "#F6F8F9",
    ink: "#39485A",
    land: "#EDF2F5",
    water: "#C5D8E4",
    polygon: "#5E7C93",
  },
  {
    id: "petrol-sand",
    label: "Petrol Sand",
    paper: "#F4F1E9",
    ink: "#1E4148",
    land: "#EAE4D5",
    water: "#215A63",
    polygon: "#16343A",
  },
  {
    id: "heron",
    label: "Heron",
    paper: "#F5F5F4",
    ink: "#2C3B45",
    land: "#E9EBEA",
    water: "#9FB3BE",
    polygon: "#44606E",
  },

  // ── Greens ────────────────────────────────────────────────────────
  {
    id: "deep-moss",
    label: "Deep Moss",
    paper: "#F4F4EE",
    ink: "#1F3527",
    land: "#E9EADF",
    water: "#B7C2B4",
    polygon: "#234C3A",
  },
  {
    id: "bracken",
    label: "Bracken",
    paper: "#F5F3EA",
    ink: "#39401F",
    land: "#ECE8D8",
    water: "#C3C7AE",
    polygon: "#5A6428",
  },
  {
    id: "sage",
    label: "Sage",
    paper: "#F5F6F1",
    ink: "#3B4A3C",
    land: "#EBEEE5",
    water: "#C2CFC0",
    polygon: "#6B8168",
  },
  {
    id: "glasshouse",
    label: "Glasshouse",
    paper: "#F3F6F3",
    ink: "#2F4438",
    land: "#E6EDE7",
    water: "#AFC7BC",
    polygon: "#3F6B55",
  },
  {
    id: "fennel",
    label: "Fennel",
    paper: "#F6F4E8",
    ink: "#4A4A18",
    land: "#EEEBD6",
    water: "#CBCB9E",
    polygon: "#7A7A22",
  },
  {
    id: "teal",
    label: "Teal",
    paper: "#F2F6F6",
    ink: "#14413F",
    land: "#E4EDEC",
    water: "#2C7A75",
    polygon: "#14413F",
  },

  // ── Warms ─────────────────────────────────────────────────────────
  {
    id: "olive-blush",
    label: "Olive Blush",
    paper: "#F6F2EA",
    ink: "#4A4A2E",
    land: "#EFE9DA",
    water: "#D9C2AE",
    polygon: "#6C6C3C",
  },
  {
    id: "peach-clay",
    label: "Peach Clay",
    paper: "#F8F2EC",
    ink: "#5B3A2E",
    land: "#F1E6DC",
    water: "#D3A48C",
    polygon: "#A95F45",
  },
  {
    id: "golden-ochre",
    label: "Golden Ochre",
    paper: "#F9F3E4",
    ink: "#5A3F10",
    land: "#F3E9CF",
    water: "#D9A72B",
    polygon: "#8A6114",
  },
  {
    id: "burnt-orange",
    label: "Burnt Orange",
    paper: "#F8F1EA",
    ink: "#5E2A14",
    land: "#F1E3D6",
    water: "#C7511F",
    polygon: "#8A3A16",
  },
  {
    id: "mulberry",
    label: "Mulberry",
    paper: "#F8F1EF",
    ink: "#4E1620",
    land: "#F0E2E0",
    water: "#93202E",
    polygon: "#6B1A25",
  },
  {
    id: "blush",
    label: "Blush",
    paper: "#F9F2F2",
    ink: "#5C3540",
    land: "#F3E5E6",
    water: "#DFA3B0",
    polygon: "#A85D6E",
  },
  {
    id: "plum-sand",
    label: "Plum Sand",
    paper: "#F6F2F4",
    ink: "#3D2742",
    land: "#EDE6EA",
    water: "#A98BB0",
    polygon: "#5E3A66",
  },
  {
    id: "lilac-ink",
    label: "Lilac Ink",
    paper: "#F5F3F7",
    ink: "#2B2440",
    land: "#EAE6F0",
    water: "#C0B4D8",
    polygon: "#4A3E6B",
  },
];

export const DEFAULT_PALETTE_ID = "monochrome";

export function getPaletteById(id: string | undefined): PrintPalette {
  return PRINT_PALETTES.find((p) => p.id === id) ?? PRINT_PALETTES[0];
}

/**
 * The full MapLibre palette for a print palette. Roads, contours and labels are all
 * mixed between the palette's own land and ink rather than being fixed greys, so a
 * warm palette gets warm contours and a cool one gets cool — the map reads as one
 * colourway instead of a coloured landmass with grey furniture drawn on top.
 */
export function mapPaletteFor(palette: PrintPalette): ModernPalette {
  return {
    land: palette.land,
    water: palette.water,
    waterLine: mixHex(palette.water, palette.ink, 0.25),
    building: mixHex(palette.land, palette.ink, 0.12),
    road: mixHex(palette.land, palette.ink, 0.85),
    roadCasing: palette.land,
    roadMinor: mixHex(palette.land, palette.ink, 0.55),
    contour: mixHex(palette.land, palette.ink, 0.3),
    label: mixHex(palette.land, palette.ink, 0.75),
    labelHalo: palette.land,
  };
}
