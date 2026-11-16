<script setup>
  import { computed, ref, watch } from "vue"
  import { image, tileableUrl } from "../../lib/texture/assets.js"
  import { blockTextureImage } from "../../lib/minecraft/minecraft.js"
  import { usePanel } from "./panel.js"
  import { library } from "../../lib/state/scene.js"
  import { EulaDeclined } from "../../lib/minecraft/eula.js"
  import Panel from "../Panel.vue"
  import Slider from "../../components/Slider.vue"
  import Toggle from "../../components/Toggle.vue"

  const TILE_SCALES = [1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 5, 6, 7, 8]

  const { object, modified, reset } = usePanel("tiling")
  const tileSize = ref({ width: 16, height: 16 })
  let sizeRequest = 0

  const tiled = computed(() => object.value.textureSource === "tileable" || object.value.textureSource === "custom" && !!object.value.customTexture && object.value.customTextureMode === "tileable")

  watch(() => [tiled.value, object.value.textureSource, object.value.customTexture, object.value.tileableSource, object.value.tileable, object.value.tileableVariant, object.value.minecraftTexture, object.value.minecraftVersion, library.tileables], async () => {
    const target = object.value
    if (!tiled.value) return
    if (target.textureSource === "tileable" && target.tileableSource !== "minecraft" && !library.tileables[target.tileable]) return
    const request = ++sizeRequest
    let img
    try {
      img = await (target.textureSource === "custom" ? image(target.customTexture) : target.tileableSource === "minecraft" ? blockTextureImage(target.minecraftVersion, target.minecraftTexture) : image(tileableUrl(library.tileables, target.tileable, target.tileableVariant)))
    } catch (err) {
      if (err instanceof EulaDeclined) return
      throw err
    }
    if (request === sizeRequest) tileSize.value = { width: img.width, height: img.height }
  }, { immediate: true })
</script>

<template>
  <Panel v-if="tiled" title="Tiling" :modified="modified" @reset="reset">
    <Slider label="Scale" v-model="object.tileableScale" :min="0.25" :max="8" :steps="TILE_SCALES" />
    <Slider label="X offset" v-model="object.tileableXOffset" :min="0" :max="tileSize.width" />
    <Slider label="Y offset" v-model="object.tileableYOffset" :min="0" :max="tileSize.height" />
    <Toggle label="Random rotations" v-model="object.tileableRandomRotations" />
    <Toggle label="Random mirroring" v-model="object.tileableRandomMirroring" />
    <Toggle label="Tile the edges" hint="Repeats the texture on the top, bottom, side and inner faces" v-model="object.tileableTileEdges" />
    <Toggle label="Restart on each character" hint="Starts the texture again from the left of every character" v-model="object.tileablePerCharacter" />
  </Panel>
</template>
