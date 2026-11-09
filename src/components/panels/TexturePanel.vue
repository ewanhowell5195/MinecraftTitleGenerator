<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import { image, tileableUrl } from "../../lib/assets.js"
  import { credit } from "../../lib/credits.js"
  import { blockName, blockTextureImage, blockTextures, jar, latestRelease } from "../../lib/minecraft.js"
  import { titleCase } from "../../lib/names.js"
  import { usePanel } from "../../lib/panel.js"
  import { library } from "../../lib/scene.js"
  import { pinnedTextures, setTexture, untouchedTileable } from "../../lib/settings.js"
  import { minecraftStatId, popular } from "../../lib/stats.js"
  import { readFile, saveImage, thumbnail, thumbnailHeight, tilePreview } from "../../lib/ui.js"
  import GradientEditor from "../GradientEditor.vue"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Tile from "../Tile.vue"
  import Toggle from "../Toggle.vue"
  import VersionDialog from "../VersionDialog.vue"

  const SEARCH_ABOVE = 16
  const TILE_SCALES = [1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 5, 6, 7, 8]
  const SOURCES = [{ value: "premade", label: "Textures" }, { value: "tileable", label: "Tileables" }, { value: "gradient", label: "Gradient" }, { value: "custom", label: "Custom" }]
  const CUSTOM_MODES = [{ value: "standard", label: "Standard" }, { value: "tileable", label: "Tileable" }, { value: "strip", label: "Strip" }]
  const SAME_SHAPE = 0.01
  const TILEABLE_SOURCES = [{ value: "minecraft", label: "Minecraft textures" }, { value: "premade", label: "Premade" }]
  const WHITE = "#ffffff"

  const { object, font, list, modified, reset } = usePanel("texture")

  function textureMenu(id, data) {
    return [{ label: "Download texture", icon: "download", action: () => saveImage(`${data.folder ?? font.value.sheetFolder}/textures/${id}.png`, `${id}.png`) }]
  }

  function blockMenu(id, data) {
    return [{ label: "Download texture", icon: "download", action: () => saveImage(data.url, `${id}.png`) }]
  }

  function tileableMenu(id, variant = null) {
    return [{ label: "Download tileable", icon: "download", action: () => saveImage(tileableUrl(library.tileables, id, variant), `${variant ?? id}.png`) }]
  }
  const tiling = usePanel("tiling")
  const sources = computed(() => font.value?.mesh ? SOURCES.filter(source => source.value !== "custom") : SOURCES)
  const search = ref("")
  const tileSize = ref({ width: 16, height: 16 })
  const blocks = shallowRef(null)
  const blocksError = ref("")
  const choosingVersion = ref(false)
  const flatSize = ref(null)
  const customSize = ref(null)
  let blocksRequest = 0
  let sizeRequest = 0

  const usingMinecraft = computed(() => object.value.textureSource === "tileable" && object.value.tileableSource === "minecraft")
  const tiled = computed(() => object.value.textureSource === "tileable" || object.value.textureSource === "custom" && !!object.value.customTexture && object.value.customTextureMode === "tileable")
  const fitsFont = computed(() => !customSize.value || !flatSize.value || sameShape(customSize.value, flatSize.value))
  const modeHint = computed(() => ({
    standard: fitsFont.value ? "Painted onto the letters using the same layout as this font's flat texture." : "This image isn't the shape of this font's flat texture, so it won't line up with the letters.",
    tileable: "Repeated across the letters. The tiling settings are below.",
    strip: "Read from top to bottom as the top edge, the front and the bottom edge, then repeated along the line."
  })[object.value.customTextureMode])
  const textures = computed(() => {
    const entries = Object.entries(list.value?.textures ?? {})
    const statId = id => `${font.value?.id}.${id}`
    return popular(entries, ([id]) => statId(id), ([id, data]) => label(id, data), list.value ? pinnedTextures(list.value).map(statId) : [])
  })
  const tileables = computed(() => popular(Object.entries(library.tileables), ([id]) => `tileable.${id}`, ([id, data]) => label(id, data)))
  const blockEntries = computed(() => popular(Array.from(blocks.value ?? []).filter(([id, { opaque }]) => opaque || id === object.value.minecraftTexture).map(([id, { preview }]) => [id, { name: blockName(id), author: "Mojang", url: preview }]), ([id]) => minecraftStatId(id), ([, data]) => data.name))
  const jarProgress = computed(() => jar.total ? jar.done / jar.total : 0)
  const textureVariants = computed(() => Object.entries(list.value?.textures[object.value.texture]?.variants ?? {}))
  const tileableVariants = computed(() => Object.entries(library.tileables[object.value.tileable]?.variants ?? {}))

  function searchable(entries) {
    return entries.length > SEARCH_ABOVE
  }

  function searched(entries, selected) {
    const term = search.value.trim().toLowerCase()
    if (!searchable(entries) || !term) return entries
    return entries.filter(([id, data]) => id === selected || id.includes(term) || (data.name ?? "").toLowerCase().includes(term) || (data.category ?? "").toLowerCase().includes(term) || Object.keys(data.variants ?? {}).some(key => key.includes(term)))
  }

  const shownTextures = computed(() => searched(textures.value, object.value.texture))
  const shownTileables = computed(() => searched(tileables.value, object.value.tileable))
  const shownBlocks = computed(() => searched(blockEntries.value, object.value.minecraftTexture))

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

  function sameShape(a, b) {
    return Math.abs(a.width / a.height - b.width / b.height) < SAME_SHAPE
  }

  async function pickCustom(data) {
    const target = object.value
    const [upload, flat] = await Promise.all([image(data), image(`${font.value.sheetFolder}/textures/flat.png`)])
    target.customTexture = data
    target.customTextureMode = sameShape(upload, flat) ? "standard" : "tileable"
  }

  function blockTint(id) {
    return blocks.value?.get(id)?.tint ?? null
  }

  function retint(next) {
    const target = object.value
    const current = usingMinecraft.value ? blockTint(target.minecraftTexture) : null
    if (target.colour.toLowerCase() === WHITE || target.colour.toLowerCase() === current) target.colour = next ?? WHITE
  }

  function pickBlock(id) {
    retint(blockTint(id))
    object.value.minecraftTexture = id
  }

  function chooseSource(source) {
    search.value = ""
    if (source !== "tileable") retint(null)
    const fresh = source === "tileable" && untouchedTileable(object.value)
    setTexture(object.value, { textureSource: source })
    if (fresh) chooseTileables("minecraft")
  }

  async function chooseTileables(source) {
    search.value = ""
    if (source !== "minecraft") retint(null)
    const target = object.value
    if (source === "minecraft" && !target.minecraftVersion) {
      try {
        target.minecraftVersion = await latestRelease()
      } catch (err) {
        blocksError.value = `Could not load the Minecraft versions: ${err.message}`
      }
    }
    target.tileableSource = source
  }

  async function chooseVersion(version) {
    const target = object.value
    choosingVersion.value = false
    blocksError.value = ""
    try {
      const textures = await blockTextures(version)
      const solid = Array.from(textures.keys()).filter(id => textures.get(id).opaque)
      if (!solid.length) throw new Error(`Minecraft ${version} has no block textures without transparency`)
      if (!textures.has(target.minecraftTexture)) target.minecraftTexture = ["cobblestone", "stone"].find(id => solid.includes(id)) ?? solid[0]
      target.minecraftVersion = version
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
      if (request === blocksRequest) blocks.value = textures
    } catch (err) {
      if (request === blocksRequest) blocksError.value = `Could not load Minecraft ${object.value.minecraftVersion}: ${err.message}`
    }
  }, { immediate: true })

  watch(() => [tiled.value, object.value.textureSource, object.value.customTexture, object.value.tileableSource, object.value.tileable, object.value.tileableVariant, object.value.minecraftTexture, object.value.minecraftVersion, library.tileables], async () => {
    const target = object.value
    if (!tiled.value) return
    if (target.textureSource === "tileable" && target.tileableSource !== "minecraft" && !library.tileables[target.tileable]) return
    const request = ++sizeRequest
    const img = await (target.textureSource === "custom" ? image(target.customTexture) : target.tileableSource === "minecraft" ? blockTextureImage(target.minecraftVersion, target.minecraftTexture) : image(tileableUrl(library.tileables, target.tileable, target.tileableVariant)))
    if (request === sizeRequest) tileSize.value = { width: img.width, height: img.height }
  }, { immediate: true })

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
  <Panel title="Source" :modified="modified" @reset="reset">
    <div class="flow" :class="{ pick: object.textureSource === 'premade' || object.textureSource === 'tileable', peek: object.textureSource === 'tileable' }">
      <Segments :options="sources" :model-value="object.textureSource" @update:model-value="chooseSource" />

      <template v-if="object.textureSource === 'premade'">
        <input v-if="searchable(textures)" type="text" v-model="search" placeholder="Search textures">
        <div class="grid scroll">
          <Tile v-for="[id, data] of shownTextures" :key="id" :label="label(id, data)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id)" :author="credit(data, font?.id, library.fonts)" :badge="variantBadge(data)" :selected="object.texture === id" :menu="textureMenu(id, data)" @pick="setTexture(object, { texture: id, textureVariant: null })" />
        </div>
        <template v-if="textureVariants.length">
          <h3>Variants</h3>
          <div class="grid scroll variants" :style="{ '--rows': rows(textureVariants) }">
            <Tile :label="list.textures[object.texture].name ?? titleCase(object.texture)" :unit="thumbnailHeight(font)" :image="thumbnail(font, object.texture)" :selected="!object.textureVariant" :menu="textureMenu(object.texture, list.textures[object.texture])" @pick="setTexture(object, { textureVariant: null })" />
            <Tile v-for="[id, data] of textureVariants" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id)" :author="credit(data, font?.id, library.fonts, list.textures[object.texture])" :selected="object.textureVariant === id" :menu="textureMenu(id, { ...list.textures[object.texture], ...data })" @pick="setTexture(object, { textureVariant: id })" />
          </div>
        </template>
      </template>

      <Segments v-if="object.textureSource === 'tileable'" :options="TILEABLE_SOURCES" :model-value="object.tileableSource" @update:model-value="chooseTileables" />

      <template v-if="usingMinecraft">
        <button class="version" title="Choose a Minecraft version" @click="choosingVersion = true">
          <span>Minecraft {{ object.minecraftVersion }}</span>
          <Icon name="down" :size="16" />
        </button>
        <div v-if="jar.version" class="download">
          <span>Downloading Minecraft {{ jar.version }}</span>
          <div class="bar" role="progressbar" :aria-valuenow="Math.round(jarProgress * 100)" aria-valuemin="0" aria-valuemax="100"><div class="fill" :style="{ width: `${jarProgress * 100}%` }"></div></div>
        </div>
        <p v-if="blocksError" class="hint bad">{{ blocksError }}</p>
        <p v-else-if="blocks && !blockEntries.length" class="hint">This version has no block textures without transparency.</p>
        <template v-if="blockEntries.length">
          <input v-if="searchable(blockEntries)" type="text" v-model="search" placeholder="Search textures">
          <div class="grid scroll">
            <Tile v-for="[id, data] of shownBlocks" :key="id" :label="data.name" :pattern="{ backgroundImage: `url(${data.url})` }" :author="data.author" :selected="object.minecraftTexture === id" :menu="blockMenu(id, data)" @pick="pickBlock(id)" />
          </div>
        </template>
        <VersionDialog v-if="choosingVersion" :current="object.minecraftVersion" @pick="chooseVersion" @close="choosingVersion = false" />
      </template>

      <template v-if="object.textureSource === 'tileable' && !usingMinecraft">
        <input v-if="searchable(tileables)" type="text" v-model="search" placeholder="Search textures">
        <div class="grid scroll">
          <Tile v-for="[id, data] of shownTileables" :key="id" :label="label(id, data)" :pattern="tilePreview(library.tileables, id)" :author="data.author" :badge="variantBadge(data)" :selected="object.tileable === id" :menu="tileableMenu(id)" @pick="object.tileable = id; object.tileableVariant = null" />
        </div>
        <template v-if="tileableVariants.length">
          <h3>Variants</h3>
          <div class="grid scroll variants" :style="{ '--rows': rows(tileableVariants) }">
            <Tile :label="library.tileables[object.tileable].name" :pattern="tilePreview(library.tileables, object.tileable)" :selected="!object.tileableVariant" :menu="tileableMenu(object.tileable)" @pick="object.tileableVariant = null" />
            <Tile v-for="[id, data] of tileableVariants" :key="id" :label="data.name" :pattern="tilePreview(library.tileables, object.tileable, id)" :author="data.author ?? library.tileables[object.tileable].author" :selected="object.tileableVariant === id" :menu="tileableMenu(object.tileable, id)" @pick="object.tileableVariant = id" />
          </div>
        </template>
      </template>
    </div>

    <template v-if="object.textureSource === 'custom'">
      <div class="upload-preview">
        <img v-if="object.customTexture" :src="object.customTexture" alt="">
        <div v-else class="empty">No texture uploaded</div>
      </div>
      <label class="button wide">
        <Icon name="open" :size="16" />
        <span>{{ object.customTexture ? "Replace texture" : "Choose a PNG" }}</span>
        <input type="file" accept="image/png" @change="readFile($event, pickCustom)">
      </label>
      <template v-if="object.customTexture">
        <Segments label="Use as" :options="CUSTOM_MODES" v-model="object.customTextureMode" />
        <p class="hint" :class="{ bad: object.customTextureMode === 'standard' && !fitsFont }">{{ modeHint }}</p>
      </template>
      <p v-else class="hint">An image the shape of this font's flat texture is painted onto the letters. Anything else is tiled, or you can use it as a strip.</p>
    </template>

    <template v-if="object.textureSource === 'gradient'">
      <GradientEditor v-model="object.stops" :smooth="object.smooth" :angle="object.gradientAngle" :key="object.id" />
      <Toggle label="Smooth gradient" v-model="object.smooth" />
      <button class="wide" @click="spread">Spread evenly</button>
      <Slider label="Angle" v-model="object.gradientAngle" :min="0" :max="360" />
    </template>
  </Panel>

  <Panel v-if="tiled" title="Tiling" :modified="tiling.modified.value" @reset="tiling.reset">
    <Slider label="Scale" v-model="object.tileableScale" :min="0.25" :max="8" :steps="TILE_SCALES" />
    <Slider label="X offset" v-model="object.tileableXOffset" :min="0" :max="tileSize.width" />
    <Slider label="Y offset" v-model="object.tileableYOffset" :min="0" :max="tileSize.height" />
    <Toggle label="Random rotations" v-model="object.tileableRandomRotations" />
    <Toggle label="Random mirroring" v-model="object.tileableRandomMirroring" />
    <Toggle label="Tile the edges" hint="Repeats the texture on the top, bottom, side and inner faces" v-model="object.tileableTileEdges" />
    <Toggle label="Restart on each character" hint="Starts the texture again from the left of every character" v-model="object.tileablePerCharacter" />
  </Panel>
</template>

<style scoped>
  .pick {
    /* 42px is the Panel.vue header: 28px tall plus its 14px margin */
    height: max(520px, calc(100cqh - 42px - 2 * var(--group-padding)));
    container-type: inline-size;
  }

  .pick.peek {
    height: max(420px, calc(100cqh - 42px - 2 * var(--group-padding) - 120px));
  }

  .scroll {
    flex: 0 1 auto;
    align-content: start;
  }

  .version {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .download {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    font-size: var(--font-sm);
    color: var(--muted);
  }

  .bar {
    height: 8px;
    background: var(--field);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
  }

  .variants {
    --row: calc(((100cqw - 16px) / 3 - 16px) * 132 / 288 + 39px);
    --shown: min(var(--rows), 3);
    flex: 0 1000 auto;
    min-height: calc(var(--shown) * var(--row) + (var(--shown) - 1) * 8px);
  }
</style>
