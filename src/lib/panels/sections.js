import { isMinecraftShape } from "../geometry/shapes.js"
import { FACE_PANELS, FILTERS_PANEL, OUTLINE_PANEL } from "./colour.js"
import { CREEPER_PANEL, CURVES_PANEL, SPACING_PANEL, TERMINATORS_PANEL } from "./font.js"
import { FONT_PANEL } from "./fontSource.js"
import { ARC_PANEL, GEOMETRY_PANEL } from "./form.js"
import { layersPanel } from "./layers.js"
import { EDGE_OVERLAYS_PANEL, OVERLAYS_PANEL } from "./overlays.js"
import { PLACEMENT_PANEL } from "./placement.js"
import { FRAMING_PANEL, IMAGE_PANEL, SECOND_OUTLINE_PANEL } from "./render.js"
import { SHAPE_PANEL } from "./shapeSource.js"
import { TEXTURE_PANEL } from "./texture.js"
import { TILING_PANEL } from "./tiling.js"
import { TWIST_PANELS } from "./twists.js"

const TEXT_SECTIONS = new Set(["text", "font"])
const SHAPE_SECTIONS = new Set(["shape", "placement"])
const DRAWN_SECTIONS = new Set(["texture", "overlays"])

export const SECTION_PANELS = {
  text: [PLACEMENT_PANEL],
  font: [FONT_PANEL, CURVES_PANEL, CREEPER_PANEL, TERMINATORS_PANEL, SPACING_PANEL],
  shape: [SHAPE_PANEL],
  placement: [PLACEMENT_PANEL],
  texture: [layersPanel("texture"), TEXTURE_PANEL, TILING_PANEL],
  colour: [layersPanel("colour"), FILTERS_PANEL].concat(FACE_PANELS, OUTLINE_PANEL),
  overlays: [layersPanel("overlays"), OVERLAYS_PANEL, EDGE_OVERLAYS_PANEL],
  form: [GEOMETRY_PANEL, ARC_PANEL].concat(TWIST_PANELS)
}

export const RENDER_PANELS = [FRAMING_PANEL, SECOND_OUTLINE_PANEL, IMAGE_PANEL]

export function sectionFits(id, shape) {
  if (shape === null) return !SHAPE_SECTIONS.has(id)
  return !TEXT_SECTIONS.has(id) && !(isMinecraftShape(shape) && DRAWN_SECTIONS.has(id))
}

export function sectionPanels(id, shape) {
  return id === "form" && shape !== null ? [GEOMETRY_PANEL] : SECTION_PANELS[id]
}
