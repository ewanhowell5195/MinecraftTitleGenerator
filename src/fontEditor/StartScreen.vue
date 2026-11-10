<script setup>
  import { computed, onMounted, ref, shallowRef } from "vue"
  import Button from "../components/Button.vue"
  import Checkbox from "../components/Checkbox.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import NumberInput from "../components/NumberInput.vue"
  import Tile from "../components/Tile.vue"
  import TileGrid from "../components/TileGrid.vue"
  import { fullName, loadFontList } from "../lib/font.js"
  import { createFont } from "../lib/fontEditor.js"
  import { fontCredit } from "../lib/credits.js"
  import { fontThumbnail } from "../lib/ui.js"
  import { fontFromList, fontFromUploads, imageOf } from "./loaders.js"
  import { openFont } from "./store.js"

  const height = ref(10)
  const width = ref(6)
  const grid = ref(4)
  const importHeight = ref(40)
  const importDensity = ref(1)
  const lowercase = ref(false)
  const fonts = shallowRef([])
  const error = ref("")
  const busy = ref("")

  const final = computed(() => `${height.value * grid.value} pixels tall and ${width.value * grid.value} wide`)
  const startable = computed(() => fonts.value.filter(entry => !entry.inherits))
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
      openFont(await task())
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = ""
    }
  }

  function startBlank() {
    openFont(createFont({ height: height.value * grid.value, width: width.value * grid.value, grid: grid.value }))
  }

  function startFrom(entry) {
    attempt(`Opening ${entry.name}...`, () => fontFromList(entry, fonts.value))
  }

  function upload(event) {
    const { files } = event.target
    attempt("Opening your files...", () => fontFromUploads(files)).finally(() => event.target.value = "")
  }

  function importFile(event) {
    const file = event.target.files[0]
    if (!file) return
    attempt(`Importing ${file.name}...`, async () => {
      const options = { height: importHeight.value, lowercase: lowercase.value }
      if (/\.png$/i.test(file.name)) {
        const [{ fontFromAscii }, image] = await Promise.all([import("../lib/asciiImport.js"), imageOf(file)])
        return fontFromAscii(image, options)
      }
      const { fontFromOutlines, parseFontFile } = await import("../lib/fontImport.js")
      return fontFromOutlines(await parseFontFile(await file.arrayBuffer()), { ...options, density: importDensity.value })
    }).finally(() => event.target.value = "")
  }
</script>

<template>
  <div class="start">
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
          <Field label="Height"><NumberInput min="1" v-model.number="height" /></Field>
          <Field label="Default width"><NumberInput min="1" v-model.number="width" /></Field>
          <Field label="Square size"><NumberInput min="1" v-model.number="grid" /></Field>
        </div>
        <p class="hint">Height and width count squares, and one click paints one square. Square size is how many pixels each square is. Each character is {{ final }}.</p>
        <Button primary wide :disabled="!valid" @click="startBlank"><template #icon><Icon name="plus" /></template>Start drawing</Button>
      </section>

      <section class="choice">
        <h2>Open a saved font</h2>
        <p class="hint">Choose a JSON from this editor, a font.png, or both. Whatever's missing is worked out or left at its default.</p>
        <Button file wide multiple accept=".png,.json,image/png,application/json" @change="upload"><template #icon><Icon name="open" /></template>Choose files</Button>

        <h2 class="second">Import a font file</h2>
        <p class="hint">Turns a .ttf, .otf, .woff or .woff2, or a Minecraft ascii.png, into pixels at this height, ready for you to edit. Square size is how many pixels each square is, for font files that aren't already drawn on a pixel grid. Each character can go back to its imported shape.</p>
        <div class="numbers import">
          <Field label="Height in pixels"><NumberInput min="1" v-model.number="importHeight" /></Field>
          <Field label="Square size"><NumberInput min="1" v-model.number="importDensity" /></Field>
          <Checkbox v-model="lowercase" label="Use lowercase letters" />
        </div>
        <Button file wide accept=".ttf,.otf,.woff,.woff2,.png,font/ttf,font/otf,font/woff,font/woff2,image/png" @change="importFile"><template #icon><Icon name="open" /></template>Choose font file</Button>
      </section>

      <section class="choice wide-choice">
        <h2>Start from a font</h2>
        <p class="hint">Copies its characters and settings into a new font of your own.</p>
        <TileGrid :min="170">
          <Tile v-for="entry of startable" :key="entry.id" :label="fullName(entry, fonts)" :image="fontThumbnail(fonts, entry.id)" :author="fontCredit(entry, fonts)" @pick="startFrom(entry)" />
        </TileGrid>
      </section>
    </div>
  </div>
</template>

<style scoped>
  .start {
    flex: 1;
    overflow-y: auto;
    padding: 28px 16px 40px;
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

  .numbers.import {
    align-items: end;
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
