<script setup>
  import { computed, onMounted, ref, shallowRef } from "vue"
  import Button from "../components/Button.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import NumberInput from "../components/NumberInput.vue"
  import SiteFooter from "../site/SiteFooter.vue"
  import Tile from "../components/Tile.vue"
  import TileGrid from "../components/TileGrid.vue"
  import UploadField from "../components/UploadField.vue"
  import { fullName, loadFontList } from "../lib/font/font.js"
  import { createFont } from "../lib/font/fontEditor.js"
  import { fontCredit } from "../lib/font/credits.js"
  import { fontThumbnail } from "../lib/state/ui.js"
  import { fontFromList, fontFromUploads, imageOf } from "./loaders.js"
  import SizeStats from "./SizeStats.vue"
  import ResetButton from "./ResetButton.vue"
  import { limitSize, resettable } from "./sizeLimit.js"
  import { navigate } from "../lib/state/navigation.js"
  import { EDITOR_PATH, IMPORT_PATH, font, importing, startFont } from "./store.js"
  import { loadTemplate } from "./template.js"

  const BLANK_SIZE = { height: 10, width: 6, grid: 4 }
  const SIZE_FIELDS = [{ key: "height", label: "Height" }, { key: "width", label: "Default width" }, { key: "grid", label: "Square size" }]

  const height = ref(BLANK_SIZE.height)
  const width = ref(BLANK_SIZE.width)
  const grid = ref(BLANK_SIZE.grid)
  const { mostRows, mostSquare } = limitSize(height, grid)
  const fonts = shallowRef([])
  const error = ref("")
  const busy = ref("")

  const final = computed(() => `${height.value * grid.value} pixels tall and ${width.value * grid.value} wide`)
  const startable = computed(() => fonts.value.filter(entry => !entry.inherits))
  const sizes = { height, width, grid }
  const { changed, reset } = resettable(sizes, BLANK_SIZE, ["height", "grid"])
  const valid = computed(() => [height.value, width.value, grid.value].every(value => Number.isInteger(value) && value >= 1))

  onMounted(async () => {
    try {
      fonts.value = await loadFontList()
    } catch (err) {
      error.value = err.message
    }
  })

  async function attempt(label, task) {
    error.value = ""
    busy.value = label
    try {
      startFont(await task())
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = ""
    }
  }

  function startBlank() {
    startFont(createFont({ height: height.value * grid.value, width: width.value * grid.value, grid: grid.value }))
  }

  function startFrom(entry) {
    attempt(`Opening ${entry.name}...`, () => fontFromList(entry, fonts.value))
  }

  function upload(event) {
    const { files } = event.target
    attempt("Opening your files...", () => fontFromUploads(files)).finally(() => event.target.value = "")
  }

  async function readImport(file) {
    if (/\.png$/i.test(file.name)) {
      const [{ asciiRows, fontFromAscii }, image] = await Promise.all([import("../lib/font/asciiImport.js"), imageOf(file)])
      const rows = asciiRows(image)
      return { kind: "ascii", name: file.name, image, suggested: { rows, square: Math.max(1, Math.ceil(40 / rows - 0.5)) }, build: fontFromAscii }
    }
    const [{ fontFromOutlines, outlineShape, suggestedSize }, { template, source }] = await Promise.all([import("../lib/font/fontImport.js"), loadTemplate(file)])
    return { kind: "outline", name: file.name, source, template, suggested: suggestedSize(source), build: fontFromOutlines, outlineShape }
  }

  async function importFile(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    const reading = { name: file.name }
    importing.value = reading
    navigate(IMPORT_PATH)
    try {
      const read = await readImport(file)
      if (importing.value === reading) importing.value = read
    } catch (err) {
      if (importing.value === reading) importing.value = { ...reading, error: err.message }
    }
  }
</script>

<template>
  <div class="start">
    <div class="content">
      <div v-if="font" class="saved">
        <div class="saved-text">
          <span class="saved-label">Your saved font</span>
          <strong class="saved-name">{{ font.name }}</strong>
        </div>
        <Button primary @click="navigate(EDITOR_PATH)"><template #icon><Icon name="open" :size="16" /></template>Open font</Button>
      </div>
      <div class="intro">
        <h1>Make a font</h1>
        <p>Draw every character yourself, or start from something that already exists. Your font stays in this browser until you download it.</p>
        <Notice v-if="error" class="error">{{ error }}</Notice>
        <p v-if="busy" class="busy">{{ busy }}</p>
      </div>

      <div class="choices">
        <section class="choice">
          <h2>Blank font</h2>
          <div class="numbers">
            <Field v-for="item of SIZE_FIELDS" :key="item.key" group :label="item.label" :label-for="`blank-${item.key}`">
              <template v-if="changed(item.key)" #label><ResetButton :title="`Reset to ${BLANK_SIZE[item.key]}`" @reset="reset(item.key)" /></template>
              <NumberInput :id="`blank-${item.key}`" min="1" :max="item.key === 'height' ? mostRows : item.key === 'grid' ? mostSquare : null" :model-value="sizes[item.key].value" @update:model-value="sizes[item.key].value = $event" />
            </Field>
          </div>
          <div class="stats">
            <SizeStats :pixels="valid ? height * grid : ''" />
          </div>
          <p class="hint">Height and width count squares, and one click paints one square. Square size is how many pixels each square is. Each character is {{ final }}.</p>
          <Button primary wide :disabled="!valid" @click="startBlank"><template #icon><Icon name="plus" /></template>Start drawing</Button>
        </section>

        <section class="choice">
          <h2>Open a saved font</h2>
          <p class="hint">Choose a JSON from this editor, a font.png, or both. Whatever's missing is worked out or left at its default.</p>
          <UploadField multiple accept=".png,.json,image/png,application/json" label="Choose files" empty="Drop a font JSON, a font.png, or both" @change="upload" />

          <h2 class="second">Import a font file</h2>
          <p class="hint">Turns a .ttf, .otf, .woff or .woff2, or a Minecraft ascii.png, into pixels ready for you to edit. You choose the size next, with a preview. The font file is kept as its template, so each character can go back to its imported shape and characters you add start from it.</p>
          <UploadField accept=".ttf,.otf,.woff,.woff2,.png,font/ttf,font/otf,font/woff,font/woff2,image/png" label="Choose font file" empty="Drop a font file or an ascii.png" @change="importFile" />
        </section>

        <section class="choice wide-choice">
          <h2>Start from a font</h2>
          <p class="hint">Copies its characters and settings into a new font of your own.</p>
          <TileGrid :min="170">
            <Tile v-for="entry of startable" :key="entry.id" :label="fullName(entry, fonts)" :image="fontThumbnail(entry.id)" :author="fontCredit(entry, fonts)" @pick="startFrom(entry)" />
          </TileGrid>
        </section>
      </div>
    </div>
    <SiteFooter />
  </div>
</template>

<style scoped>
  .start {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .content {
    flex: none;
    min-height: 100%;
    padding: 28px 16px 40px;
  }

  .saved {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    max-width: 1100px;
    margin: 0 auto 22px;
    padding: 14px 18px;
    background: var(--surface);
    border: 1px solid var(--accent);
  }

  .saved-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .saved-label {
    font-size: var(--font-sm);
    color: var(--muted);
  }

  .saved-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .intro {
    max-width: 1100px;
    margin: 0 auto 22px;
  }

  h1 {
    margin: 0 0 6px;
    font-size: 28px;
  }

  .intro p {
    margin: 0;
    color: var(--muted);
  }

  .intro .error {
    margin-top: 10px;
  }

  .intro .busy {
    margin-top: 10px;
    color: var(--accent);
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .wide-choice {
    grid-column: 1 / -1;
  }

  .second {
    margin-top: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }

  .numbers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .numbers .checkbox {
    align-self: end;
    padding-bottom: 9px;
  }

  @media (max-width: 800px) {
    .choices {
      grid-template-columns: minmax(0, 1fr);
    }

    .numbers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
