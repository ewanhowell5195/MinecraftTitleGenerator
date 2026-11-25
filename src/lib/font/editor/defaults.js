import { defaultBorder, defaultDepth } from "#lib/settings/defaults.js"

export const DEFAULT_SPACE_WIDTH = 8
export const DEFAULT_DEPTH = defaultDepth(null)
export const DEFAULT_BORDER = defaultBorder("top", null)

export const DEFAULT_ID = "my-font"
export const TARGET_PIXEL_HEIGHT = [32, 50]
export const PIXEL_HEIGHT_LIMIT = 64
export const LETTER_CASES = [{ value: "both", label: "Both cases" }, { value: "upper", label: "Uppercase" }, { value: "lower", label: "Lowercase" }]

export function createFont({ height = 40, width = 24, grid = 4, density = 1, letterCase = "upper" } = {}) {
  return { name: "My Font", id: "", authors: [], description: "", preview: "", basedOn: "", height, width, grid, density, letterCase, creeper: false, extras: [], defineSpace: false, spaceWidth: DEFAULT_SPACE_WIDTH, depth: DEFAULT_DEPTH, border: DEFAULT_BORDER, characterSpacing: 0, terminatorSpace: true, terminatorSpaceWidth: null, forcedTerminators: false, autoBorder: false, flat: false, overlay: false, allFaces: false, layerDepth: "stacked", strips: [], kerning: {}, glyphs: {}, imported: null, requireCharacters: true, omitted: [] }
}
