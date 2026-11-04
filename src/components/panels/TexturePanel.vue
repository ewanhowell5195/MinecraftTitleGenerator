<script setup>
import { computed, ref, watch } from "vue"
import { image, tileableUrl } from "../../lib/assets.js"
import { titleCase } from "../../lib/names.js"
import { usePanel } from "../../lib/panel.js"
import { library } from "../../lib/scene.js"
import { setTexture } from "../../lib/settings.js"
import { popular } from "../../lib/stats.js"
import { thumbnail, thumbnailHeight, tilePreview } from "../../lib/ui.js"
import GradientEditor from "../GradientEditor.vue"
import Panel from "../Panel.vue"
import Segments from "../Segments.vue"
import Slider from "../Slider.vue"
import Tile from "../Tile.vue"
import Toggle from "../Toggle.vue"

const TILE_SCALES = [1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 5, 6, 7, 8]
const SOURCES = [{ value: "premade", label: "Textures" }, { value: "tileable", label: "Tileables" }, { value: "gradient", label: "Gradient" }]

const { object, font, list, modified, reset } = usePanel("texture")
const search = ref("")
const tileSize = ref({ width: 16, height: 16 })

const textures = computed(() => popular(Object.entries(list.value?.textures ?? {}), ([id]) => `${font.value?.id}.${id}`))
const tileables = computed(() => popular(Object.entries(library.tileables), ([id]) => `tileable.${id}`))
const textureVariants = computed(() => Object.entries(list.value?.textures[object.value.texture]?.variants ?? {}))
const tileableVariants = computed(() => Object.entries(library.tileables[object.value.tileable]?.variants ?? {}))

function searched(entries, selected) {
  const term = search.value.trim().toLowerCase()
  if (entries.length <= 16 || !term) return entries
  return entries.filter(([id, data]) => id === selected || id.includes(term) || (data.name ?? "").toLowerCase().includes(term) || (data.category ?? "").toLowerCase().includes(term) || Object.keys(data.variants ?? {}).some(key => key.includes(term)))
}

const shownTextures = computed(() => searched(textures.value, object.value.texture))
const shownTileables = computed(() => searched(tileables.value, object.value.tileable))

function spread() {
  const order = object.value.stops.slice().sort((a, b) => a.position - b.position)
  order.forEach((item, i) => item.position = Math.round(i / (object.value.smooth ? order.length - 1 : order.length) * 100))
}

function rows(variants) {
  return Math.ceil((variants.length + 1) / 3)
}

function label(id, data) {
  return data.category ?? data.name ?? titleCase(id)
}

function variantBadge(data) {
  return data.variants ? Object.keys(data.variants).length + 1 : 0
}

watch(() => [object.value.textureSource, object.value.tileable, object.value.tileableVariant, library.tileables], async () => {
  if (object.value.textureSource !== "tileable" || !library.tileables[object.value.tileable]) return
  const img = await image(tileableUrl(library.tileables, object.value.tileable, object.value.tileableVariant))
  tileSize.value = { width: img.width, height: img.height }
}, { immediate: true })

watch(() => object.value.textureSource, () => {
  search.value = ""
})
</script>

<template>
  <Panel title="Source" :modified="modified" @reset="reset">
    <div class="flow" :class="{ pick: object.textureSource !== 'gradient' }">
      <Segments :options="SOURCES" :model-value="object.textureSource" @update:model-value="setTexture(object, { textureSource: $event })" />

      <template v-if="object.textureSource === 'premade'">
        <input v-if="textures.length > 16" type="text" v-model="search" placeholder="Search textures">
        <div class="grid scroll">
          <Tile v-for="[id, data] of shownTextures" :key="id" :label="label(id, data)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id)" :author="data.author" :badge="variantBadge(data)" :selected="object.texture === id" @pick="setTexture(object, { texture: id, textureVariant: null })" />
        </div>
        <template v-if="textureVariants.length">
          <h3>Variants</h3>
          <div class="grid scroll variants" :style="{ '--rows': rows(textureVariants) }">
            <Tile :label="list.textures[object.texture].name ?? titleCase(object.texture)" :unit="thumbnailHeight(font)" :image="thumbnail(font, object.texture)" :selected="!object.textureVariant" @pick="setTexture(object, { textureVariant: null })" />
            <Tile v-for="[id, data] of textureVariants" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id)" :author="data.author ?? list.textures[object.texture].author" :selected="object.textureVariant === id" @pick="setTexture(object, { textureVariant: id })" />
          </div>
        </template>
      </template>

      <template v-if="object.textureSource === 'tileable'">
        <input v-if="tileables.length > 16" type="text" v-model="search" placeholder="Search textures">
        <div class="grid scroll">
          <Tile v-for="[id, data] of shownTileables" :key="id" :label="label(id, data)" :pattern="tilePreview(library.tileables, id)" :author="data.author" :badge="variantBadge(data)" :selected="object.tileable === id" @pick="object.tileable = id; object.tileableVariant = null" />
        </div>
        <template v-if="tileableVariants.length">
          <h3>Variants</h3>
          <div class="grid scroll variants" :style="{ '--rows': rows(tileableVariants) }">
            <Tile :label="library.tileables[object.tileable].name" :pattern="tilePreview(library.tileables, object.tileable)" :selected="!object.tileableVariant" @pick="object.tileableVariant = null" />
            <Tile v-for="[id, data] of tileableVariants" :key="id" :label="data.name" :pattern="tilePreview(library.tileables, object.tileable, id)" :author="data.author ?? library.tileables[object.tileable].author" :selected="object.tileableVariant === id" @pick="object.tileableVariant = id" />
          </div>
        </template>
      </template>
    </div>

    <template v-if="object.textureSource === 'tileable'">
      <h3>Tiling</h3>
      <Slider label="Scale" v-model="object.tileableScale" :min="0.25" :max="8" :steps="TILE_SCALES" />
      <Slider label="X offset" v-model="object.tileableXOffset" :min="0" :max="tileSize.width" />
      <Slider label="Y offset" v-model="object.tileableYOffset" :min="0" :max="tileSize.height" />
      <Toggle label="Random rotations" v-model="object.tileableRandomRotations" />
      <Toggle label="Random mirroring" v-model="object.tileableRandomMirroring" />
      <Toggle label="Tile edge faces" hint="Top, bottom, side and inner faces. Off stretches the letter's edge pixels across them" v-model="object.tileableTileEdges" />
    </template>

    <template v-if="object.textureSource === 'gradient'">
      <GradientEditor v-model="object.stops" :smooth="object.smooth" :angle="object.gradientAngle" :key="object.id" />
      <Toggle label="Smooth gradient" v-model="object.smooth" />
      <button class="wide" @click="spread">Spread evenly</button>
      <Slider label="Angle" v-model="object.gradientAngle" :min="0" :max="360" />
    </template>

    <Toggle v-if="object.textureSource !== 'premade' && font?.overlay" label="Hide the font's own overlay" v-model="object.disableFontOverlay" />
  </Panel>
</template>

<style scoped>
.pick {
  /* 42px is the Panel.vue header: 28px tall plus its 14px margin */
  height: max(520px, calc(100cqh - 42px - 2 * var(--group-padding)));
  container-type: inline-size;
}

.scroll {
  flex: 0 1 auto;
  align-content: start;
}

.variants {
  --row: calc(((100cqw - 16px) / 3 - 16px) * 132 / 288 + 39px);
  --shown: min(var(--rows), 3);
  flex: 0 1000 auto;
  min-height: calc(var(--shown) * var(--row) + (var(--shown) - 1) * 8px);
}
</style>
