<script>
  const publishedFonts = new Map()
</script>

<script setup>
  import { computed, ref, watch } from "vue"
  import { fontCredit } from "../../lib/credits.js"
  import { PREVIEW_DETAIL, customFontEntry, customFontKind, customThumbnail } from "../../lib/customFonts.js"
  import { loadImage } from "../../lib/font.js"
  import { usePanel } from "../../lib/panel.js"
  import { library } from "../../lib/scene.js"
  import { DEFAULT_FONT, isCustomFont } from "../../lib/settings.js"
  import { popular } from "../../lib/stats.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import Button from "../Button.vue"
  import Field from "../Field.vue"
  import Icon from "../Icon.vue"
  import Notice from "../Notice.vue"
  import NumberInput from "../NumberInput.vue"
  import Panel from "../Panel.vue"
  import RenderDialog from "../RenderDialog.vue"
  import Segments from "../Segments.vue"
  import Tile from "../Tile.vue"
  import TileGrid from "../TileGrid.vue"
  import Toggle from "../Toggle.vue"

  const TABS = [{ value: "published", label: "All fonts" }, { value: "custom", label: "Custom" }]
  const IMPORT_HEIGHT = 40
  const BUILDS = [{ value: false, label: "Cubes" }, { value: true, label: "Mesh" }]

  const info = ref(false)
  const { object, font, modified, reset } = usePanel("font")
  const tab = ref(isCustomFont(object.value.font) ? "custom" : "published")
  const customName = ref("")
  const customImage = ref(null)
  const customUnit = ref(null)
  const customError = ref("")
  const loading = ref(false)
  const usingCustom = computed(() => isCustomFont(object.value.font) && !!object.value.customFont)
  const imported = computed(() => object.value.customFont && object.value.customFont.kind !== "json")
  const squares = computed(() => object.value.customFont?.kind === "outline" && !object.value.customFont.mesh)
  const terminators = usePanel("terminators")
  const creeper = usePanel("creeper")
  const hasTerminators = computed(() => font.value && font.value.glyphs["┫"] && font.value.glyphs["┣"] && !font.value.forcedTerminators)
  const hasCreeper = computed(() => !!font.value?.glyphs["\u{1F633}"])
  const entry = computed(() => library.fonts.find(item => item.id === object.value.font))
  const baseId = computed(() => entry.value?.variant ?? object.value.font)
  const baseFonts = computed(() => popular(library.fonts.filter(item => !item.variant), item => item.id, item => item.name, ["minecraft-ten"]))
  const variants = computed(() => popular(library.fonts.filter(item => item.variant === baseId.value), item => item.id, item => item.name))

  const characters = computed(() => {
    if (!font.value) return ""
    const rank = char => /[a-z]/i.test(char) ? 0 : /\d/.test(char) ? 1 : 2
    return Object.keys(font.value.glyphs).filter(char => !/[\u{1F629}\u{1F633}]/u.test(char)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(" ")
  })

  async function applyCustom(source) {
    const target = object.value
    loading.value = true
    customError.value = ""
    try {
      const entry = await customFontEntry(source)
      target.customFont = source
      target.font = entry.id
    } catch (err) {
      customError.value = `Couldn't use this font: ${err.message}`
    } finally {
      loading.value = false
    }
  }

  function chooseTab(value) {
    tab.value = value
    if (value === "custom") {
      if (!isCustomFont(object.value.font)) publishedFonts.set(object.value.id, object.value.font)
      if (object.value.customFont && !usingCustom.value) applyCustom(object.value.customFont)
    } else if (isCustomFont(object.value.font)) {
      object.value.font = publishedFonts.get(object.value.id) ?? DEFAULT_FONT
    }
  }

  function upload(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    const kind = customFontKind(file.name)
    if (!kind) {
      customError.value = "Choose a .json, .png, .ttf, .otf, .woff or .woff2 file."
      return
    }
    const reader = new FileReader()
    reader.onload = () => applyCustom({ kind, fileName: file.name, data: reader.result, height: IMPORT_HEIGHT, lowercase: false })
    reader.readAsDataURL(file)
  }

  function changeImport(key, value) {
    if (value === object.value.customFont[key]) return
    applyCustom({ ...object.value.customFont, [key]: value })
  }

  function setHeight(event) {
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= 1) changeImport("height", value)
    else event.target.value = object.value.customFont.height
  }

  function setDensity(event) {
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= 1) changeImport("density", value)
    else event.target.value = object.value.customFont.density ?? 1
  }

  watch(() => object.value.customFont, async source => {
    customName.value = ""
    customImage.value = null
    customUnit.value = null
    if (!source) return
    try {
      const entry = await customFontEntry(source)
      customName.value = entry.name
      const detailed = customThumbnail(entry.id, "preview")
      const image = detailed ?? customThumbnail(entry.id, "flat")
      customUnit.value = image && (await loadImage(image)).height * (detailed ? 1 : PREVIEW_DETAIL)
      customImage.value = image
    } catch (err) {
      customError.value = `Couldn't use this font: ${err.message}`
    }
  }, { immediate: true })

  watch(() => object.value.id, () => {
    tab.value = isCustomFont(object.value.font) ? "custom" : "published"
    customError.value = ""
  })

  const variantBadges = computed(() => {
    const badges = {}
    for (const item of library.fonts) {
      if (item.variant) badges[item.variant] = (badges[item.variant] ?? 1) + 1
    }
    return badges
  })
</script>

<template>
  <Panel title="Font" :modified="modified" @reset="reset">
    <template #actions>
      <Button ghost :disabled="!font" @click="info = true" v-tooltip="'Font info and characters'" aria-label="Font info and characters"><template #icon><Icon name="info" :size="17" /></template></Button>
    </template>
    <RenderDialog v-if="info && font" :title="entry?.name || customName || 'Font'" close-title="Close" wide dismissable @close="info = false">
      <div class="dialog-body">
        <p v-if="font.description">{{ font.description }}</p>
        <span class="label">Characters</span>
        <div class="code">{{ characters }}</div>
      </div>
    </RenderDialog>
    <Segments :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
    <template v-if="tab === 'custom'">
      <div v-if="object.customFont" class="custom-font">
        <div class="preview picture"><img v-if="customImage" :src="customImage" alt="" :style="customUnit ? { height: `${customUnit}px` } : null"></div>
        <span class="name ellipsis">{{ customName || object.customFont.fileName }}</span>
      </div>
      <div v-else class="upload-preview">
        <div class="empty-state">No font uploaded</div>
      </div>
      <Button file wide accept=".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2" :disabled="loading" @change="upload"><template #icon><Icon name="open" :size="16" /></template>
        <span>{{ loading ? "Loading..." : object.customFont ? "Replace font" : "Choose a font file" }}</span>
        
      </Button>
      <Notice v-if="customError">{{ customError }}</Notice>
      <p v-else class="hint">A JSON from the font editor, a Minecraft ascii.png, or a .ttf, .otf, .woff or .woff2 font.</p>
      <template v-if="imported && usingCustom">
        <template v-if="object.customFont.kind === 'outline'">
          <Segments label="Build from" :options="BUILDS" :model-value="!!object.customFont.mesh" @update:model-value="changeImport('mesh', $event)" />
          <p class="hint">{{ object.customFont.mesh ? "Smooth edges that follow the font's own curves." : "Pixel cubes, like the other fonts." }}</p>
        </template>
        <div class="sizes">
          <Field label="Height in pixels">
            <NumberInput min="1" :value="object.customFont.height" :disabled="loading" @change="setHeight" />
          </Field>
          <Field v-if="squares" label="Square size">
            <NumberInput min="1" :value="object.customFont.density ?? 1" :disabled="loading" @change="setDensity" />
          </Field>
        </div>
        <p v-if="squares" class="hint">Square size is how many pixels each square is. 4 gives chunky squares like Minecraft Ten. Fonts drawn on a pixel grid keep their own.</p>
        <Toggle label="Use lowercase letters" hint="Titles use one case. Off uses the capital letters" :model-value="object.customFont.lowercase" @update:model-value="changeImport('lowercase', $event)" />
      </template>
    </template>
    <TileGrid v-else>
      <Tile v-for="data of baseFonts" :key="data.id" :label="data.name" :image="fontThumbnail(library.fonts, data.id)" :author="fontCredit(data, library.fonts)" :badge="variantBadges[data.id]" :selected="baseId === data.id" @pick="object.font = data.id" />
    </TileGrid>
    <template v-if="tab === 'published' && variants.length">
      <h3>Variants</h3>
      <TileGrid>
        <Tile label="Default" :image="fontThumbnail(library.fonts, baseId)" :selected="object.font === baseId" @pick="object.font = baseId" />
        <Tile v-for="data of variants" :key="data.id" :label="data.name" :image="fontThumbnail(library.fonts, data.id)" :author="fontCredit(data, library.fonts)" :selected="object.font === data.id" @pick="object.font = data.id" />
      </TileGrid>
    </template>
  </Panel>
  <Panel v-if="hasCreeper" title="Creeper face" :modified="creeper.modified.value" @reset="creeper.reset">
    <Toggle label="Creeper face on A" hint="Every a gets the creeper face. Split a word off to set it for just part of the text" v-model="object.creeperFace" />
  </Panel>
  <Panel v-if="hasTerminators" title="Terminators" :modified="terminators.modified.value" @reset="terminators.reset">
    <Toggle label="Line terminators" hint="Adds the end pieces either side of the text" v-model="object.terminators" />
  </Panel>
</template>

<style scoped>
  .sizes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .sizes input {
    width: 100%;
  }

  .custom-font {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 10px 10px;
    background: var(--field);
  }

  .preview {
    width: 100%;
    min-height: 48px;
  }

  .name {
    max-width: 100%;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text);
  }

  .code {
    padding: 10px;
    font-family: var(--mono);
    font-size: var(--font-md);
    line-height: 1.7;
    word-break: break-all;
    color: var(--text);
    background: var(--field);
  }
</style>
