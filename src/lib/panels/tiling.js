import { computed, ref, watch } from "vue"
import { image, tileableUrl } from "../texture/assets.js"
import { blockTextureImage } from "../minecraft/minecraft.js"
import { EulaDeclined } from "../minecraft/eula.js"
import { host } from "./host.js"

const TILE_SCALES = [1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 5, 6, 7, 8]

function isTiled({ object }) {
  return object.textureSource === "tileable" || object.textureSource === "custom" && !!object.customTexture && object.customTextureMode === "tileable"
}

function useTileSize(context) {
  const object = computed(() => context.object)
  const tileSize = ref({ width: 16, height: 16 })
  let sizeRequest = 0

  const tiled = computed(() => isTiled(context))

  watch(() => [tiled.value, object.value.textureSource, object.value.customTexture, object.value.tileableSource, object.value.tileable, object.value.tileableVariant, object.value.minecraftTexture, object.value.minecraftVersion, host.library.tileables], async () => {
    const target = object.value
    if (!tiled.value) return
    if (target.textureSource === "tileable" && target.tileableSource !== "minecraft" && !host.library.tileables[target.tileable]) return
    const request = ++sizeRequest
    let img
    try {
      img = await (target.textureSource === "custom" ? image(target.customTexture) : target.tileableSource === "minecraft" ? blockTextureImage(target.minecraftVersion, target.minecraftTexture) : image(tileableUrl(host.library.tileables, target.tileable, target.tileableVariant)))
    } catch (err) {
      if (err instanceof EulaDeclined) return
      throw err
    }
    if (request === sizeRequest) tileSize.value = { width: img.width, height: img.height }
  }, { immediate: true })

  return tileSize
}

export const TILING_PANEL = {
  id: "tiling",
  title: "Tiling",
  setup: useTileSize,
  shown: (get, context) => isTiled(context),
  controls: [
    { type: "slider", key: "tileableScale", label: "Scale", min: 0.25, max: 8, steps: TILE_SCALES },
    { type: "slider", key: "tileableXOffset", label: "X offset", min: 0, max: (get, { state }) => state.value.width },
    { type: "slider", key: "tileableYOffset", label: "Y offset", min: 0, max: (get, { state }) => state.value.height },
    { type: "toggle", key: "tileableRandomRotations", label: "Random rotations" },
    { type: "toggle", key: "tileableRandomMirroring", label: "Random mirroring" },
    { type: "toggle", key: "tileableTileEdges", label: "Tile the edges", hint: "Repeats the texture on the top, bottom, side and inner faces" },
    { type: "toggle", key: "tileablePerCharacter", label: "Restart on each character", hint: "Starts the texture again from the left of every character" }
  ]
}
