<script setup>
  import { computed, ref, watch } from "vue"
  import { image } from "../../lib/texture/assets.js"
  import { usePanel } from "./panel.js"
  import { readImage } from "../../lib/state/ui.js"
  import { usedTextures } from "./uploads.js"
  import Segments from "../../components/Segments.vue"
  import UploadField from "../../components/UploadField.vue"
  import UploadReuse from "../../components/UploadReuse.vue"

  const CUSTOM_MODES = [{ value: "standard", label: "Standard" }, { value: "tileable", label: "Tileable" }, { value: "strip", label: "Strip" }]
  const SAME_SHAPE = 0.01

  const { object, font } = usePanel("texture")
  const flatSize = ref(null)
  const customSize = ref(null)

  const fitsFont = computed(() => !customSize.value || !flatSize.value || sameShape(customSize.value, flatSize.value))
  const modeHint = computed(() => ({
    standard: fitsFont.value ? "Painted onto the letters using the same layout as this font's flat texture." : "This image isn't the shape of this font's flat texture, so it won't line up with the letters.",
    tileable: "Repeated across the letters. The tiling settings are below.",
    strip: font.value?.layers?.length > 1 ? "Read from top to bottom as the top edge, the front and the bottom edge of each layer in turn, starting with layer 1, then repeated along the line." : "Read from top to bottom as the top edge, the front and the bottom edge, then repeated along the line."
  })[object.value.customTextureMode])
  const reusable = computed(() => usedTextures().filter(item => item.value !== object.value.customTexture).map(item => ({ ...item, image: item.value })))

  function sameShape(a, b) {
    return Math.abs(a.width / a.height - b.width / b.height) < SAME_SHAPE
  }

  async function pickCustom(data) {
    const target = object.value
    const [upload, flat] = await Promise.all([image(data), image(`${font.value.sheetFolder}/textures/flat.png`)])
    target.customTexture = data
    target.customTextureMode = sameShape(upload, flat) ? "standard" : "tileable"
  }

  watch(() => [object.value.customTexture, font.value?.sheetFolder], async ([data, folder]) => {
    customSize.value = null
    flatSize.value = null
    if (!data || !folder) return
    const [upload, flat] = await Promise.all([image(data), image(`${folder}/textures/flat.png`)])
    if (data !== object.value.customTexture) return
    customSize.value = { width: upload.width, height: upload.height }
    flatSize.value = { width: flat.width, height: flat.height }
  }, { immediate: true })
</script>

<template>
  <UploadField accept="image/*" :label="object.customTexture ? 'Replace texture' : 'Choose an image'" empty="No texture uploaded" :image="object.customTexture" :clearable="!!object.customTexture" @change="readImage($event, pickCustom)" @clear="object.customTexture = null" />
  <template v-if="object.customTexture">
    <Segments label="Use as" :options="CUSTOM_MODES" v-model="object.customTextureMode" />
    <p class="hint" :class="{ bad: object.customTextureMode === 'standard' && !fitsFont }">{{ modeHint }}</p>
  </template>
  <p v-else class="hint">An image the shape of this font's flat texture is painted onto the letters. Anything else is tiled, or you can use it as a strip.</p>
  <UploadReuse :items="reusable" @pick="pickCustom" />
</template>
