export const FORMAT = "minecraft_title"

let format = null
let shading = null

export function registerFormat({ onNew }) {
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
      if (!newProject(this)) return false
      onNew()
      return true
    },
    onActivation() {
      shading = settings.shading.value
      settings.shading.set(false)
    },
    onDeactivation() {
      if (shading !== null) settings.shading.set(shading)
      shading = null
    }
  })
}

export function unregisterFormat() {
  format?.delete()
  format = null
}
