<script setup>
  import { computed, ref, watch } from "vue"
  import { fontCredit } from "../../lib/credits.js"
  import { PREVIEW_DETAIL, customFontEntry, customFontKind, customThumbnail } from "../../lib/customFonts.js"
  import { loadImage } from "../../lib/font.js"
  import { usePanel } from "../../lib/panel.js"
  import { library } from "../../lib/scene.js"
  import { isCustomFont } from "../../lib/settings.js"
  import { popular } from "../../lib/stats.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Tile from "../Tile.vue"
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
    if (value === "custom" && object.value.customFont && !usingCustom.value) applyCustom(object.value.customFont)
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
      <button class="icon-button small" :class="{ active: info }" @click.stop="info = !info" title="Font info and characters"><Icon name="info" :size="17" /></button>
    </template>
    <Segments :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
    <div class="info" v-if="info && font">
      <p class="hint" v-if="font.description">{{ font.description }}</p>
      <div class="code">{{ characters }}</div>
    </div>
    <template v-if="tab === 'custom'">
      <Tile v-if="object.customFont" class="uploaded" keyboard :label="customName || object.customFont.fileName" :image="customImage" :unit="customUnit" :selected="usingCustom" @pick="applyCustom(object.customFont)" />
      <div v-else class="upload-preview">
        <div class="empty">No font uploaded</div>
      </div>
      <label class="button wide">
        <Icon name="open" :size="16" />
        <span>{{ loading ? "Loading..." : object.customFont ? "Replace font" : "Choose a font file" }}</span>
        <input type="file" accept=".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2" :disabled="loading" @change="upload">
      </label>
      <p v-if="customError" class="hint bad">{{ customError }}</p>
      <p v-else class="hint">A JSON from the font editor, a Minecraft ascii.png, or a .ttf, .otf, .woff or .woff2 font.</p>
      <template v-if="imported && usingCustom">
        <template v-if="object.customFont.kind === 'outline'">
          <Segments label="Build from" :options="BUILDS" :model-value="!!object.customFont.mesh" @update:model-value="changeImport('mesh', $event)" />
          <p class="hint">{{ object.customFont.mesh ? "Smooth edges that follow the font's own curves." : "Pixel cubes, like the other fonts." }}</p>
        </template>
        <label class="field">
          <span class="label">Height in pixels</span>
          <input type="number" min="1" :value="object.customFont.height" :disabled="loading" @change="setHeight">
        </label>
        <Toggle label="Use lowercase letters" hint="Titles use one case. Off uses the capital letters" :model-value="object.customFont.lowercase" @update:model-value="changeImport('lowercase', $event)" />
      </template>
    </template>
    <div v-else class="grid">
      <Tile v-for="data of baseFonts" :key="data.id" keyboard :label="data.name" :image="fontThumbnail(library.fonts, data.id)" :author="fontCredit(data, library.fonts)" :badge="variantBadges[data.id]" :selected="baseId === data.id" @pick="object.font = data.id" />
    </div>
    <template v-if="tab === 'published' && variants.length">
      <h3>Variants</h3>
      <div class="grid">
        <Tile keyboard label="Default" :image="fontThumbnail(library.fonts, baseId)" :selected="object.font === baseId" @pick="object.font = baseId" />
        <Tile v-for="data of variants" :key="data.id" keyboard :label="data.name" :image="fontThumbnail(library.fonts, data.id)" :author="fontCredit(data, library.fonts)" :selected="object.font === data.id" @pick="object.font = data.id" />
      </div>
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
  .uploaded :deep(.thumb) {
    aspect-ratio: auto;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: var(--card);
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
