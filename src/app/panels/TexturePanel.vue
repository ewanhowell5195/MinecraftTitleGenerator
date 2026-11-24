<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import { tileableUrl } from "../../lib/texture/assets.js"
  import { credit } from "../../lib/font/credits.js"
  import { blockName, blockTextures, latestRelease } from "../../lib/minecraft/minecraft.js"
  import { keepVersions } from "../../lib/minecraft/minecraftModels.js"
  import { titleCase } from "../../lib/core/names.js"
  import { layerShown, usePanel } from "./panel.js"
  import { openedFirst, useOpened } from "../../components/composables/opened.js"
  import { SEARCH_ABOVE, leastRows, usePickFloor, variantRows } from "./pickFloor.js"
  import { gameVersions, library } from "../../lib/state/scene.js"
  import { EulaDeclined, eulaDeclined } from "../../lib/minecraft/eula.js"
  import { pinnedTextures, setTexture, untouchedTileable } from "../../lib/settings/textureDefaults.js"
  import { viewed } from "../../lib/settings/layers.js"
  import { minecraftStatId, popular, statScope } from "../../lib/state/stats.js"
  import { stripCovers } from "../../lib/font/strips.js"
  import { saveImage } from "../../lib/state/imageFiles.js"
  import { thumbnail, thumbnailHeight } from "../../lib/font/thumbnailUrls.js"
  import Button from "../../components/Button.vue"
  import CustomTexture from "./CustomTexture.vue"
  import GradientEditor from "../GradientEditor.vue"
  import MinecraftDownload from "../MinecraftDownload.vue"
  import MinecraftVersionField from "../MinecraftVersionField.vue"
  import Notice from "../../components/Notice.vue"
  import Panel from "../Panel.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Segments from "../../components/Segments.vue"
  import { GRADIENT_MIXES } from "../../lib/texture/colourStops.js"
  import Slider from "../../components/Slider.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"
  import TilingPanel from "./TilingPanel.vue"
  import Toggle from "../../components/Toggle.vue"

  const SOURCES = [{ value: "premade", label: "Textures" }, { value: "tileable", label: "Tileables" }, { value: "gradient", label: "Gradient" }, { value: "custom", label: "Custom" }]
  const TILEABLE_SOURCES = [{ value: "minecraft", label: "Minecraft textures" }, { value: "premade", label: "Premade" }]
  const WHITE = "#ffffff"

  const { object, font, list, modified, reset } = usePanel("texture")
  const shownLayer = layerShown("texture")

  function textureMenu(id, data) {
    return [{ label: "Download texture", icon: "download", action: () => saveImage(`${data.folder ?? font.value.sheetFolder}/textures/${id}.png`, `${id}.png`) }]
  }

  function blockMenu(id, data) {
    return [{ label: "Download texture", icon: "download", action: () => saveImage(data.url, `${id}.png`) }]
  }

  function tileableMenu(id, variant = null) {
    return [{ label: "Download tileable", icon: "download", action: () => saveImage(tileableUrl(library.tileables, id, variant), `${variant ?? id}.png`) }]
  }

  function tilePreview(tileables, id, variant) {
    return { backgroundImage: `url(${tileableUrl(tileables, id, variant)})` }
  }

  const sources = computed(() => {
    return font.value?.model ? SOURCES.filter(source => source.value === "premade") : SOURCES
  })
  const search = ref("")
  const blocks = shallowRef(null)
  const blocksError = ref("")
  const pending = shallowRef(null)
  let blocksRequest = 0

  const opened = useOpened(() => ({ ...object.value }), () => [object.value.id, font.value?.id, object.value.textureSource, object.value.tileableSource])
  const usingMinecraft = computed(() => object.value.textureSource === "tileable" && object.value.tileableSource === "minecraft")
  const waiting = computed(() => pending.value?.target === viewed(object.value) ? pending.value.values : null)
  const textures = computed(() => {
    const entries = Object.entries(list.value?.textures ?? {}).filter(([, data]) => stripCovers(data, shownLayer.value, font.value?.layers?.length ?? 1))
    const statId = id => `${statScope(object.value, font.value?.id)}.${id}`
    return popular(entries, ([id]) => statId(id), ([id, data]) => label(id, data), [opened.value.texture].concat(list.value ? pinnedTextures(list.value) : []).map(statId))
  })
  const tileables = computed(() => popular(Object.entries(library.tileables), ([id]) => `tileable.${id}`, ([id, data]) => label(id, data), [`tileable.${opened.value.tileable}`]))
  const blockEntries = computed(() => popular(Array.from(blocks.value ?? []).filter(([id, { opaque }]) => opaque || id === object.value.minecraftTexture).map(([id, { preview }]) => [id, { name: blockName(id), url: preview }]), ([id]) => minecraftStatId(id), ([, data]) => data.name, [minecraftStatId(opened.value.minecraftTexture)]))
  const textureVariants = computed(() => openedFirst(Object.entries(list.value?.textures[object.value.texture]?.variants ?? {}), ([id]) => id === opened.value.textureVariant))
  const tileableVariants = computed(() => openedFirst(Object.entries(library.tileables[object.value.tileable]?.variants ?? {}), ([id]) => id === opened.value.tileableVariant))

  function searchable(entries) {
    return entries.length > SEARCH_ABOVE
  }

  function searched(entries) {
    const term = search.value.trim().toLowerCase()
    if (!searchable(entries) || !term) return entries
    return entries.filter(([id, data]) => id.includes(term) || (data.name ?? "").toLowerCase().includes(term) || (data.category ?? "").toLowerCase().includes(term))
  }

  function flattened(entries) {
    const term = search.value.trim().toLowerCase()
    const words = (id, data) => [id, data.name ?? "", data.category ?? ""].map(text => text.toLowerCase())
    return entries.flatMap(([id, data]) => [{ id, variant: null, data, parent: data }].concat(Object.entries(data.variants ?? {}).map(([key, own]) => ({ id, variant: key, data: own, parent: data })))).filter(item => words(item.variant ?? item.id, item.data).concat(words(item.id, item.parent)).some(text => text.includes(term)))
  }

  const searchingTextures = computed(() => searchable(textures.value) && !!search.value.trim())
  const searchingTileables = computed(() => searchable(tileables.value) && !!search.value.trim())
  const foundTextures = computed(() => searchingTextures.value ? flattened(textures.value) : [])
  const foundTileables = computed(() => searchingTileables.value ? flattened(tileables.value) : [])
  const shownBlocks = computed(() => searched(blockEntries.value))

  function spread() {
    const order = object.value.stops.slice().sort((a, b) => a.position - b.position)
    order.forEach((item, i) => item.position = Math.round(i / (object.value.smooth ? order.length - 1 : order.length) * 100))
  }

  const { picker, floor } = usePickFloor(() => [object.value.textureSource, usingMinecraft.value, textureVariants.value.length, tileableVariants.value.length, search.value])

  function label(id, data) {
    return data.category ?? data.name ?? titleCase(id)
  }

  function variantBadge(data) {
    return data.variants ? Object.keys(data.variants).length + 1 : 0
  }

  function blockTint(id) {
    return blocks.value?.get(id)?.tint ?? null
  }

  function retint(next, target = object.value) {
    const current = target.textureSource === "tileable" && target.tileableSource === "minecraft" ? blockTint(target.minecraftTexture) : null
    if (target.colour.toLowerCase() === WHITE || target.colour.toLowerCase() === current) target.colour = next ?? WHITE
  }

  function pickBlock(id, target = object.value) {
    retint(blockTint(id), target)
    target.minecraftTexture = id
  }

  async function minecraftTint(target) {
    let version = target.minecraftVersion
    try {
      version ??= await latestRelease()
    } catch (err) {
      blocksError.value = `Could not load the Minecraft versions: ${err.message}`
      return { version, tint: null }
    }
    try {
      return { version, tint: (await blockTextures(version)).get(target.minecraftTexture)?.tint ?? null }
    } catch (err) {
      if (err instanceof EulaDeclined) throw err
      blocksError.value = `Could not load Minecraft ${version}: ${err.message}`
      return { version, tint: null }
    }
  }

  async function switchToMinecraft(target, values = {}) {
    const request = { target: viewed(target), values: { ...values, tileableSource: "minecraft" } }
    const before = list.value
    pending.value = request
    blocksError.value = ""
    try {
      const { version, tint } = await minecraftTint(target)
      if (pending.value !== request) return
      retint(tint, target)
      setTexture(target, { ...request.values, minecraftVersion: version }, { before })
    } catch (err) {
      if (!(err instanceof EulaDeclined)) throw err
      if (pending.value === request) setTexture(target, { ...request.values, tileableSource: "premade", tileable: "checkerboard", tileableVariant: null }, { before })
    } finally {
      if (pending.value === request) pending.value = null
    }
  }

  function chooseSource(source) {
    search.value = ""
    const target = object.value
    if (source === "tileable" && (target.tileableSource === "minecraft" || untouchedTileable(target) && !eulaDeclined())) return switchToMinecraft(target, { textureSource: source })
    pending.value = null
    if (source !== "tileable") retint(null)
    const meshCustom = source === "custom" && font.value?.mesh && target.customTextureMode === "standard"
    setTexture(target, meshCustom ? { textureSource: source, customTextureMode: "tileable" } : { textureSource: source }, { before: list.value })
  }

  function chooseTileables(source) {
    search.value = ""
    if (source === "minecraft") return switchToMinecraft(object.value)
    pending.value = null
    retint(null)
    object.value.tileableSource = source
  }

  function resetSource() {
    pending.value = null
    retint(null)
    reset()
  }

  async function chooseVersion(version) {
    const target = object.value
    blocksError.value = ""
    try {
      const textures = await blockTextures(version)
      const solid = Array.from(textures.keys()).filter(id => textures.get(id).opaque)
      if (!solid.length) throw new Error(`Minecraft ${version} has no block textures without transparency`)
      target.minecraftVersion = version
      if (!textures.has(target.minecraftTexture)) pickBlock(["cobblestone", "stone"].find(id => solid.includes(id)) ?? solid[0], target)
    } catch (err) {
      blocksError.value = err.message
    }
  }

  watch(() => [usingMinecraft.value, object.value.minecraftVersion], async () => {
    if (!usingMinecraft.value || !object.value.minecraftVersion) return
    const request = ++blocksRequest
    blocks.value = null
    blocksError.value = ""
    try {
      const textures = await blockTextures(object.value.minecraftVersion)
      if (request !== blocksRequest) return
      blocks.value = textures
      keepVersions(gameVersions())
    } catch (err) {
      if (request === blocksRequest) blocksError.value = `Could not load Minecraft ${object.value.minecraftVersion}: ${err.message}`
    }
  }, { immediate: true })
</script>

<template>
  <Panel title="Source" :modified="modified" @reset="resetSource">
    <div ref="picker" class="flow" :class="{ pick: object.textureSource === 'premade' || object.textureSource === 'tileable', peek: object.textureSource === 'tileable' }" :style="{ minHeight: `${floor}px` }">
      <Segments v-if="sources.length > 1" :options="sources" :model-value="waiting?.textureSource ?? object.textureSource" @update:model-value="chooseSource" />
      <MinecraftDownload v-if="waiting" />

      <template v-if="object.textureSource === 'premade'">
        <input v-if="searchable(textures)" type="text" v-model="search" placeholder="Search textures" aria-label="Search textures">
        <TileGrid v-if="searchingTextures" class="scroll">
          <Tile v-for="item of foundTextures" :key="`${item.id}/${item.variant ?? ''}`" :label="item.data.name ?? titleCase(item.variant ?? item.id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, item.variant ?? item.id, shownLayer)" :author="item.variant ? credit(item.data, font?.id, library.fonts, item.parent) : credit(item.data, font?.id, library.fonts)" :selected="object.texture === item.id && (object.textureVariant ?? null) === item.variant" :menu="textureMenu(item.variant ?? item.id, item.variant ? { ...item.parent, ...item.data } : item.data)" @pick="setTexture(object, { texture: item.id, textureVariant: item.variant }, { before: list })" />
        </TileGrid>
        <TileGrid v-else class="scroll" :class="{ kept: textureVariants.length }" :style="{ '--least': leastRows(textures) }">
          <Tile v-for="[id, data] of textures" :key="id" :label="label(id, data)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id, shownLayer)" :author="credit(data, font?.id, library.fonts)" :badge="variantBadge(data)" :selected="object.texture === id" :menu="textureMenu(id, data)" @pick="setTexture(object, { texture: id, textureVariant: null }, { before: list })" />
        </TileGrid>
        <template v-if="textureVariants.length && !searchingTextures">
          <h3>Variants</h3>
          <TileGrid class="scroll variants" :style="{ '--rows': variantRows(textureVariants) }">
            <Tile :label="list.textures[object.texture].name ?? titleCase(object.texture)" :unit="thumbnailHeight(font)" :image="thumbnail(font, object.texture, shownLayer)" :selected="!object.textureVariant" :menu="textureMenu(object.texture, list.textures[object.texture])" @pick="setTexture(object, { textureVariant: null }, { before: list })" />
            <Tile v-for="[id, data] of textureVariants" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id, shownLayer)" :author="credit(data, font?.id, library.fonts, list.textures[object.texture])" :selected="object.textureVariant === id" :menu="textureMenu(id, { ...list.textures[object.texture], ...data })" @pick="setTexture(object, { textureVariant: id }, { before: list })" />
          </TileGrid>
        </template>
      </template>

      <Segments v-if="object.textureSource === 'tileable'" :options="TILEABLE_SOURCES" :model-value="waiting?.tileableSource ?? object.tileableSource" @update:model-value="chooseTileables" />

      <template v-if="usingMinecraft">
        <MinecraftVersionField :version="object.minecraftVersion" @pick="chooseVersion" />
        <Notice v-if="blocksError">{{ blocksError }}</Notice>
        <p v-else-if="blocks && !blockEntries.length" class="hint">This version has no block textures without transparency.</p>
        <template v-if="blockEntries.length">
          <input v-if="searchable(blockEntries)" type="text" v-model="search" placeholder="Search textures" aria-label="Search textures">
          <TileGrid class="scroll">
            <Tile v-for="[id, data] of shownBlocks" :key="id" :label="data.name" aspect="2 / 1" :pattern="{ backgroundImage: `url(${data.url})` }" :author="data.authors" :selected="object.minecraftTexture === id" :menu="blockMenu(id, data)" @pick="pickBlock(id)" />
          </TileGrid>
        </template>
      </template>

      <template v-if="object.textureSource === 'tileable' && !usingMinecraft">
        <input v-if="searchable(tileables)" type="text" v-model="search" placeholder="Search textures" aria-label="Search textures">
        <TileGrid v-if="searchingTileables" class="scroll">
          <Tile v-for="item of foundTileables" :key="`${item.id}/${item.variant ?? ''}`" :label="item.data.name ?? titleCase(item.variant ?? item.id)" aspect="2 / 1" :pattern="tilePreview(library.tileables, item.id, item.variant ?? undefined)" :author="item.data.authors ?? item.parent.authors" :selected="object.tileable === item.id && (object.tileableVariant ?? null) === item.variant" :menu="item.variant ? tileableMenu(item.id, item.variant) : tileableMenu(item.id)" @pick="object.tileable = item.id; object.tileableVariant = item.variant" />
        </TileGrid>
        <TileGrid v-else class="scroll patterns" :class="{ kept: tileableVariants.length }" :style="{ '--least': leastRows(tileables) }">
          <Tile v-for="[id, data] of tileables" :key="id" :label="label(id, data)" aspect="2 / 1" :pattern="tilePreview(library.tileables, id)" :author="data.authors" :badge="variantBadge(data)" :selected="object.tileable === id" :menu="tileableMenu(id)" @pick="object.tileable = id; object.tileableVariant = null" />
        </TileGrid>
        <template v-if="tileableVariants.length && !searchingTileables">
          <h3>Variants</h3>
          <TileGrid class="scroll variants patterns" :style="{ '--rows': variantRows(tileableVariants) }">
            <Tile :label="library.tileables[object.tileable].name" aspect="2 / 1" :pattern="tilePreview(library.tileables, object.tileable)" :selected="!object.tileableVariant" :menu="tileableMenu(object.tileable)" @pick="object.tileableVariant = null" />
            <Tile v-for="[id, data] of tileableVariants" :key="id" :label="data.name" aspect="2 / 1" :pattern="tilePreview(library.tileables, object.tileable, id)" :author="data.authors ?? library.tileables[object.tileable].authors" :selected="object.tileableVariant === id" :menu="tileableMenu(object.tileable, id)" @pick="object.tileableVariant = id" />
          </TileGrid>
        </template>
      </template>
    </div>

    <CustomTexture v-if="object.textureSource === 'custom'" />

    <template v-if="object.textureSource === 'gradient'">
      <GradientEditor v-model="object.stops" :smooth="object.smooth" :mix="object.mix" :angle="object.gradientAngle" :key="object.id" />
      <Toggle label="Smooth gradient" v-model="object.smooth" />
      <Dropdown v-if="object.smooth" label="Mix" :options="GRADIENT_MIXES" v-model="object.mix" />
      <Button wide @click="spread">Spread evenly</Button>
      <Slider label="Angle" v-model="object.gradientAngle" :min="0" :max="360" />
    </template>
  </Panel>

  <TilingPanel />
</template>
