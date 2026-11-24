<script setup>
  import { ref } from "vue"
  import { fontCredit } from "../../lib/font/credits.js"
  import { fullName } from "../../lib/font/catalog.js"
  import { fontThumbnail } from "../../lib/font/thumbnailUrls.js"
  import { BUILDS, FONT_TABS, useFontSource } from "../../lib/panels/fontSource.js"
  import { library } from "../../lib/state/scene.js"
  import { leastRows, usePickFloor, variantRows } from "../../lib/panels/pickFloor.js"
  import FontBrowser from "./FontBrowser.vue"
  import GoogleFontList from "./GoogleFontList.vue"
  import Button from "../../components/Button.vue"
  import Field from "../../components/Field.vue"
  import FontInfoDialog from "./FontInfoDialog.vue"
  import Notice from "../../components/Notice.vue"
  import NumberInput from "../../components/NumberInput.vue"
  import Panel from "../Panel.vue"
  import Segments from "../../components/Segments.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"
  import UploadField from "../../components/UploadField.vue"
  import UploadReuse from "../../components/UploadReuse.vue"

  const info = ref(false)
  const browsing = ref(false)
  const { applyCustom, baseFonts, baseId, browsed, changeImport, chooseTab, clearCustom, customError, customImage, customName, customNote, customUnit, entry, font, foundFonts, googleLoading, imported, loading, modified, object, opened, pickGoogle, reset, reusable, search, searchable, searching, squares, tab, upload, uploaded, usingCustom, variantBadges, variants } = useFontSource()
  const { picker, floor } = usePickFloor(() => [tab.value, variants.value.length, search.value])

  function chooseFiles(event) {
    const files = Array.from(event.target.files)
    event.target.value = ""
    upload(files)
  }

  function setSize(event, key, fallback) {
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= 1) changeImport(key, value)
    else event.target.value = object.value.customFont[key] ?? fallback
  }
</script>

<template>
  <Panel title="Font" :modified="modified" @reset="reset">
    <template #actions>
      <Button ghost icon="info" title="Font info and characters" :disabled="!font" @click="info = true" />
    </template>
    <FontInfoDialog v-if="info && font" :font="font" :title="entry?.name || customName || 'Font'" @close="info = false" />
    <FontBrowser v-if="browsing" v-model:search="search" :kind="tab" :current="tab === 'google' ? (usingCustom ? object.customFont.google : null) : object.font" @pick="browsed" @close="browsing = false" />
    <div ref="picker" class="flow" :class="{ pick: tab !== 'custom', peek: tab !== 'custom' }" :style="tab === 'published' ? { minHeight: `${floor}px` } : null">
      <Segments :options="FONT_TABS" :model-value="tab" @update:model-value="chooseTab" />
      <template v-if="tab === 'custom'">
        <UploadField multiple accept=".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2" :label="loading ? 'Loading...' : uploaded ? 'Replace font' : 'Choose a font file'" empty="No font uploaded" :disabled="loading" :clearable="uploaded" :back="reusable.length > 0" @change="chooseFiles" @clear="clearCustom">
          <template v-if="uploaded" #preview>
            <div class="custom-font">
              <div class="preview picture"><img v-if="customImage" :src="customImage" alt="" :style="customUnit ? { height: `${customUnit}px` } : null"></div>
              <span class="name ellipsis">{{ customName || object.customFont.fileName }}</span>
            </div>
          </template>
        </UploadField>
        <Notice v-if="customError">{{ customError }}</Notice>
        <p v-else class="hint">A JSON from the font editor, a Minecraft ascii.png, a resource pack font JSON chosen together with its PNGs, or a .ttf, .otf, .woff or .woff2 font.</p>
        <p v-if="!customError && customNote?.text && customNote.data === object.customFont?.data" class="hint">{{ customNote.text }}</p>
        <template v-if="imported && usingCustom">
          <template v-if="object.customFont.kind === 'outline'">
            <Segments label="Build from" :options="BUILDS" :model-value="!!object.customFont.mesh" :hint="object.customFont.mesh ? `Smooth edges that follow the font's own curves.` : 'Pixel cubes, like the other fonts.'" @update:model-value="changeImport('mesh', $event)" />
          </template>
          <div class="sizes">
            <Field label="Height in pixels">
              <NumberInput min="1" :value="object.customFont.height" :disabled="loading" @change="setSize($event, 'height')" />
            </Field>
            <Field v-if="squares" label="Square size">
              <NumberInput min="1" :value="object.customFont.density ?? 1" :disabled="loading" @change="setSize($event, 'density', 1)" />
            </Field>
          </div>
          <p v-if="squares" class="hint">Square size is how many pixels each square is. 4 gives chunky squares like Minecraft Ten. Fonts drawn on a pixel grid keep their own.</p>
        </template>
        <UploadReuse :items="reusable" @pick="applyCustom" />
      </template>
      <template v-if="tab === 'google'">
        <div class="row">
          <input type="text" v-model="search" placeholder="Search Google Fonts" aria-label="Search Google Fonts" spellcheck="false">
          <Button icon="rows" title="Browse Google Fonts" @click="browsing = true" />
        </div>
        <Notice v-if="customError">{{ customError }}</Notice>
        <GoogleFontList :search="search" :current="usingCustom && object.customFont.google ? object.customFont : null" :opened="opened.google" :loading="googleLoading" @pick="pickGoogle" />
      </template>
      <template v-if="tab === 'published'">
        <div class="row">
          <input v-if="searchable" type="text" v-model="search" placeholder="Search fonts" aria-label="Search fonts">
          <div v-else class="grow"></div>
          <Button icon="rows" title="Browse fonts" @click="browsing = true" />
        </div>
        <TileGrid v-if="searching" class="scroll">
          <Tile v-for="data of foundFonts" :key="data.id" :label="fullName(data, library.fonts)" :image="fontThumbnail(data)" :author="fontCredit(data, library.fonts)" :selected="object.font === data.id" @pick="object.font = data.id" />
        </TileGrid>
        <TileGrid v-else class="scroll" :class="{ kept: variants.length }" :style="{ '--least': leastRows(baseFonts) }">
          <Tile v-for="data of baseFonts" :key="data.id" :label="data.name" :image="fontThumbnail(data)" :author="fontCredit(data, library.fonts)" :badge="variantBadges[data.id]" :selected="baseId === data.id" @pick="object.font = data.id" />
        </TileGrid>
        <template v-if="variants.length && !searching">
          <h3>Variants</h3>
          <TileGrid class="scroll variants" :style="{ '--rows': variantRows(variants) }">
            <Tile label="Default" :image="fontThumbnail(library.fonts.find(item => item.id === baseId) ?? { id: baseId })" :selected="object.font === baseId" @pick="object.font = baseId" />
            <Tile v-for="data of variants" :key="data.id" :label="data.name" :image="fontThumbnail(data)" :author="fontCredit(data, library.fonts)" :selected="object.font === data.id" @pick="object.font = data.id" />
          </TileGrid>
        </template>
      </template>
    </div>
  </Panel>
</template>

<style scoped>
  .sizes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
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
</style>
