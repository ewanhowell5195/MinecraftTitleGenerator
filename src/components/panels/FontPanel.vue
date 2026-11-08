<script setup>
  import { computed, ref, watch } from "vue"
  import { fontCredit } from "../../lib/credits.js"
  import { customFontEntry, customFontKind } from "../../lib/customFonts.js"
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
  const KIND_NAMES = { json: "Font editor JSON", ascii: "Minecraft ascii.png", outline: "Font file" }
  const IMPORT_HEIGHT = 40

  const info = ref(false)
  const { object, font, modified, reset } = usePanel("font")
  const tab = ref(isCustomFont(object.value.font) ? "custom" : "published")
  const customName = ref("")
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

  function upload(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    const kind = customFontKind(file.name)
    if (!kind) {
      customError.value = "Choose a .json, .png, .ttf, .otf or .woff file."
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
    if (!source) return
    try {
      customName.value = (await customFontEntry(source)).name
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
    <Segments :options="TABS" v-model="tab" />
    <div class="info" v-if="info && font">
      <p class="hint" v-if="font.description">{{ font.description }}</p>
      <div class="code">{{ characters }}</div>
    </div>
    <template v-if="tab === 'custom'">
      <div class="upload-preview custom">
        <template v-if="object.customFont">
          <strong>{{ customName || object.customFont.fileName }}</strong>
          <span>{{ KIND_NAMES[object.customFont.kind] }}, {{ object.customFont.fileName }}</span>
        </template>
        <div v-else class="empty">No font uploaded</div>
      </div>
      <button v-if="object.customFont && !usingCustom" class="wide primary" @click="applyCustom(object.customFont)">Use {{ customName || object.customFont.fileName }}</button>
      <label class="button wide">
        <Icon name="open" :size="16" />
        <span>{{ loading ? "Loading..." : object.customFont ? "Replace font" : "Choose a font file" }}</span>
        <input type="file" accept=".json,.png,.ttf,.otf,.woff,application/json,image/png,font/ttf,font/otf,font/woff" :disabled="loading" @change="upload">
      </label>
      <p v-if="customError" class="hint bad">{{ customError }}</p>
      <p v-else class="hint">A JSON from the font editor, a Minecraft ascii.png, or a .ttf, .otf or .woff font. Uploaded fonts stay out of presets and share links.</p>
      <template v-if="imported && usingCustom">
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
  .custom {
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .custom strong {
    font-size: var(--font-base);
  }

  .custom span {
    font-size: var(--font-sm);
    color: var(--muted);
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
