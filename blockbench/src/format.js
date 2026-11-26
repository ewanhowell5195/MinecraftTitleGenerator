import { whenLibrary } from "./offline.js"
import { STYLES, startPage } from "./startPage.js"

export const FORMAT = "minecraft_title"

let format = null
let styles = null

export function registerFormat({ onNew }) {
  styles = Blockbench.addCSS(STYLES)
  format = new ModelFormat({
    id: FORMAT,
    name: "Minecraft Title",
    description: "Make Minecraft styled titles that you can render in high quality",
    icon: "text_fields",
    category: "minecraft",
    target: ["Minecraft"],
    render_sides: "front",
    model_identifier: false,
    rotate_cubes: true,
    uv_rotation: true,
    bone_rig: true,
    meshes: true,
    centered_grid: true,
    per_texture_uv_size: true,
    new() {
      return whenLibrary(() => {
        if (!newProject(format)) return false
        onNew()
        return true
      })
    },
    format_page: { component: startPage({ create: () => format.new() }) }
  })
}

export function unregisterFormat() {
  format?.delete()
  format = null
  styles?.delete()
  styles = null
}
